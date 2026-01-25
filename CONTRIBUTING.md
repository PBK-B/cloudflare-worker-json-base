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
src/
├── api/                    # API 路由和控制器
│   ├── router.ts          # 主路由
│   ├── controllers.ts     # 数据控制器
│   ├── resourceController.ts # 资源 CRUD 控制器
│   └── consoleController.ts # 控制台控制器
├── storage/               # 存储层
│   ├── storageAdapter.ts  # 统一存储接口
│   ├── fileStorageService.ts
│   └── providers/         # 存储提供者
├── utils/                 # 工具函数
│   ├── middleware.ts      # 中间件（认证、日志）
│   ├── response.ts        # 响应构建器
│   └── config.ts          # 配置管理
├── types/                 # TypeScript 类型
└── __tests__/             # 测试文件
```

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
