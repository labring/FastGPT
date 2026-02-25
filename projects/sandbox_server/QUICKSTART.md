# 快速开始指南

## ✅ 项目已完成

所有功能已实现并通过测试。

## 📁 项目结构

```
sandbox_server/
├── src/
│   ├── index.ts                 # 应用入口
│   ├── env.ts                   # 环境变量配置
│   ├── schemas/                 # Zod Schema 定义（类型导出）
│   │   ├── common.schema.ts     # 公共 schema
│   │   ├── container.schema.ts  # 容器 schema
│   │   └── sandbox.schema.ts    # 沙盒 schema
│   ├── middleware/              # 中间件
│   │   ├── auth.ts              # Bearer token 鉴权
│   │   └── error.ts             # 统一错误处理
│   ├── clients/                 # 客户端（axios 实例）
│   │   ├── sealos.ts            # Sealos API 客户端
│   │   └── sandbox.ts           # Sandbox 客户端
│   ├── routes/                  # 路由（OpenAPI 定义）
│   │   ├── container.route.ts   # 容器生命周期路由
│   │   └── sandbox.route.ts     # 沙盒操作路由
│   └── sdk/                     # SDK 模块
│       ├── container.ts         # sdk.container.*
│       └── sandbox.ts           # sdk.sandbox.*
├── test/                        # 测试
│   ├── setup.ts                 # 测试配置
│   ├── .env.test.template       # 测试环境变量模板
│   └── app.test.ts              # 基础测试
├── Dockerfile                   # Docker 构建
├── .env.template                # 环境变量模板
└── package.json
```

## 🚀 启动步骤

### 1. 安装依赖

```bash
cd FastGPT/projects/sandbox_server
bun install
```

### 2. 配置环境变量

复制 `.env.template` 为 `.env.local` 并填写配置：

```bash
cp .env.template .env.local
```

编辑 `.env.local`：

```env
PORT=3000
TOKEN=your-secret-token
SEALOS_BASE_URL=https://your-sealos-api-url.com
SEALOS_KC=your-kubeconfig-token
```

### 3. 启动开发服务器

```bash
bun run dev
```

### 4. 访问 API 文档

- **Scalar UI**: http://localhost:3000/openapi/ui
- **OpenAPI JSON**: http://localhost:3000/openapi
- **健康检查**: http://localhost:3000/health

## 📝 API 端点

### 容器生命周期 (`/v1/containers`)

| 方法 | 路径 | 描述 | 鉴权 |
|------|------|------|------|
| POST | `/v1/containers` | 创建容器 | ✅ |
| GET | `/v1/containers/:name` | 获取容器信息 | ✅ |
| POST | `/v1/containers/:name/pause` | 暂停容器 | ✅ |
| POST | `/v1/containers/:name/start` | 启动容器 | ✅ |
| DELETE | `/v1/containers/:name` | 删除容器 | ✅ |

### 沙盒操作 (`/v1/sandbox`)

| 方法 | 路径 | 描述 | 鉴权 |
|------|------|------|------|
| POST | `/v1/sandbox/:name/exec` | 执行命令 | ✅ |
| GET | `/v1/sandbox/:name/health` | 健康检查 | ✅ |

## 💡 SDK 使用示例

```typescript
import { createSDK } from './sdk';

const sdk = createSDK('http://localhost:3000', 'your-token');

// 创建容器
await sdk.container.create({
  name: 'my-sandbox',
  image: 'node:18-alpine',
  resource: { cpu: 1, memory: 1024 }
});

// 获取容器信息
const info = await sdk.container.get('my-sandbox');

// 暂停容器
await sdk.container.pause('my-sandbox');

// 启动容器
await sdk.container.start('my-sandbox');

// 执行命令
const result = await sdk.sandbox.exec('my-sandbox', {
  command: 'ls -la',
  cwd: '/app'
});
console.log(result.stdout);

// 健康检查
const healthy = await sdk.sandbox.health('my-sandbox');

// 删除容器
await sdk.container.delete('my-sandbox');
```

## 🧪 测试

### 单元测试

```bash
# 运行所有测试
bun run test

# 运行单次测试
bun run test:run

# 类型检查
bun run typecheck
```

### 集成测试

集成测试需要真实的 Sealos 环境。

1. 配置测试环境变量：

```bash
cp test/.env.test.template test/.env.test.local
# 编辑 test/.env.test.local，填写真实配置
```

2. 运行集成测试：

```bash
RUN_INTEGRATION_TESTS=true bun run test
```

详细说明请查看 [`test/README.md`](test/README.md)

## 🐳 Docker 部署

```bash
# 构建镜像
docker build -t sandbox-server .

# 运行容器
docker run -p 3000:3000 --env-file .env.local sandbox-server
```

## ✨ 特性

- ✅ **Bun 运行时**: 快速的包管理和执行
- ✅ **Hono 框架**: 轻量级高性能 HTTP 框架
- ✅ **Zod 类型验证**: 所有入参出参均使用 zod parse
- ✅ **OpenAPI 文档**: 自动生成 API 文档（使用 @hono/zod-openapi）
- ✅ **Scalar UI**: 现代化 API 文档界面
- ✅ **类型安全 SDK**: 提供完整的 TypeScript 类型支持
- ✅ **Bearer Token 鉴权**: 统一的认证中间件
- ✅ **统一错误处理**: 避免 API 报错时未响应
- ✅ **工厂模式**: 优雅的控制器设计
- ✅ **Axios 客户端**: 为不同场景定制的 axios 实例
- ✅ **Vitest 测试**: 单元测试和集成测试支持

## 📦 核心依赖

- `hono` - HTTP 框架
- `@hono/zod-openapi` - OpenAPI 集成
- `@scalar/hono-api-reference` - API 文档 UI
- `@t3-oss/env-core` - 环境变量管理
- `axios` - HTTP 客户端
- `zod` - Schema 验证
- `vitest` - 测试框架

## 🔧 环境变量

| 变量 | 必填 | 描述 | 默认值 |
|------|------|------|--------|
| `PORT` | ❌ | 服务器端口 | 3000 |
| `TOKEN` | ✅ | API 认证 token | - |
| `SEALOS_BASE_URL` | ✅ | Sealos API 地址 | - |
| `SEALOS_KC` | ✅ | Sealos Kubeconfig | - |

## 📞 问题排查

### 1. 依赖安装失败

```bash
rm -rf node_modules bun.lockb
bun install
```

### 2. 类型错误

```bash
bun run typecheck
```

### 3. 测试失败

确保测试环境变量已正确设置（见 `test/setup.ts`）

---

🎉 **项目已完成！所有功能均已实现并通过测试。**
