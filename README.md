# JSON Base v2.0.0

## 📁 项目结构

```
src/
├── api/                    # 后端 API 路由和控制器
│   ├── controllers.ts       # 数据和健康检查控制器
│   └── router.ts          # 主路由器
├── components/             # 前端 React 组件
│   ├── DeploymentGuide.tsx  # 部署引导组件
│   └── WebUIConsole.tsx   # WebUI 控制台组件
├── hooks/                 # React Hooks
│   ├── useApi.ts          # API 调用 Hook
│   └── useTheme.ts        # 主题切换 Hook
├── services/              # 后端服务层
│   └── storage.ts         # KV 存储服务
├── stores/               # 状态管理（MobX）
│   └── AppStore.ts       # 应用状态
├── styles/               # 样式文件
│   ├── App.less          # 主应用样式
│   ├── WebUIConsole.less # 控制台样式
│   └── index.less       # 基础样式
├── types/                # TypeScript 类型定义
│   └── index.ts         # 共享类型
├── utils/                # 工具函数
│   ├── config.ts         # 配置管理
│   ├── middleware.ts     # 中间件（认证、验证等）
│   └── response.ts       # 响应构建器
├── App.tsx              # 主应用组件
├── index.ts             # Worker 入口文件
└── main.tsx             # React 应用入口
```

## 🏗️ 架构特点

### 前后端分离
- **后端**: 纯 API 服务，专注于数据处理和业务逻辑
- **前端**: 独立的 React SPA，通过 API 与后端通信

### 模块化设计
- **控制器**: 处理 HTTP 请求和响应
- **服务**: 业务逻辑封装
- **中间件**: 认证、验证、日志等横切关注点
- **类型**: 共享类型定义，确保类型安全

### 生产级特性
- ✅ **类型安全**: 完整的 TypeScript 支持
- ✅ **错误处理**: 统一的错误处理机制
- ✅ **日志系统**: 结构化日志记录
- ✅ **认证授权**: Bearer Token 和 Query 参数支持
- ✅ **速率限制**: API 调用频率控制
- ✅ **CORS 支持**: 跨域请求处理
- ✅ **输入验证**: 请求参数和数据验证

## 🚀 API 端点

### 核心功能
- `GET /api/health` - 健康检查
- `GET /api/data/test` - API 测试
- `GET /api/data` - 列出所有数据（支持分页）
- `GET /api/data/{path}` - 获取指定路径的数据
- `POST /api/data/{path}` - 创建新数据
- `PUT /api/data/{path}` - 更新现有数据
- `DELETE /api/data/{path}` - 删除数据

### 认证方式
```bash
# Bearer Token
Authorization: Bearer YOUR_API_KEY

# 查询参数
?key=YOUR_API_KEY
```

## 🛠️ 开发环境

### 本地开发
```bash
# 安装依赖
npm install

# 启动 Worker 开发服务器
npm run dev

# 启动 WebUI 开发服务器
npm run webui

# 构建 Worker
npm run build:worker

# 构建 WebUI
npm run build:webui

# 构建所有
npm run build:all
```

### 部署
```bash
# 部署到 Cloudflare Workers
npm run deploy
```

## ⚙️ 配置

### 环境变量
```toml
# wrangler.toml
[vars]
ENVIRONMENT = "production"
VERSION = "2.0.0"
```

### TypeScript 配置
- 严格模式启用
- 路径别名支持 (`@/`, `@/types/` 等)
- 目标 ES2022，支持现代语法

## 🎨 前端特性

### UI 组件
- 基于 RSuite 5.x 构建
- 响应式设计
- 深色/浅色主题切换
- 国际化支持

### 功能模块
- **数据管理**: CRUD 操作界面
- **控制台**: API 测试工具
- **设置**: 配置和偏好设置
- **部署引导**: 一键部署向导

### 状态管理
- MobX for reactive state
- 本地存储持久化
- API 调用缓存

## 🔧 技术栈

### 后端
- **Runtime**: Cloudflare Workers
- **Language**: TypeScript
- **Storage**: Cloudflare KV
- **Framework**: 自研轻量级框架

### 前端
- **Framework**: React 19.x
- **UI Library**: RSuite 5.x
- **State**: MobX 6.x
- **Styling**: Less
- **Build Tool**: Vite 7.x

### DevOps
- **Deployment**: Wrangler CLI
- **Type Checking**: TypeScript
- **Package Manager**: npm

## 📊 性能优化

### Worker 优化
- 冷启动优化
- 内存使用控制
- 响应缓存策略

### 前端优化
- 代码分割
- 懒加载
- 资源压缩
- 缓存策略

## 🔒 安全考虑

### API 安全
- API Key 认证
- 速率限制
- 输入验证
- CORS 策略
- 错误信息脱敏

### 前端安全
- XSS 防护
- 敏感信息加密存储
- CSP 策略

## 📈 监控和日志

### 结构化日志
```typescript
Logger.info('Request completed', {
  method: 'GET',
  url: '/api/data/test',
  status: 200,
  duration: '45ms'
})
```

### 健康检查
- KV 连接状态
- 内存使用情况
- 响应时间监控

## 🧪 测试

### 开发测试
```bash
# 健康检查测试
curl https://your-worker.workers.dev/api/health

# API 测试
curl -X GET "https://your-worker.workers.dev/api/data/test" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 📚 使用示例

### 存储数据
```bash
curl -X POST "https://your-worker.workers.dev/api/data/demo/user" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "John", "age": 30}'
```

### 获取数据
```bash
curl -X GET "https://your-worker.workers.dev/api/data/demo/user" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 🔮 路线图

### v2.1.0
- [ ] WebSocket 支持
- [ ] 文件上传优化
- [ ] 批量操作 API

### v2.2.0
- [ ] 用户权限系统
- [ ] 数据加密
- [ ] 备份和恢复

## 📄 许可证

MIT License

---

**JSON Base v2.0.0** - 现代、可靠、易用的 JSON 存储服务
