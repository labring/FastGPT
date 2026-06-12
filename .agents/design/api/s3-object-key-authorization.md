# S3 Object Key 授权绑定设计

## 背景

FastGPT 的私有对象存储 key 是 bucket 内的全局路径字符串，例如：

- `chat/<appId>/<uid>/<chatId>/<filename>`
- `dataset/<datasetId>/<filename>`
- `temp/<teamId>/<filename>`
- `helperBot/<type>/<userId>/<chatId>/<filename>`

这些路径段携带资源归属信息，但 S3 和下载代理本身只验证签名，不理解业务权限。因此任何来自请求体、query、工具参数或外部输入的 object key，在签发 URL、读取、预览、解析前，都必须先绑定到当前已鉴权的业务资源。

## 漏洞模式

危险模式是“校验 A 资源，使用 B key”：

1. API 先校验调用者可访问某个 app、dataset 或 team。
2. API 直接把请求里的 `key`、`fileId`、`sourceId` 传给 S3 签名或读取函数。
3. 如果 key 实际属于其他团队或资源，S3 签名仍然会成功，造成跨团队文件读取。

不能把以下条件当作权限：

- S3 对象存在。
- key 形如某个合法 source 前缀。
- 下载 JWT 签名有效。
- 请求里同时带了一个调用者有权限的 appId/datasetId。

## 统一授权 helper

新增入口必须优先复用各 S3 source 的 key helper：

- `packages/service/common/s3/sources/chat/key.ts`: `parseChatFileS3Key` / `isAuthorizedChatFileS3Key`
- `packages/service/common/s3/sources/dataset/key.ts`: `parseDatasetFileS3Key` / `isAuthorizedDatasetFileS3Key`
- `packages/service/common/s3/sources/helperbot/key.ts`: `parseHelperBotFileS3Key` / `isAuthorizedHelperBotFileS3Key`
- `packages/service/common/s3/sources/temp/key.ts`: `isAuthorizedTempFileS3Key`

这些 helper 只负责 key 结构解析和 key 与已鉴权上下文的绑定判断。业务权限仍由对应 auth 函数负责：

- chat 文件：先 `authChatCrud`，再校验 `chat` key 的 `appId + uid`。
- dataset 文件：用 `authDatasetFileKey` 从 `dataset/<datasetId>/...` 解析 datasetId，并复用 dataset 权限体系。
- temp 文件：先得到当前 `teamId`，再校验 `temp/<teamId>/...`。
- helperBot 文件：先 `authCert` 得到 `userId`，再校验 `helperBot` key 的 `userId`。

## 新增入口规范

当 API 或工具入口接收外部传入的 S3 key 时，必须满足以下规则：

1. 使用 `parseApiInput` 校验请求入参。
2. 先完成业务资源鉴权，拿到可信的 `teamId`、`appId`、`datasetId`、`uid` 或 `userId`。
3. 使用对应 `isAuthorized*FileS3Key` helper 绑定 key 与可信上下文。
4. 绑定失败时返回通用未授权错误，不暴露 key 是否存在。
5. 只有通过绑定后，才允许调用 `createExternalUrl`、`createGet*URL`、`jwtSignS3DownloadToken`、`downloadObject`、`getDatasetFileRawText`、`isObjectExists` 等存储层能力。

## 底层防线

`S3BaseBucket.createExternalUrl` 是裸存储签名方法，只保证 token 有效，不做业务权限判断。调用方不能把它当成鉴权接口。

`readDatasetSourceRawText` 在 `fileLocal` 分支额外校验 `sourceId` 必须属于传入的 `datasetId`，用于防止未来新增入口绕过 API 层鉴权。

`authDatasetFileKey` 会先按 key 内的 datasetId 复用 dataset 权限体系，再检查对象是否存在。对象存在性不能出现在权限校验之前。

## 排查结论

已排查当前主要 S3 签名/读取点：

- 请求体直接传 key 的聊天文件下载、helperBot 文件预览、数据集预览、搜索测试临时图片已接入统一授权 helper。
- 其他 dataset data、training detail、collection read 等签名点使用的是数据库记录中的 key，并且前置查询已经绑定 `teamId/datasetId/collectionId` 权限边界。
- 通用 `/api/system/file/*` 代理只校验 token，它不是业务鉴权入口；安全性依赖 token 签发前的业务授权绑定。

## 测试要求

新增类似入口时至少补充以下测试：

- 合法 key 可以签名或读取。
- 同 source 但不同 app/dataset/user/team 的 key 被拒绝。
- 错误 source 或畸形 key 被拒绝。
- 被拒绝场景不得调用底层 S3 签名或读取 mock。
