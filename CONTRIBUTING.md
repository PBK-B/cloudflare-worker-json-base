# 贡献指南

感谢您考虑为 JSON Base 贡献代码！本指南将帮助您快速上手。

## 📋 目录

- [快速开始](#快速开始)
- [开发环境](#开发环境)
- [代码结构](#代码结构)
- [开发流程](#开发流程)
- [测试指南](#测试指南)
- [提交规范](#提交规范)

## 🚀 快速开始

### 前置要求

- Node.js 18+
- npm 9+
- Cloudflare Wrangler CLI

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

## ⚙️ 开发环境

### 环境变量配置

创建 `.dev.vars` 文件：

```bash
API_KEY=your-test-api-key
ENVIRONMENT=development
VERSION=2.0.0
STORAGE_BACKEND=d1
```

### 本地 D1 数据库

```bash
# 初始化本地 D1
npm run d1:init

# 运行数据库迁移
npm run d1:migrate

# 查看数据
npm run d1:view
```

## 📁 代码结构

```
cloudflare-worker-json-base/
├── src/
│   ├── api/                          # API 路由和控制器
│   │   ├── router.ts                 # 主路由处理器
│   │   ├── controllers.ts            # 数据控制器
│   │   ├── resourceController.ts     # 资源 CRUD 控制器
│   │   ├── storageController.ts      # 存储控制器
│   │   ├── consoleController.ts      # 控制台控制器
│   │   └── dataAccessController.ts   # 数据访问控制器
│   │
│   ├── storage/                      # 存储层
│   │   ├── storageAdapter.ts         # 统一存储接口
│   │   ├── fileStorageService.ts     # 文件存储服务
│   │   ├── pathMapper.ts             # 路径映射
│   │   ├── interfaces.ts             # 存储接口定义
│   │   ├── metadata/                 # 元数据管理
│   │   │   └── metadataManager.ts    # D1 元数据管理器
│   │   └── providers/                # 存储提供者
│   │       ├── d1StorageProvider.ts  # D1 存储实现
│   │       └── kvStorageProvider.ts  # KV 存储实现
│   │
│   ├── database/                     # 数据库层
│   │   ├── d1Service.ts              # D1 数据库服务
│   │   ├── hybridStorageService.ts   # 混合存储服务
│   │   ├── schema.sql                # 数据库 schema
│   │   └── index.ts                  # 模块导出
│   │
│   ├── utils/                        # 工具函数
│   │   ├── middleware.ts             # 中间件（认证、日志）
│   │   ├── response.ts               # 响应构建器
│   │   ├── config.ts                 # 配置管理
│   │   └── notification.tsx          # 通知组件
│   │
│   ├── types/                        # 类型定义
│   │   ├── index.ts                  # 共享类型
│   │   └── storage.ts                # 存储相关类型
│   │
│   ├── pages/                        # 前端页面
│   │   ├── LoginPage.tsx             # 登录页面
│   │   └── admin/                    # 管理页面
│   │       ├── AdminLayout.tsx       # 管理布局
│   │       ├── AdminConsolePage.tsx  # 控制台页面
│   │       └── AdminDataPage.tsx     # 数据管理页面
│   │
│   ├── components/                   # React 组件
│   │   ├── DeploymentGuide.tsx       # 部署引导
│   │   ├── AutoDeployment.tsx        # 自动部署
│   │   └── common/                   # 通用组件
│   │       └── ModalForm.tsx         # 模态表单
│   │
│   ├── hooks/                        # React Hooks
│   │   ├── useApi.ts                 # API 调用
│   │   └── useTheme.ts               # 主题切换
│   │
│   ├── stores/                       # 状态管理
│   │   ├── AppStore.ts               # 应用状态
│   │   └── ConfigManager.ts          # 配置管理
│   │
│   ├── context/                      # React 上下文
│   │   └── AuthContext.tsx           # 认证上下文
│   │
│   ├── __tests__/                    # 测试文件
│   │   ├── worker/                   # 后端测试
│   │   ├── webui/                    # 前端测试
│   │   └── mocks/                    # 测试 mock
│   │
│   ├── App.tsx                       # 主应用组件
│   ├── index.ts                      # Worker 入口
│   └── main.tsx                      # React 入口
│
├── dist-webui/                       # 构建后的 WebUI 资源
├── docs/                             # 文档
│   └── images/                       # 截图
├── scripts/                          # 脚本
├── tests/                            # 测试配置
├── wrangler.toml                     # Wrangler 配置
├── package.json                      # 项目配置
└── tsconfig.json                     # TypeScript 配置
```

### 目录说明

| 目录 | 描述 |
|------|------|
| `src/api/` | API 路由和控制器，处理所有 HTTP 请求 |
| `src/storage/` | 存储层，实现 D1 和 KV 存储适配器 |
| `src/database/` | 数据库层，D1 服务和混合存储 |
| `src/utils/` | 工具函数，中间件和配置 |
| `src/types/` | TypeScript 类型定义 |
| `src/pages/` | React 页面组件 |
| `src/components/` | React 组件库 |
| `src/hooks/` | 自定义 React Hooks |
| `src/stores/` | MobX 状态管理 |
| `src/context/` | React Context |
| `src/__tests__/` | 测试文件 |

## 🔧 开发流程

### 1. 创建分支

```bash
git checkout -b feature/your-feature-name
```

### 2. 开发

遵循以下原则：
- 使用 TypeScript 严格模式
- 遵循现有代码风格
- 保持函数简洁（建议 < 50 行）
- 添加适当的注释

### 3. 测试

```bash
# 运行所有测试
npm test

# 运行后端测试（Worker）
npm run test:worker

# 运行后端测试（带覆盖率）
npm run test:worker:coverage

# 后端测试监听模式
npm run test:worker:watch

# 运行前端测试（WebUI）
npm run test:webui

# 运行前端测试（带覆盖率）
npm run test:webui:coverage

# 运行前端测试监听模式
npm run test:webui:watch
```

### 4. 类型检查

```bash
# 运行所有类型检查
npm run type-check

# 仅后端类型检查
npm run type-check:worker
```

### 5. 构建

```bash
npm run build
```

## 🧪 测试指南

### 测试框架

使用 Jest 作为测试框架。

### 编写测试

测试文件放在 `src/__tests__/` 目录下，命名为 `*.test.ts`。

示例：

```typescript
import { describe, it, expect } from '@jest/globals'

describe('ResourceController', () => {
  it('should return JSON data', async () => {
    // 测试代码
    expect(result).toBe(expected)
  })
})
```

### 测试覆盖率要求

- 新增功能测试覆盖率应达到 80% 以上
- 核心路径必须有测试覆盖

## 📝 提交规范

### 提交信息格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 类型

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具

### 示例

```
feat(resource): 添加文件上传支持

- 支持 multipart/form-data 上传
- 自动检测 Content-Type
- 限制文件大小为 100MB

Closes #123
```

## 🔒 安全注意事项

- 不要提交真实 API Key
- 不要在日志中输出敏感信息
- 所有 API 端点必须经过认证

## ❓ 获取帮助

- 查看 [README.md](./README.md)
- 提 Issue 讨论
- 搜索现有文档

---

再次感谢您的贡献！🎉
