# 存储下载策略运行时接线设计

## 1. 背景与问题

Admin「核心配置 → 下载链接」和「文件与存储策略」页面已经提供了下载模式选择，但该选择只写入
`system_instance_configs.storage`，运行时并不读取。运行时真正生效的是环境变量：

- `packages/service/common/s3/config/constants.ts` 在模块加载期把 `STORAGE_DOWNLOAD_URL_MODE`、
  `STORAGE_EXTERNAL_ENDPOINT`、`STORAGE_S3_CDN_ENDPOINT` 解析成常量。
- 两个下载入口 `/api/system/file/d/[signedAlias]`、`/api/system/img/[...id]` 与
  `handleS3RedirectDownload` 都消费这些常量。

因此管理员在界面上选择 `short-redirect` 不会改变行为，也无法在界面配置其前置依赖
（external endpoint / CDN endpoint），等于提供了一个「会静默失效」的开关，违背配置项应自洽的原则。

另外一个约束：`short-redirect` 需要客户端可直连的 external endpoint，且
MinIO 的自建部署必须显式提供；该值同时参与 SigV4 预签名，签名包含 Host，无法在生成后再改写，
因此 S3 客户端必须在拿到最终 endpoint 后构造。

## 2. 目标

1. `storage.downloadMode`、`storage.externalEndpoint`、`storage.cdnEndpoint` 成为运行时权威来源。
2. 环境变量保留为**首次迁移 seed** 与**回落默认值**，不再覆盖已保存的实例配置。
3. S3 bucket（含 externalClient）在实例配置加载完成后构造，并在存储配置变化时重建。
4. 选择 `short-redirect` 且当前 vendor 需要 external endpoint（MinIO）时，保存必须校验外部地址非空。
5. 管理界面对应的表单在 `short-redirect` 下可见并参与校验。

## 3. 数据模型

`StorageConfigSchema` 新增：

```ts
downloadMode: z.enum(['short-proxy', 'short-redirect']).default('short-proxy'),
externalEndpoint: urlWithDefault(),        // 映射 STORAGE_EXTERNAL_ENDPOINT
cdnEndpoint: urlWithDefault(),             // 映射 STORAGE_S3_CDN_ENDPOINT
fileUrlExpiredDays: positiveNumber(90)
```

`downloadRedirectTtlSeconds` 维持既有决策（已从 Schema 移除、由环境变量承载），本次不改动。

## 4. 运行时解析

`packages/service/common/s3/config/constants.ts` 中把静态常量改为**函数**，每次读取
`getSystemInstanceConfig().storage`，并以环境变量回落：

```text
downloadMode        = storage.downloadMode
externalEndpoint    = storage.externalEndpoint || STORAGE_EXTERNAL_ENDPOINT
cdnEndpoint         = storage.cdnEndpoint      || STORAGE_S3_CDN_ENDPOINT
canUseRedirect      = vendor !== 'minio' || !!externalEndpoint
```

`getSystemInstanceConfig()` 在快照缺失时返回 Schema 默认值，保证永不为 null，可在任意调用点安全读取。

## 5. 启动与刷新顺序

`initS3Buckets()` 从与 Mongo 连接并行的步骤改为在 `getInitConfig()` 之后执行：

```text
connect-mongo → get-init-config(加载实例配置) → init-s3-buckets → instrumentation-check
```

并且 `initSystemConfig()` 在加载完成后调用 `initS3Buckets()` 重建 bucket，使
Mongo change stream 触发的配置刷新同样能生效（仅当存储相关字段变化时重建，避免无意义开销）。

## 6. 校验

MinIO + `short-redirect` 必须提供 external endpoint。该校验依赖部署侧 vendor，无法放进纯
global schema，放在存储域保存的 API 边界（`update.ts`）中，复用 `canUseStorageDownloadRedirect`。

## 7. 影响面

- 常量改函数：下载入口、`proxy.ts`、相关单测。
- bucket 构造：`createDefaultStorageOptions` 接收运行时 endpoint。
- 迁移 seed：从环境变量写入 externalEndpoint / cdnEndpoint。
- 管理界面：核心配置页与存储页新增 external endpoint / CDN 字段与条件校验。

