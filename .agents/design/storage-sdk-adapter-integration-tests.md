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
- 通用长 key 使用统一规范的 850 字节上限，并验证可写、可读、可删除；851 字节在 SDK 预检阶段拒绝，不会制造远端不可清理对象。

## 对象 key 预检契约

所有接收 `key`、`keys`、`sourceKey`、`targetKey` 或 `prefix` 的公开方法，都必须在调用厂商 SDK 前完成同步预检。批量方法先校验完整数组，任何一个 key 非法时不得发出部分删除请求。

特殊字符分为两类：

- 空格、`+`、`#`、`&`、`%`、`?` 和中文是合法 UTF-8 key，adapter 必须保留原始 key，并只在 URL/path 层进行编码。
- 空 key、非完整 Unicode、超过厂商 UTF-8 字节上限，以及厂商明确禁止的路径或控制字符，应抛出统一的 `InvalidStorageObjectKeyError`，不得请求远端。

SDK 对四个 adapter 使用同一套可移植规范，取各厂商硬限制的交集，避免切换 vendor 后同一个 key 的行为发生变化：

- 长度为 1 - 850 UTF-8 bytes。
- 必须是完整 Unicode，不允许未配对的 UTF-16 surrogate。
- 禁止前导 `/`、任何反斜线、连续 `//`、NUL 和 `.`/`..` 路径段。
- 禁止 C0（U+0000 - U+001F）和 DEL（U+007F）控制字符，覆盖 COS 明确不支持的 U+0018 - U+001B，并避免 XML、日志和 URL 处理歧义。

这会主动拒绝 AWS S3、MinIO 原本可能接受的 851 - 1024 字节 key，以及个别厂商可接受但无法跨厂商移植的路径形式。该限制是 SDK 的稳定接口契约，不随当前配置的 vendor 改变。

`listObjects` 允许空 prefix 表示全桶列举；`deleteObjectsByPrefix` 继续拒绝空或纯空白 prefix，避免误删全桶。

## Abort 与超时契约

- 预取消的 `downloadObject` 必须在发请求前抛出 `AbortError`。
- 下载开始后取消时，返回的 `Readable` 必须携带取消原因销毁，底层 HTTP socket 必须关闭。
- AWS/MinIO、OSS、COS 均使用本地真实 HTTP server 验证取消会关闭 socket；其中 COS 依赖输出流的 `error` 触发厂商 SDK 的底层 request abort。
- AWS/MinIO 额外验证等待响应头时取消也会关闭 socket。ali-oss 的 `getStream` 公开 API 不接收 `AbortSignal`，因此 OSS 只能保证预取消不发请求，以及拿到响应流后的取消能关闭 socket；等待响应头期间仍由 ali-oss 自身 timeout 控制。
- MinIO 删除列表达到 60 秒超时时，必须先确定返回稳定的 timeout 错误，再 abort AWS SDK 请求，避免竞态把错误随机变成 `AbortError`。
- MinIO SDK transport 在未返回响应头和响应体未结束两种情况下都必须 destroy request/socket，并在正常 close 时清除 timer。

参考：

- https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html
- https://www.alibabacloud.com/help/en/oss/user-guide/object-overview
- https://intl.cloud.tencent.com/zh/document/product/436/13324

## 第二阶段测试扩充 TODO

- [x] 将通用契约与 MinIO 专项测试拆分到独立目录。
- [x] 增加零字节、二进制、覆盖写、并发和长 key 通用边界。
- [x] 增加预取消下载、缺失对象删除和公共 URL 编码边界。
- [x] 增加 MinIO 1001 对象分页/分块压力测试。
- [x] 增加 MinIO 匿名权限边界和真实 socket 超时测试。
- [x] 运行单元测试、真实 MinIO 集成测试、类型检查和 SDK 构建。
- [x] 使用固定专用桶，并在 suite 启动前删除遗留桶后重建。

## 第三阶段 key 与取消测试 TODO

- [x] 添加统一的 key/prefix 纯函数预检与结构化错误类型。
- [x] 将预检接入四个 adapter 和 Vitest mock 的全部公开对象操作。
- [x] 覆盖合法特殊字符、UTF-8 字节边界、非法 Unicode、路径和控制字符。
- [x] 覆盖批量 key 原子预检，确保非法 key 前不产生部分远端操作。
- [x] 覆盖 AWS、OSS、COS 和 mock 的预取消与流中取消行为。
- [x] 使用真实 HTTP socket 覆盖 MinIO 下载 abort 和 transport timeout。
- [x] 使用真实 HTTP socket 覆盖 OSS、COS 下载 abort。
- [x] 运行 183 个单元测试、31 个当前环境可执行的集成测试、类型检查和 SDK 构建。

## FastGPT 返回值语义对齐

- `uploadObject`、单对象删除、复制和 URL 生成以正常返回为成功，FastGPT 仅消费所需的 `key`、`url` 或流字段；请求级失败继续 reject。
- `deleteObjectsByMultiKeys` 和 `deleteObjectsByPrefix` 的 `result.keys` 统一表示删除失败、需要上层处理的 key；空数组表示全部成功。
- FastGPT 删除队列发现任意失败 key 时抛错，由 BullMQ 按原任务重试；Marketplace 的历史资产清理是 best-effort，记录失败 key 但不回滚已经完成的 manifest 发布。
- OSS 必须使用 verbose 删除响应，并兼容 ali-oss 类型声明中的 `string[]` 与实际 XML 可能解析出的 `{ Key: string }[]`；无法识别响应时整批按失败处理。
- AWS/OSS 按前缀删除在后续分页返回空页时必须保留前序累计失败项，不能用空数组覆盖。

兼容性边界：升级前已经存在、但不符合 850-byte 可移植规范的历史 key，会被新版 SDK 在所有正常操作入口拒绝。此类对象需要先通过厂商工具迁移或清理；不能通过放宽某一个 adapter 绕过，否则会破坏跨 vendor 的统一契约。

## TODO

- [x] 添加 SDK 独立 Vitest 配置与测试脚本。
- [x] 迁移现有 storage 单元测试。
- [x] 实现统一 `IStorage` 契约测试。
- [x] 实现 AWS S3、MinIO、OSS、COS provider harness 和环境开关。
- [x] 添加 MinIO 跨页专项测试。
- [x] 创建本地 `.env.test.local` 并运行 MinIO 集成测试。
- [x] 运行单元测试、SDK 构建和差异检查。
- [x] 提交并推送到 PR。
