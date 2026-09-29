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
5. 只有通过绑定后，才允许调用 `createExternalUrl`、`createGet*URL`、`createS3DownloadAccessUrl`、`downloadObject`、`getDatasetFileRawText`、`isObjectExists` 等存储层能力。

## 底层防线

`S3BaseBucket.createExternalUrl` 是裸存储签名方法，只保证 token 有效，不做业务权限判断。调用方不能把它当成鉴权接口。

`readDatasetSourceRawText` 在 `fileLocal` 分支额外校验 `sourceId` 必须属于传入的 `datasetId`，用于防止未来新增入口绕过 API 层鉴权。

`authDatasetFileKey` 会先按 key 内的 datasetId 复用 dataset 权限体系，再检查对象是否存在。对象存在性不能出现在权限校验之前。

## 排查结论

已排查当前主要 S3 签名/读取点：

- 请求体直接传 key 的聊天文件下载、helperBot 文件预览、数据集预览、搜索测试临时图片已接入统一授权 helper。
- 其他 dataset data、training detail、collection read 等签名点使用的是数据库记录中的 key，并且前置查询已经绑定 `teamId/datasetId/collectionId` 权限边界。
- 通用 `/api/system/file/*` 代理只校验 token，它不是业务鉴权入口；安全性依赖 token 签发前的业务授权绑定。

### GHSA-877g-f2rv-7rmw 补充排查（2026-09-29）

`GHSA-6rxv-p43w-mmx5` 的不完整修复遗漏了两个携带客户端 key 的写入入口，已一并补齐：

- `POST /core/dataset/collection/create/fileId`：此前只做 `isS3ObjectKey(fileId, 'dataset')` 前缀检查，未把 key 内的 datasetId 绑定到已鉴权 dataset。现改为 `isAuthorizedDatasetFileS3Key({ key: fileId, datasetId: body.datasetId })`，拒绝跨数据集/跨团队 key。
- `POST /core/dataset/createWithFiles`：此前只检查 `fileId.startsWith('temp/')`，未绑定团队。现改为 `isAuthorizedTempFileS3Key({ key, teamId })`，并在创建事务前完成校验。
- 数据块渲染与导出短链签发：`data/v2/list`、`data/update`、`collection/export`、`getPreviewChunks` 及 `formatDatasetDataValues` 在通过 `replaceS3KeysToPreviewUrls` 转换 Markdown/HTML 中的 S3 对象键时，增加 `filter` 白名单校验。知识库 data 只放行当前已鉴权 `datasetId` 对应的 `dataset/*` key；`chat/*`、`temp/*` 及其他未通过筛选的 key 不签发短链并保持原文本不替换。通用预览工具仍可服务其他业务场景，写入与更新阶段不阻断自由文本输入。

补漏（review 追加）：

- `data/getQuoteData`：引用详情此前调用 `formatDatasetDataValue` 未传 `datasetId`，options 为空时白名单关闭，可借该接口为 chunk 文本里的外库 key 签发短链。现两处调用均补上 `{ datasetId: collection.datasetId }`。
- `training/getTrainingDataDetail`：`imageId` 此前只做 `isS3ObjectKey(imageId, 'dataset')` 前缀检查，现改为 `isAuthorizedDatasetFileS3Key({ key: data.imageId, datasetId: collection.datasetId })`，与 `data/v2/list` 的写法对齐。
- `search/defaultRecall` 的 `searchDatasetData`：召回输出调用 `formatDatasetDataValues` 时补上 `{ datasetId: datasetIds }`，使检索返回的 chunk 文本里内嵌的外库 key 不签发短链（防御性收敛，候选本身来自已授权的 datasetIds）。
- 未授权 `imageId` 的返回语义：`formatDatasetDataValues` 此前对未通过白名单的 dataset `imageId` 返回 `imagePreivewUrl: ''` 并生成 `![标题]()`，与文本路径“保留原文”不一致。现统一为保留原始 key（`imagePreivewUrl` 回填该 key，markdown 为 `![标题](dataset/...)`），既不签发下载 token，也保留未获得知识库预览授权的状态；展示层不得将该原始 key 当作可访问 URL。
- 知识库图片向量化读取与候选提取：`isValidImageEmbeddingSource` 去除 `temp/*` 与 `chat/*`，仅允许 `data:image/`、`dataset/*` 与外部 HTTP(S) URL 作为合法图片向量源，避免正文提取阶段为临时/会话文件生成无意义的图片索引；下游 `normalizeDatasetIndexImageToModelInput` 强制绑定当前 `datasetId`，仅放行归属合法的 `dataset/*`。通过校验的 key 在 `MULTIPLE_DATA_TO_BASE64=true` 时转为 Base64，否则签发临时下载访问链接（TTL 2小时），兼顾模型输入体积与内网部署兼容性。

同批排查中确认无需修改的点：

- `collection/create/localFile|text|backup|template|images`：key 全部由服务端基于已鉴权 dataset 生成，不接收客户端 key。
- `collection/update`：使用数据库记录中的 key，前置查询已绑定权限边界。
- `collection/detail`、`collection/read`：原判定为「使用数据库记录中的 key、前置查询已绑定权限边界」，第二轮 review 复核后确认仍需显式校验 key 归属（见下节），已补 `datasetId` 绑定。
- `app/create` 的模板头像：key 来自数据库模板记录，非客户端输入。

### 第二轮 review 补漏（2026-09-29，底层收口）

review 指出「预览短链签发」的核心通道仍有漏检，本轮按「底层强收口 + 读接口加固 + 删除防护」三层处理：

1. 底层强收口：`S3DatasetSource.createGetDatasetFileURL` 增加可选的 `datasetId`（`string | string[]`）入参，传入时在签发前统一执行 `isAuthorizedDatasetFileS3Key`，未通过直接抛错；未传时保持兼容（调用方仅持有可信 key 的场景）。
2. 读接口加固（均补 `datasetId` 绑定）：
   - `packages/service/support/permission/dataset/auth.ts` 的 `authDatasetData`：校验数据记录中的 `datasetId` 与已鉴权 `collection.datasetId` 一致，且 `datasetData.imageId` 必须归属于该已鉴权 dataset。
   - `projects/app/src/pages/api/core/dataset/collection/read.ts`：`collection.fileId` 签发前校验归属 `collection.datasetId`。
   - `projects/app/src/pages/api/core/dataset/collection/detail.ts`：读取 `fileId` 元数据前校验归属，避免越权泄露外库文件名/体积/类型。
   - `projects/app/src/pages/api/core/chat/record/getCollectionQuote.ts`：引用全文与翻页加载时显式绑定集合的 `datasetId`。
   - `packages/service/core/dataset/search/utils.ts` 的 `normalizeDatasetIndexImageToModelInput` 与 `dataIndex.ts`：图片向量索引构建时传入并校验 `datasetId`，拒绝读取外库图片 base64。
   - `projects/app/src/pages/api/core/dataset/data/pushData.ts`：在入库队列前检查客户端传入的 `imageId` 归属，拒绝外库 key。
3. 删除防护（避免外库 key 触发跨库物理删除）：
   - `projects/app/src/service/core/dataset/data/data.ts` 的删除数据块：仅当 `imageId` 归属该 data 的 `datasetId` 才删除。
   - `packages/service/core/dataset/collection/controller.ts` 的 `delCollection`：查询图片数据时包含 `datasetId: 1` 投影，`fileId` 与图片 `imageId` 均按各自 `datasetId` 过滤后再物理删除。
   - 同一文件的 `createOneCollection`：对 `fileId` 的 `removeS3TTL` 增加归属校验，避免外库 key 被意外提升为永久对象。
   - `projects/app/src/service/core/dataset/data/data.ts` 的 `createDatasetData`：对 `imageId` 的 `removeS3TTL` 增加归属校验，保持对称性。

4. 私有子模块同步（pro）：
   - `pro/admin/src/service/core/dataset/training/imageUrl.ts` 的 `getImageUrlForVlm` 增加 `datasetId?: string` 入参；为 `dataset` 类型 key 时，若传入 `datasetId` 则必须通过 `isAuthorizedDatasetFileS3Key`，否则抛错；并将 `datasetId` 透传到底层 `createGetDatasetFileURL`。
   - 训练任务调用方（`imageIndex.ts` 与 `imageParse.ts`）透传当前任务的 `data.datasetId`；外库 key 抛错后优雅降级或标记任务失败，杜绝跨库图片送往 VLM。

## 测试要求

新增类似入口时至少补充以下测试：

- 合法 key 可以签名或读取。
- 同 source 但不同 app/dataset/user/team 的 key 被拒绝。
- 错误 source 或畸形 key 被拒绝。
- 被拒绝场景不得调用底层 S3 签名或读取 mock。
