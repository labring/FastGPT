# @fastgpt-sdk/storage

FastGPT 的对象存储 SDK，提供 **统一的、与厂商无关的**存储接口（S3/MinIO/OSS/COS 等），用于上传、下载、删除、列举对象以及获取元数据。

> 本包为 ESM（`"type": "module"`），并要求 Node.js **>= 20**。

## 安装

```bash
pnpm add @fastgpt-sdk/storage
```

## 快速开始

```ts
import { createStorage } from '@fastgpt-sdk/storage';
import { createWriteStream } from 'node:fs';

const storage = createStorage({
  vendor: 'minio',
  bucket: 'my-bucket',
  region: 'us-east-1',
  endpoint: 'http://127.0.0.1:9000',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? '',
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? ''
  },
  // minio 常见配置：若你的服务不支持 virtual-host 访问方式，可打开它
  forcePathStyle: true
});

// 1) 确保 bucket 存在（不存在则尝试创建）
await storage.ensureBucket();

// 2) 上传
await storage.uploadObject({
  key: 'demo/hello.txt',
  body: 'hello fastgpt',
  contentType: 'text/plain; charset=utf-8',
  metadata: {
    app: 'fastgpt',
    purpose: 'readme-demo'
  }
});

// 3) 下载（流式）
const { body } = await storage.downloadObject({ key: 'demo/hello.txt' });
body.pipe(createWriteStream('/tmp/hello.txt'));

// 4) 删除
await storage.deleteObject({ key: 'demo/hello.txt' });

// 5) 释放资源（部分 adapter 可能是空实现）
await storage.destroy();
```

## 配置（IStorageOptions）

通过 `vendor` 字段选择适配器（判别联合），不同厂商的配置项在 `IStorageOptions` 上有清晰的类型约束与中文 JSDoc。

### AWS S3

```ts
import { createStorage } from '@fastgpt-sdk/storage';

const storage = createStorage({
  vendor: 'aws-s3',
  bucket: 'my-bucket',
  region: 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? ''
  }
});
```

### MinIO / 其他 S3 兼容

```ts
import { createStorage } from '@fastgpt-sdk/storage';

const storage = createStorage({
  vendor: 'minio',
  bucket: 'my-bucket',
  region: 'us-east-1',
  endpoint: 'http://127.0.0.1:9000',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? '',
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? ''
  },
  forcePathStyle: true
});
```

### 阿里云 OSS

```ts
import { createStorage } from '@fastgpt-sdk/storage';

const storage = createStorage({
  vendor: 'oss',
  bucket: 'my-bucket',
  region: 'oss-cn-hangzhou',
  endpoint: process.env.OSS_ENDPOINT, // 视你的部署与 SDK 配置而定
  credentials: {
    accessKeyId: process.env.OSS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.OSS_ACCESS_KEY_SECRET ?? ''
  },
  cname: false,
  internal: false
});
```

### 腾讯云 COS

```ts
import { createStorage } from '@fastgpt-sdk/storage';

const storage = createStorage({
  vendor: 'cos',
  bucket: 'my-bucket',
  region: 'ap-guangzhou',
  credentials: {
    accessKeyId: process.env.COS_SECRET_ID ?? '',
    secretAccessKey: process.env.COS_SECRET_KEY ?? ''
  },
  protocol: 'https:',
  useAccelerate: false
});
```

## API（IStorage）

`createStorage(options)` 返回一个实现了 `IStorage` 的实例：

- **`ensureBucket()`**: 确保 bucket 存在（不存在时**可能**尝试创建，取决于 vendor 与权限；部分厂商仅做存在性校验并直接抛错）。
- **`checkObjectExists({ key })`**: 判断对象是否存在。
- **`uploadObject({ key, body, contentType?, contentLength?, contentDisposition?, metadata? })`**: 上传对象。
- **`downloadObject({ key })`**: 下载对象（返回 `Readable`）。
- **`deleteObject({ key })`**: 删除单个对象。
- **`deleteObjectsByMultiKeys({ keys })`**: 按 key 列表批量删除（返回失败 key 列表）。
- **`deleteObjectsByPrefix({ prefix })`**: 按前缀批量删除（高危，务必使用非空 prefix；返回失败 key 列表）。
- **`generatePresignedPutUrl({ key, expiredSeconds?, metadata? })`**: 生成 **PUT** 预签名 URL（用于前端直传）。
- **`generatePresignedGetUrl({ key, expiredSeconds? })`**: 生成 **GET** 预签名 URL（用于临时授权下载）。
- **`listObjects({ prefix? })`**: 列出对象 key（可按前缀过滤；不传则列出整个 bucket 内对象）。
- **`getObjectMetadata({ key })`**: 获取对象元数据。
- **`destroy()`**: 资源清理/连接释放。

> 重要：当前实现状态（以代码为准）：
> - `generatePresignedPutUrl`：**AWS S3 / MinIO / COS / OSS 已实现**。
> - `generatePresignedGetUrl`：目前各 adapter 仍为 **未实现**（会抛 `Error('Method not implemented.')`）。

### 预签名 PUT 直传示例（浏览器 / 前端）

`generatePresignedPutUrl` 返回的 `metadata` 字段语义更接近“需要带上的 headers”（不同厂商前缀不同，如 `x-oss-meta-*` / `x-cos-meta-*`）。

```ts
const { putUrl, metadata } = await storage.generatePresignedPutUrl({
  key: 'demo/hello.txt',
  expiredSeconds: 600,
  metadata: { app: 'fastgpt', purpose: 'direct-upload' }
});

await fetch(putUrl, {
  method: 'PUT',
  headers: {
    // 将 adapter 返回的 headers 带上（若为空对象也没关系）
    ...metadata,
    'content-type': 'text/plain; charset=utf-8'
  },
  body: 'hello fastgpt'
});
```

## 错误与异常

导出的错误类型：

- **`NoSuchBucketError`**: bucket 不存在（部分 adapter 会用它包装底层错误）。
- **`NoBucketReadPermissionError`**: bucket 无读取权限（部分 adapter 会用它包装底层错误）。
- **`EmptyObjectError`**: 下载时对象为空（例如底层 SDK 返回 `Body` 为空）。

建议你在业务层做分层处理：可恢复错误（重试/提示权限）与不可恢复错误（配置错误/接口未实现）。

## 注意事项

- **按前缀删除是高危操作**：`prefix` 必须是非空字符串；强烈建议使用业务隔离前缀（例如 `team/{teamId}/`），避免误删整桶。
- **metadata 厂商差异**：不同厂商对元数据 key 前缀/大小写/可用字符/大小限制不同，建议使用简单 ASCII key，并控制总体大小。
- **流式下载/上传**：大文件建议使用 `Readable`，减少内存峰值。

## 开发与构建

```bash
pnpm -C FastGPT/packages/storage dev
pnpm -C FastGPT/packages/storage build
```

发布前会执行 `prepublishOnly` 自动构建产物到 `dist/`。


