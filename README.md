# JSON Base v2.0.0

Cloudflare Workers + D1/KV 混合存储的 JSON 和文件存储服务。

## 功能特性

- **资源路径 API**: 直接对存储桶中的资源进行 CRUD 操作
- **文件上传**: 支持任意文件类型的上传和下载
- **混合存储**: 支持 D1 数据库和 KV 存储后端
- **认证授权**: Bearer Token 和查询参数认证
- **速率限制**: API 调用频率控制
- **控制台**: WebUI 管理界面

## 快速开始

### 安装依赖

```bash
npm install
```

### 本地开发

```bash
# 启动 Worker 开发服务器
npm run dev

# 启动 WebUI 开发服务器（可选）
npm run webui
```

### 部署

```bash
npm run deploy
```

## 项目结构

```
src/
├── api/                          # API 路由和控制器
│   ├── router.ts                 # 主路由处理器
│   ├── controllers.ts            # 数据控制器
│   ├── resourceController.ts     # 资源 CRUD 控制器
│   ├── storageController.ts      # 存储控制器
│   ├── consoleController.ts      # 控制台控制器
│   └── dataAccessController.ts   # 数据访问控制器
│
├── storage/                      # 存储层
│   ├── storageAdapter.ts         # 统一存储接口
│   ├── fileStorageService.ts     # 文件存储服务
│   ├── pathMapper.ts             # 路径映射
│   ├── interfaces.ts             # 存储接口定义
│   ├── metadata/                 # 元数据管理
│   │   └── metadataManager.ts    # D1 元数据管理器
│   └── providers/                # 存储提供者
│       ├── d1StorageProvider.ts  # D1 存储实现
│       └── kvStorageProvider.ts  # KV 存储实现
│
├── database/                     # 数据库层
│   ├── d1Service.ts              # D1 数据库服务
│   ├── hybridStorageService.ts   # 混合存储服务
│   ├── schema.sql                # 数据库 schema
│   └── index.ts                  # 模块导出
│
├── utils/                        # 工具函数
│   ├── middleware.ts             # 中间件（认证、日志）
│   ├── response.ts               # 响应构建器
│   ├── config.ts                 # 配置管理
│   └── notification.tsx          # 通知组件
│
├── types/                        # 类型定义
│   ├── index.ts                  # 共享类型
│   └── storage.ts                # 存储相关类型
│
├── pages/                        # 前端页面
│   ├── LoginPage.tsx             # 登录页面
│   └── admin/                    # 管理页面
│       ├── AdminLayout.tsx       # 管理布局
│       ├── AdminConsolePage.tsx  # 控制台页面
│       └── AdminDataPage.tsx     # 数据管理页面
│
├── components/                   # React 组件
│   ├── DeploymentGuide.tsx       # 部署引导
│   ├── AutoDeployment.tsx        # 自动部署
│   └── common/                   # 通用组件
│       └── ModalForm.tsx         # 模态表单
│
├── hooks/                        # React Hooks
│   ├── useApi.ts                 # API 调用
│   └── useTheme.ts               # 主题切换
│
├── stores/                       # 状态管理
│   ├── AppStore.ts               # 应用状态
│   └── ConfigManager.ts          # 配置管理
│
├── context/                      # React 上下文
│   └── AuthContext.tsx           # 认证上下文
│
├── __tests__/                    # 测试文件
│   ├── worker/                   # 后端测试
│   ├── webui/                    # 前端测试
│   └── mocks/                    # 测试 mock
│
├── App.tsx                       # 主应用组件
├── index.ts                      # Worker 入口
└── main.tsx                      # React 入口
```

## API 端点

### 资源路径 API（推荐）

| 方法 | 端点 | 功能 | 响应格式 |
|------|------|------|---------|
| GET | `/{bucket}/{path}` | 读取资源 | 原始内容 |
| POST | `/{bucket}/{path}` | 创建/上传资源 | `{"status": 1, "message": "storage ok"}` |
| PUT | `/{bucket}/{path}` | 更新资源 | `{"status": 1, "message": "storage ok"}` |
| DELETE | `/{bucket}/{path}` | 删除资源 | `{"status": 1, "message": "storage ok"}` |

### API 路径

| 方法 | 端点 | 功能 |
|------|------|------|
| GET | `/._jsondb_/api/data` | 列出所有数据 |
| GET | `/._jsondb_/api/data/{path}` | 获取数据 |
| POST | `/._jsondb_/api/data/{path}` | 创建数据 |
| PUT | `/._jsondb_/api/data/{path}` | 更新数据 |
| DELETE | `/._jsondb_/api/data/{path}` | 删除数据 |
| GET | `/._jsondb_/api/health` | 健康检查 |
| GET | `/._jsondb_/api/storage` | 存储管理 |

### 认证

所有 API 端点都需要认证：

```bash
# Bearer Token（推荐）
Authorization: Bearer YOUR_API_KEY

# 查询参数
?key=YOUR_API_KEY
```

## 使用示例

### 创建 JSON 数据

```bash
curl --location --request POST 'https://your-worker.workers.dev/demo_bucket/hello' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{"hello": "world"}'
```

### 上传文件

```bash
curl --location --request POST 'https://your-worker.workers.dev/demo_bucket/logo.svg' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --header 'Content-Type: image/svg+xml' \
  --data-binary '@/path/to/logo.svg'
```

### 读取资源

```bash
curl --location --request GET 'https://your-worker.workers.dev/demo_bucket/hello' \
  --header 'Authorization: Bearer YOUR_API_KEY'
```

### 更新资源

```bash
curl --location --request PUT 'https://your-worker.workers.dev/demo_bucket/hello' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{"hello": "updated"}'
```

### 删除资源

```bash
curl --location --request DELETE 'https://your-worker.workers.dev/demo_bucket/hello' \
  --header 'Authorization: Bearer YOUR_API_KEY'
```

## 开发

### 命令

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

# 类型检查
npm run type-check

# 运行所有测试
npm test

# 运行后端测试
npm run test:worker

# 运行前端测试
npm run test:webui
```

### 本地 D1

```bash
# 初始化本地 D1
npm run d1:init

# 运行数据库迁移
npm run d1:migrate

# 查看数据
npm run d1:view
```

## 技术栈

### 后端

| 技术 | 用途 |
|------|------|
| Cloudflare Workers | 运行时环境 |
| TypeScript | 编程语言 |
| Cloudflare D1 | 主存储数据库 |
| Cloudflare KV | 键值存储 |
| Wrangler | 部署工具 |

### 前端

| 技术 | 用途 |
|------|------|
| React 19.x | UI 框架 |
| RSuite 5.x | UI 组件库 |
| MobX 6.x | 状态管理 |
| Vite 7.x | 构建工具 |
| React Router | 路由管理 |

### 测试

| 技术 | 用途 |
|------|------|
| Jest 30.x | 测试框架 |
| ts-jest | TypeScript 支持 |
| Testing Library | React 测试 |

## 贡献

参见 [CONTRIBUTING.md](./CONTRIBUTING.md)

## 许可证

MIT License
