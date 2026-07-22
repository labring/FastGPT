# Storage SDK Adapter 集成测试设计

## 目标

1. 将 Storage SDK 测试从仓库级 `test/sdk/storage` 迁移到 `sdk/storage/test`，由 SDK 自己维护测试配置和命令。
2. 建立一套只依赖 `IStorage` 的统一契约测试，所有 adapter 使用同一组行为断言。
3. 使用 provider harness 隔离厂商差异。harness 负责读取环境变量、重建固定专用测试桶、构造 adapter 和清理测试桶。
4. 集成测试默认跳过，只有 `.env.test.local` 中对应 provider 的开关为 `true` 时才连接真实服务。
5. 第一阶段完整验证本地 MinIO，包括特殊字符 key、分页列举、批量删除和按前缀跨页删除。

## 测试分层

### 单元测试

目录：`sdk/storage/test/unit`

- 保留 adapter 的错误映射、AbortSignal、超时 transport 和分页响应等白盒测试。
- 保留 access-link 的纯逻辑测试。
- 不连接真实对象存储。

### 统一契约测试

目录：`sdk/storage/test/integration/common`

契约函数接收 provider harness，覆盖 `IStorage` 的以下能力：

- `bucketName` 与 `ensureBucket`
- 对象存在性检查
- Buffer、string、Readable 上传
- 流式下载、内容和元数据读取
- 单对象删除及幂等删除
- 多 key 删除及空数组边界
- prefix 列举与删除、空 prefix 安全边界
- bucket 内复制
- PUT/GET 预签名 URL 的真实 HTTP 请求
- 公共 URL 的结构
- `destroy`

每个测试使用唯一 key 前缀，避免用例之间互相依赖。每个 provider suite 使用配置中的固定专用 bucket；suite 启动前先删除遗留同名桶再创建，结束后再次清理。固定桶机制不支持同一配置并发执行。

### Provider Harness

统一结构：

```ts
type StorageIntegrationProvider = {
  name: string;
  enabled: boolean;
  createContext(): Promise<StorageIntegrationContext>;
};
```

`StorageIntegrationContext` 包含 adapter、bucket 名称、可选的 provider 专项验证函数和幂等 cleanup。AWS S3、MinIO、OSS、COS 都注册同一份契约；缺少开关或配置时使用 `describe.skip`，不会访问外部服务。

## 环境变量

本地私密配置写入被 gitignore 忽略的 `sdk/storage/.env.test.local`。可提交的 `.env.test.example` 只提供变量名和本地 MinIO 默认示例。

MinIO：

- `STORAGE_TEST_MINIO_ENABLED`
- `STORAGE_TEST_MINIO_BUCKET`
- `STORAGE_TEST_MINIO_ENDPOINT`
- `STORAGE_TEST_MINIO_REGION`
- `STORAGE_TEST_MINIO_ACCESS_KEY_ID`
- `STORAGE_TEST_MINIO_SECRET_ACCESS_KEY`

其他 provider 使用相同命名规则，分别以 `AWS_S3`、`OSS`、`COS` 为前缀。

## MinIO 专项边界

- MinIO 专项测试独立放在 `sdk/storage/test/integration/minio`，不计入通用契约用例数量。
- 创建 401 个带空格、`+`、`&` 等字符的对象，使 `deleteObjectsByPrefix` 跨越 400 条分页边界。
- 验证删除结果无失败 key，且目标 prefix 已清空。
- 验证 MinIO SDK 返回无法识别的逐对象错误时，adapter 将当前批次全部标记失败。
- 创建 1001 个对象，验证 `listObjects` 翻页和 `deleteObjectsByMultiKeys` 分块。
- 使用真实本地 HTTP socket 验证 transport 超时会关闭底层连接。
- 公共读策略只允许匿名 GET，不允许匿名 PUT。
- 通用长 key 使用已验证可写、可读、可删除的 512 字节边界。当前 MinIO 服务的更长 key 阈值会受 bucket 和内部路径影响，并可能出现“写入成功但无法通过 API 删除”，因此自动化只额外验证 1025 字节会被拒绝，不制造不可清理对象。

## 第二阶段测试扩充 TODO

- [x] 将通用契约与 MinIO 专项测试拆分到独立目录。
- [x] 增加零字节、二进制、覆盖写、并发和长 key 通用边界。
- [x] 增加预取消下载、缺失对象删除和公共 URL 编码边界。
- [x] 增加 MinIO 1001 对象分页/分块压力测试。
- [x] 增加 MinIO 匿名权限边界和真实 socket 超时测试。
- [x] 运行单元测试、真实 MinIO 集成测试、类型检查和 SDK 构建。
- [x] 使用固定专用桶，并在 suite 启动前删除遗留桶后重建。

## TODO

- [x] 添加 SDK 独立 Vitest 配置与测试脚本。
- [x] 迁移现有 storage 单元测试。
- [x] 实现统一 `IStorage` 契约测试。
- [x] 实现 AWS S3、MinIO、OSS、COS provider harness 和环境开关。
- [x] 添加 MinIO 跨页专项测试。
- [x] 创建本地 `.env.test.local` 并运行 MinIO 集成测试。
- [x] 运行单元测试、SDK 构建和差异检查。
- [x] 提交并推送到 PR。
