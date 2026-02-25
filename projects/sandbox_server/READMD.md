# FastGPT Sandbox Server

借助 Sealos 的部署能力，进行快速的沙盒管理以及使用。

## 功能

- **容器生命周期管理**: 创建、暂停、启动、删除容器
- **沙盒操作**: 在沙盒中执行命令、健康检查
- **OpenAPI 文档**: 自动生成 API 文档
- **SDK**: 提供类型安全的 SDK 调用

## 快速开始

### 安装依赖

```bash
bun install
```

### 配置环境变量

复制 `.env.template` 为 `.env.local` 并填写配置：

```bash
cp .env.template .env.local
```

### 启动开发服务器

```bash
bun run dev
```

### 运行测试

```bash
bun run test
```

## API 文档

启动服务后访问：
- OpenAPI JSON: `http://localhost:3000/openapi`
- Scalar UI: `http://localhost:3000/openapi/ui`

## API 端点

### 容器生命周期 (`/v1/containers`)

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/v1/containers` | 创建容器 |
| GET | `/v1/containers/:name` | 获取容器信息 |
| POST | `/v1/containers/:name/pause` | 暂停容器 |
| POST | `/v1/containers/:name/start` | 启动容器 |
| DELETE | `/v1/containers/:name` | 删除容器 |

### 沙盒操作 (`/v1/sandbox`)

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/v1/sandbox/:name/exec` | 执行命令 |
| GET | `/v1/sandbox/:name/health` | 健康检查 |

## SDK 使用

```typescript
import { createSDK } from 'sandbox-server/sdk';

const sdk = createSDK('http://localhost:3000', 'your-token');

// 容器操作
await sdk.container.create({
  name: 'my-sandbox',
  image: 'node:18-alpine',
  resource: { cpu: 1, memory: 1024 }
});

const info = await sdk.container.get('my-sandbox');
await sdk.container.pause('my-sandbox');
await sdk.container.start('my-sandbox');
await sdk.container.delete('my-sandbox');

// 沙盒操作
const healthy = await sdk.sandbox.health('my-sandbox');
const result = await sdk.sandbox.exec('my-sandbox', { command: 'ls -la' });
```

## Docker 构建

```bash
docker build -t sandbox-server .
docker run -p 3000:3000 --env-file .env.local sandbox-server
```
