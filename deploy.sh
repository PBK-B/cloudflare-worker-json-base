#!/bin/bash

set -e

echo "🚀 JSON Base 部署脚本"
echo "====================="
echo "使用 wrangler secret 管理 API Key"
echo "使用 Automatic Provisioning 自动创建 D1 数据库"

if [ -z "$API_KEY" ]; then
    echo ""
    echo "错误: 请设置 API_KEY 环境变量"
    echo ""
    echo "生成随机 API_KEY:"
    echo "  API_KEY=\$(openssl rand -base64 32)"
    echo ""
    echo "示例用法:"
    echo "  API_KEY=\$(openssl rand -base64 32) ./deploy.sh"
    echo "  API_KEY=your_key DEPLOY_ENV=production ./deploy.sh"
    exit 1
fi

export DEPLOY_ENV="${DEPLOY_ENV:-development}"
export STORAGE_BACKEND="d1"

if [ -z "$DASH_ROUTE" ]; then
    echo ""
    echo "错误: 请设置 DASH_ROUTE 环境变量 (例如: dash.yourdomain.dev)"
    echo ""
    echo "示例用法:"
    echo "  DASH_ROUTE=dash.example.com ./deploy.sh"
    echo "  API_KEY=xxx DASH_ROUTE=dash.example.com DEPLOY_ENV=production ./deploy.sh"
    exit 1
fi

echo ""
echo "部署环境: $DEPLOY_ENV"
echo "Dash 路由: $DASH_ROUTE"
echo ""

npm run build:all

echo ""
echo "配置 wrangler secrets..."
if [ "$DEPLOY_ENV" = "production" ]; then
    echo "$API_KEY" | wrangler secret put API_KEY --env production
else
    echo "$API_KEY" | wrangler secret put API_KEY --env development
fi

echo ""
echo "更新 .dev.vars 用于本地开发..."
sed -i "s/^API_KEY=.*/API_KEY=$API_KEY/" .dev.vars

echo ""
echo "生成 wrangler 配置 (包含 dash 路由和 assets)..."
STORAGE_BACKEND="d1"

WORKER_NAME=$(grep -A1 "^\[env.$DEPLOY_ENV\]" wrangler.toml 2>/dev/null | grep "name" | cut -d'"' -f2 || echo "worker-json-base-$DEPLOY_ENV")

cat > wrangler-deploy.toml << EOF
name = "$WORKER_NAME"
main = "dist/index.js"
compatibility_date = "2024-05-02"
compatibility_flags = ["nodejs_compat"]

[vars]
ENVIRONMENT = "$DEPLOY_ENV"
STORAGE_BACKEND = "$STORAGE_BACKEND"

[[d1_databases]]
binding = "JSONBASE_DB"
database_name = "jsonbase001"

[assets]
directory = "dist-webui"
binding = "WEBUI"
EOF

echo ""
echo "部署 Worker..."
if [ "$DEPLOY_ENV" = "production" ]; then
    DEPLOY_OUTPUT=$(wrangler deploy --config wrangler-deploy.toml -e production 2>&1)
else
    DEPLOY_OUTPUT=$(wrangler deploy --config wrangler-deploy.toml 2>&1)
fi
echo "$DEPLOY_OUTPUT"

WORKER_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE "https://[^[:space:]]*\.workers\.dev" | head -1 || echo "https://$WORKER_NAME.workers.dev")

echo ""
echo "🎉 部署完成!"
echo ""
echo "Worker URL: $WORKER_URL"
echo "后续操作:"
echo "  - 查看 Worker: https://workers.cloudflare.com"
echo "  - 查看 D1 数据库: https://dash.cloudflare.com/account/workers/d1"
echo ""
echo "更新 API Key:"
echo "  echo 'new-key' | wrangler secret put API_KEY${DEPLOY_ENV:+ --env $DEPLOY_ENV}"

rm -f wrangler-deploy.toml
