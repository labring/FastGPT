# FastGPT 文件资产生命周期审计与治理计划

> 状态：Draft，等待逐项讨论
>
> 审计范围：FastGPT App、Pro Admin、Marketplace、Code Sandbox、Browser Sandbox，以及共享 `packages/service` 中的文件写入、绑定、主动清理和定时清理逻辑。
>
> 本文只整理现状、问题和候选 Tasks，不代表所有方案已经确认。

## 1. 目标

这次治理不只处理 Chat 文件，而是回答所有文件资产的五个问题：

1. 文件由哪个入口创建，实际保存在哪个存储后端？
2. 文件刚创建时是临时资产还是正式资产？
3. 哪条业务记录成为文件的 owner，什么时候算绑定成功？
4. owner 更新或删除时，谁负责主动删除文件？
5. 主动删除失败、服务崩溃或 Mongo/S3 跨系统事务失败时，谁负责最终兜底？

最终目标不是“多数路径能删”，而是每类文件都满足：

- 有明确 owner，或者明确声明为固定 TTL 的临时资产；
- 临时文件只有在业务记录持久化成功后才能转为正式资产；
- 删除请求先产生持久化删除意图，再异步执行对象删除；
- 删除任务可以重试，也可以由定时扫描重新发现；
- S3 对象、解析派生文件、TTL、短链 alias、upload session 一起收敛；
- 业务删除、团队删除和异常中断不会产生无法再定位的永久孤儿文件。

### 1.1 审计口径

本次通过以下实现入口反向盘点，而不是只按页面功能枚举：

1. 所有生产代码中的 S3 `uploadObject/createPresignedPutUrl/uploadFileByBody/copy/move`；
2. 所有 S3 `deleteObject/deleteObjectsByPrefix/addDeleteJob` 及业务删除 worker；
3. 所有 Mongo `Buffer` 字段、GridFS bucket/schema 和 TTL index；
4. 所有 Multer multipart API、生产代码本机目录创建/写入/删除；
5. 所有文件相关 `setCron`、Mongo TTL、BullMQ worker 和启动恢复逻辑；
6. App、Pro Admin、Marketplace、Sandbox、Code Sandbox、Browser Sandbox 的跨服务边界。

不把普通内存 Buffer、构建产物、测试 fixture、benchmark 输出算作线上文件资产。第三方 URL 和
Doc2x/TextIn 等外部处理服务只记录本地缓存/派生文件；第三方服务内部保留策略不在本仓库可验证范围内。

## 2. 第一性原理约束

### 2.1 资产状态

所有本地文件资产至少属于以下一种状态：

| 状态 | 含义 | 允许的结束方式 |
| --- | --- | --- |
| `temporary` | 文件已写入，但尚未与业务记录可靠绑定 | 业务事务认领，或 TTL 清理 |
| `active` | 文件已绑定到可查询的业务 owner | owner 更新/删除时主动清理 |
| `deleting` | 已产生持久化删除意图 | 删除 worker 重试直到成功或人工介入 |
| `expired` | 临时租约已到期 | 转为 `deleting`，不能直接丢失追踪信息 |
| `external` | 只保存第三方 URL，不拥有文件内容 | 不删除第三方对象，只删除本地引用/缓存 |

当前 `s3_ttls` 只表达了 `temporary -> expired`，没有表达 `active` owner，也没有可靠的 `deleting` 状态。

### 2.2 跨系统事务

Mongo transaction 不能回滚 S3、Redis/BullMQ、Sandbox provider 或本机文件系统操作。因此：

1. 不应在 Mongo transaction 内直接删除正式 S3 对象。
2. 不应在 Mongo transaction 内投递一个可能早于事务提交执行的删除任务。
3. 上传应先写临时租约，再在业务事务内认领租约。
4. 删除应在业务事务内写入 durable deletion intent；BullMQ 只负责加速消费，Cron 负责补偿漏投和失败任务。
5. 删除完成前必须保留足够的 bucket/key/prefix/owner 信息，不能先删掉唯一定位来源。

### 2.3 删除完整性

删除一个 S3 文件资产时，完整动作至少包含：

1. 主对象；
2. `${basename}-parsed/` 派生图片目录；
3. `s3_ttls` 临时租约；
4. `s3_download_aliases`；
5. 尚未自然过期的 `s3_upload_sessions`；
6. 删除任务/意图本身的完成状态。

按 prefix 删除时，上述元数据也必须按相同 prefix 收敛。

## 3. 当前存储后端

| 存储后端 | 当前用途 | 当前自动清理机制 |
| --- | --- | --- |
| S3 private bucket | Chat、Dataset、Skill package、Sandbox archive、临时文件、解析图片、raw text | `s3_ttls` Hourly Cron + BullMQ 删除队列 |
| S3 public bucket | Avatar，兼容历史 Chat public 文件 | `s3_ttls` + 业务主动删除 |
| Marketplace public bucket | Plugin pkg、manifest、README、logo、assets | 只靠 Marketplace 主动删除 |
| Mongo `image` | 旧头像/数据集解析图片等内嵌二进制 | Mongo TTL 或业务 `deleteMany` |
| Mongo GridFS | 历史 Dataset/Chat 文件和 `dataset_image` | 当前主要为读取/迁移兼容，缺少统一清理 |
| Mongo `buffer_tts` | TTS 音频缓存 | `createTime` 后 24 小时 Mongo TTL |
| Mongo `bill_invoices.file` | Pro 电子发票原文件 | 跟随发票记录永久保存，当前无 TTL/归档策略 |
| 本机 `/tmp` | Multer multipart 临时文件 | API `finally` 删除 + 每 10 分钟扫描 2 小时前文件 |
| Sandbox provider/volume | 用户和 Agent 的运行时工作区 | 停止、归档、资源删除流程 |
| Browser Sandbox `/downloads` | 浏览器下载文件和截图 | 当前没有 TTL、owner 或定时清理 |
| Code Sandbox task tmp | Python one-shot 执行临时文件 | 子进程 cleanup 递归删除，含超时/异常路径 |
| 外部 URL | Chat/Dataset 外部文件来源 | 不拥有源文件，只清本地 rawText/解析图片缓存 |

## 4. S3 key 命名空间

| Prefix | 资产类型 | Owner |
| --- | --- | --- |
| `avatar/{teamId}/...` | 团队、成员、App、Dataset、Skill、组织、分组、门户和系统配置图片 | 真实 owner 不总是 team；`teamId` 目前只是上传者命名空间 |
| `chat/{sourceType}/{sourceId}/{uid}/{chatId}/...` | ChatBox、Invoke、Sandbox 工具产出、解析图片 | Chat source + chatId |
| `chat/{appId}/{uid}/{chatId}/...` | 历史 App Chat 文件 | App Chat，legacy |
| `dataset/{datasetId}/...` | Dataset 原文件、图片、解析图片 | Dataset/Collection/Data |
| `temp/{teamId}/...` | 快速创建 Dataset、搜索测试图片、HTML 解析派生文件 | 固定 TTL，或 move 后转 Dataset |
| `rawText/{hash}` | 文件解析文本缓存 | 固定 20 分钟 TTL |
| `agent-skills/{teamId}/{skillId}/{versionId}.zip` | Skill 版本包 | Skill version |
| `agent-sandbox/{sandboxId}/package.zip` | Sandbox 冷归档 | Sandbox instance record |
| Marketplace `pkgs/...` | Plugin 原始包 | Marketplace tool version |
| Marketplace `{source}/plugin/tools/...` | README/logo/assets | Marketplace tool version + etag |
| Marketplace `marketplace/tools/...json` | Tool manifest | Marketplace tool version |

`S3SourcesSchema` 当前只包含 `avatar/chat/dataset/temp/rawText`，没有覆盖 Skill、Sandbox 和 Marketplace，因此它不是完整的文件资产注册表。

### 4.1 Chat key 为什么增加 `app`

这不是短链改造引入的 URL prefix，而是 Chat source 类型化后增加的对象 key 维度。

旧格式：

```text
chat/{appId}/{uid}/{chatId}/{filename}
```

新格式：

```text
chat/{sourceType}/{sourceId}/{uid}/{chatId}/{filename}
```

普通 App 的 `sourceType` 值就是 `app`，因此新上传对象会表现为
`chat/app/{appId}/{uid}/{chatId}/{filename}`。同一命名空间还需要承载 `skillEdit` 和
`chatAgentHelper`；显式保存 `sourceType` 可以避免不同资源类型复用相同 `sourceId` 时发生鉴权、查询和 prefix 删除串扰。

当前兼容策略：

1. 新上传统一写 source-aware key。
2. 读取时 `parseChatFileS3Key` 同时识别新格式和旧 App 格式；旧格式在内存中归一化为 `sourceType=app`，不会迁移或重写已有对象。
3. 删除普通 App Chat 时，同时投递新 prefix 和 legacy prefix；删除 `skillEdit/chatAgentHelper` 时只删除各自 source-aware prefix。
4. 短链 alias 只保存实际 `objectKey`，不会再额外拼接 `app`；外部短链长度也不受这个内部 key 层级影响。

因此不建议为了路径更短移除 `app`。生命周期治理需要做的是确保所有 Chat 删除入口都携带
`sourceType + sourceId`，并持续覆盖 legacy App prefix，而不是退回有歧义的旧 key 结构。

## 5. 上传与绑定现状

### 5.1 Avatar

| 环节 | 当前行为 |
| --- | --- |
| 上传 | `createUploadAvatarURL` 写 public bucket，默认 1 小时 `s3_ttls` |
| 认领 | `refreshAvatar` 删除新头像 TTL |
| 更新 | `refreshAvatar` 同时直接删除旧头像对象 |
| 删除 | App/Dataset/Skill 删除调用 `removeImageByPath`；部分 owner 只有更新清理，没有删除清理 |
| 团队删除 | 删除旧 Mongo `image`，但没有收敛该团队上传到 public S3 的头像 |

Avatar 实际 owner 不是一种：

| Owner | 更新旧图 | Owner 删除 | 当前结论 |
| --- | --- | --- | --- |
| App | `refreshAvatar` | App worker 调用 `removeImageByPath` | 有事务风险，删除路径存在 |
| Dataset | `refreshAvatar` | Dataset worker 调用 `removeImageByPath` | 有事务风险，删除路径存在 |
| Skill | `refreshAvatar` | Skill worker 调用 `removeImageByPath` | 有事务风险，删除路径存在 |
| Team / TeamMember | `refreshAvatar` | Team 删除未清 public S3；未发现独立 member 删除文件路径 | 删除不完整 |
| Pro Org / Group | `refreshAvatar` | Org/Group delete 只删 Mongo | 明确残留 |
| Team Chat portal logo | `refreshAvatar` | Team 删除只删 `MongoChatSetting` | 明确残留 |
| Pro system favicon/navbar/ad | `refreshAvatar` | 只在下一次更新时清旧图 | 这是系统 owner，不应跟上传者 team 删除 |
| Pro App Template | create/update 只 claim 新图 | Template delete/type delete 不删图，update 也没有传旧图 | 明确残留 |

另外，App 和 Pro 的头像预签 API 都允许客户端传 `autoExpired=false`。当前前端未显式使用该值，
但 API 边界没有禁止普通调用方关闭临时 TTL；上传后不提交 owner 即可形成永久对象。

风险：`refreshAvatar` 经常在 Mongo transaction 内直接删除旧 S3 对象。事务提交失败时 Mongo 会恢复旧 avatar 字段，但旧对象已经不可恢复地删除。

不能直接用“Team 删除时清 `avatar/{teamId}`”修复：系统 favicon、运营广告和 App Template
也可能按当前管理员的 teamId 上传。这里的 teamId 是 uploader namespace，不是可靠 owner；直接清 prefix
可能删除仍被系统配置引用的文件。治理前必须先拆出 system/template asset namespace，或建立真实 owner 绑定。

### 5.2 ChatBox 直接上传

| 环节 | 当前行为 |
| --- | --- |
| 上传 | 预签名上传，默认 1 小时 `s3_ttls` |
| 认领 | `saveChat.persistChatFiles` 从消息、表单、插件输入和文件变量提取 key，在事务内移除 TTL |
| 用户删除单个对话 | 只设置 `MongoChat.deleteTime`，不立即删对象 |
| 用户清空历史 | 批量设置 `deleteTime`，不立即删对象 |
| 用户删除消息 | 只设置 `MongoChatItem.deleteTime`，不回收该消息独占附件 |
| Admin batch delete | 硬删除 Chat Mongo 数据后，按 chat prefix 投递 S3 删除 |
| App/Skill 删除 | 按 source prefix 投递 S3 删除 |
| Pro 保留期清理 | 每天按团队套餐保留天数硬删过期 Chat、文件和 App runtime Sandbox |

问题：用户软删除本身没有 `purgeAt` 或专属 GC。Pro 环境最终可能被“按 updateTime 的全量保留期
清理”覆盖，但删除时间不决定回收时间；未启用 Pro 套餐清理、超长/无限保留期时不会回收。消息级
软删除也没有附件引用计数或回收策略，只能等整个 Chat 被硬删除。

### 5.3 Plugin Invoke 生成文件

| 环节 | 当前行为 |
| --- | --- |
| 上传 | `InvokeProcessor.handleFileUpload` 写入 Chat prefix，初始过期时间为 365 天 |
| 认领 | 上传完成后立即 `removeS3TTL` |
| 输出 | 返回 URL、key、filename、contentType、type |
| 清理 | 完全依赖后续 Chat prefix 硬删除 |

问题：文件在插件调用和 Chat 保存成功前已经转为永久资产。插件后续失败、Chat 未落库或 `NO_RECORD_HISTORIES` 时可能形成永久孤儿对象。

### 5.4 Sandbox 工具生成下载文件

| 环节 | 当前行为 |
| --- | --- |
| 上传 | `sandbox_get_file_url` 转存到 Chat prefix，并创建 2 小时临时 TTL |
| 模型输出 | 仍只返回 `fileUrl` 和 `filename`，不向模型暴露内部 key |
| 服务端引用 | 工具执行结果通过内部 `fileRefs` 保存稳定 key、filename 和本轮 URL |
| 认领 | Chat 最终消息落库时校验 key 归属，并在同一 Mongo transaction 内移除 TTL |
| 历史读取 | 根据持久化 key 重新签发链接，替换 tool response 和最终 Markdown 中的旧 URL，返回前移除 `fileRefs` |
| 清理 | Chat 未保存时由临时 TTL 回收；保存成功后跟随 Chat prefix 硬删除 |

该路径已修复。对象生命周期和访问链接生命周期已经拆分：2 小时只表示临时上传租约和本轮链接
有效期，不再表示已保存对话中文件的最终寿命。`fileRefs` 不依赖 URL 反解，因此兼容
`short-proxy`、`short-redirect` 和 `presigned`。

### 5.5 Dataset 原文件

| 上传入口 | 临时租约 | 认领方式 | 主动删除 |
| --- | --- | --- | --- |
| Dataset 预签名 | 3 小时 | `createOneCollection` 事务内移除 TTL | Collection key 删除 / Dataset prefix 删除 |
| Local multipart | 3 小时 | `createOneCollection` | 同上 |
| Text collection | 3 小时 | `createOneCollection`，API 又重复 remove 一次 | 同上 |
| Backup/template CSV | 3 小时 | `createOneCollection` | 同上 |
| Quick create `temp -> dataset` | temp 1 小时；目标无 TTL | move 后直接创建 Collection | Dataset prefix 删除 |

Dataset 普通上传的“先临时、事务内认领”模型目前是最接近正确模型的实现。

`temp -> dataset` 是例外：`move` 直接删除 source、target 没有临时 TTL。后续 Mongo transaction 失败时 target 会成为永久孤儿；source TTL 文档也会残留到到期扫描。

### 5.6 Dataset 图片数据

| 环节 | 当前行为 |
| --- | --- |
| 上传 | `uploadImage2S3Bucket` 写 `dataset/{datasetId}`，默认由调用方设置 7 天 TTL |
| 认领 | `DatasetDataOperation.create` 在数据写入后移除 TTL |
| 单条删除 | S3 imageId 按 key 投递删除任务 |
| Collection 删除 | 收集 S3 imageId 后批量删除 |
| Dataset 删除 | 按 Dataset prefix 删除所有对象 |

训练失败或未生成 DatasetData 时，7 天 TTL 可以回收上传图片。该主链路基本完整。

历史 GridFS `dataset_image` 仍可读取，但当前删除代码只筛选 S3 imageId，没有删除 GridFS 文件/chunks。

### 5.7 文件解析派生图片

| 来源 | Prefix | TTL | 删除方式 |
| --- | --- | --- | --- |
| Chat 内部文件 | 原 Chat 文件的 `-parsed` | 无独立 TTL | 删除主 key 时级联，或 Chat prefix 删除 |
| Chat 外部 URL | `temp/{teamId}/...-parsed` | 1 天 | `s3_ttls` |
| Dataset 本地文件 | 原 Dataset 文件的 `-parsed` | 无独立 TTL | 删除主 key时级联，或 Dataset prefix 删除 |
| Dataset 外部链接 | `dataset/{datasetId}/file_xxx-parsed` | 无 TTL | 只靠 Dataset prefix 删除 |

注意：按主 key 删除时，队列会计算并删除 `-parsed` prefix；按更大 prefix 删除时自然覆盖派生文件。

### 5.8 Raw text cache

`rawText/{md5(sourceId)}` 固定 20 分钟 TTL。它是缓存，不跟随业务 owner 长期保存。

当前写入会覆盖同 key，并可能重复创建 TTL 文档；`s3_ttls` 没有唯一索引。

### 5.9 Temp 文件

| 场景 | TTL | 后续动作 |
| --- | --- | --- |
| 快速创建 Dataset | 1 小时 | move 到 Dataset prefix |
| Dataset 搜索测试图片 | 3 小时 | 不认领，自动清理 |
| Sandbox HTML preview | 30 分钟 | 不认领，自动清理 |
| Chat 外部文件解析图片 | 1 天 | 不认领，自动清理 |

### 5.10 Skill packages

| 环节 | 当前行为 |
| --- | --- |
| 上传/copy/deploy/import | 先用 `uploadFileByBody` 写临时 TTL |
| 认领 | Skill version/currentVersionId 事务内移除 TTL |
| 创建失败 | 部分路径主动删除，其他路径保留 TTL 兜底 |
| 删除 Skill | 按 `agent-skills/{teamId}/{skillId}/` prefix 删除 |
| 删除单版本包 | 直接 `bucket.client.deleteObject` |

整体绑定模型较完整。但单版本删除绕过 `S3BaseBucket.removeObject`，不会同步清理 alias/TTL；Skill prefix 也受 prefix 元数据漏清问题影响。

### 5.11 Sandbox workspace archive

| 环节 | 当前行为 |
| --- | --- |
| 归档 | 7 天未活跃后，12 小时 Cron 将工作区上传到 `agent-sandbox/{sandboxId}/package.zip` |
| 存储 | 无 `s3_ttls`，由 Sandbox Mongo record 持有 |
| 恢复 | 下载 archive，恢复 provider workspace |
| 删除 | Sandbox resource 删除时按 key 投递 S3 删除 |

风险：删除 Sandbox record 后，archive 删除入队失败只记录日志；record 已不存在，后续没有 TTL 或扫描条件能重新发现 archive。

### 5.12 Marketplace plugin 文件

Marketplace 使用独立 public bucket client，不接入主 App 的 `s3_ttls`、删除队列或 access-link 元数据。

| 环节 | 当前行为 |
| --- | --- |
| 上传 | pkg、README、logo、assets 并行直接上传 |
| 绑定 | 上传后写 Marketplace Mongo index/manifest |
| 更新 | 删除旧 etag assets，上传新 manifest |
| 删除版本 | 先删 Mongo index，再 best-effort 删除 manifest/pkg/assets |

风险：上传或 Mongo 写入中途失败会留下部分对象；删除失败只记录日志，不重试，且 Mongo index 已删除后缺少可靠重扫来源。

### 5.13 Pro Admin 文件代理

Pro Admin `/system/file/upload/[token]` 是上传传输边界，不是文件 owner：它校验 token 和内容后直接写主 App bucket。TTL 和业务绑定仍由签发 token 的主 App 流程负责。

风险：它直接调用 `bucket.client.uploadObject` 是合理的传输实现，但协议升级必须与主 App upload session/token 保持同步，不能独立决定生命周期。

### 5.14 本机 Multer 临时文件

当前所有生产 multipart API 基本都在 `finally` 调用 `multer.clearDiskTempFiles`，包括 Dataset、Skill import、Plugin upload、Invoke、Sandbox upload、Audio transcription。

主 App 兜底 Cron 每 10 分钟扫描整个 `/tmp`，删除 2 小时前的文件，且非 production 不运行。
Pro Admin 和 Marketplace 也复用同一个 Multer helper，但运行在独立进程/容器时，没有看到对应的
兜底 Cron；进程在进入 `finally` 前被杀死时，只能依赖容器重建或外部运维清理。

风险：扫描范围不是 FastGPT 专属目录，会尝试处理同容器内其他程序的 `/tmp` 文件；应改为专属目录并只清本应用创建的文件。

### 5.15 Mongo 内嵌/缓存文件

| Collection | 用途 | 清理 |
| --- | --- | --- |
| `image` | 旧 Mongo 图片 | `expiredTime + 1h` Mongo TTL，或按 path/relatedId/team 删除 |
| `buffer_tts` | TTS 音频缓存 | `createTime + 24h` Mongo TTL |
| `bill_invoices.file` | Pro 已开具电子发票 Buffer | 跟随发票记录，无 TTL 和业务删除 |
| `dataset_image.files/chunks` | 历史 GridFS Dataset 图片 | 当前缺少业务删除和 TTL worker |
| `dataset.files/chunks`、`chat.files/chunks` | 历史 GridFS 文件 | 只保留读取/迁移结构，当前缺少统一清理 |

`image` 的实现会把 `expiredTime` 设置为当前时间加 1 小时，同时 TTL index 又配置 `expireAfterSeconds=1h`，实际删除时间约为创建后 2 小时，不是注释中的 1 小时。

`bill_invoices.file` 是正式业务凭证，不应未经财务/合规确认就按普通临时文件删除。但当前代码也没有
明确保留年限、归档介质和容量监控；Team 删除会保留发票记录及文件，这可能是正确的合规语义，也可能
需要脱敏/归档，必须由产品和法务确认。

### 5.16 Browser Sandbox 与 Code Sandbox 本机文件

| 来源 | 当前行为 | 清理结论 |
| --- | --- | --- |
| Browser 下载 | Chromium 使用 `/downloads` | 未发现 owner、TTL、quota 或定时清理 |
| Browser 截图 | 写 `/downloads/screenshots/shot-*.png` 并返回 path | 未发现消费后删除或定时清理 |
| Browser profile | `/data/profile` | 有意持久化的浏览器状态，不按普通下载文件处理 |
| Code Sandbox Python task | 每个 one-shot task 创建独立 `task-*` 目录 | `cleanupChild` 在正常、异常、超时路径递归删除 |

Browser Sandbox 的下载和截图会持续占用本机/挂载卷。它们目前既不是 S3 Chat file，也没有本机
生命周期记录；如果调用方需要长期使用，应转存为标准业务文件后删除本地副本，否则应设置短 TTL。

### 5.17 S3 health-check 探针对象

App instrumentation 启动检查会分别在 public/private bucket 写入 `health-check/...txt`，并在
`finally` 直接删除。正常路径完整，但删除失败只记录 warning，没有 TTL 或后续扫描。发生存储删除故障时
可能留下少量探针对象；数量通常低，但它仍应纳入统一临时租约或专用 prefix 清理。

### 5.18 App 文件资产边界

当前没有 `app/{appId}` 独立文件 namespace。一个 App 直接拥有或间接绑定的本地文件资产是：

1. public Avatar，由 `MongoApp.avatar` 持有；
2. `chat/app/{appId}/...` 及 legacy `chat/{appId}/...`，由 Chat owner 持有；
3. App/Chat runtime Sandbox workspace 和 archive，由 Sandbox instance 持有；
4. Evaluation、App import 等 multipart 原文件只在本机临时存在，解析后不作为 App 原文件保存。

Workflow 配置里引用的 Dataset 文件、外部 URL、Skill package 各自由原资源 owner 管理，删除 App 不应
顺带删除这些共享资源。App 删除 worker 当前覆盖 Avatar、Chat、Sandbox；可靠性问题来自跨系统删除和
队列补偿，而不是缺少一个 `app/` prefix。

## 6. 当前主动清理入口

| Owner 操作 | 主动清理范围 | 结论 |
| --- | --- | --- |
| Avatar 更新 | 新头像 remove TTL，旧头像立即删除 | 有事务一致性风险 |
| App 删除 | Avatar、Chat/Sandbox、App 相关 Mongo | S3 prefix 可清，但 delete job 一致性需修复 |
| Dataset Data 删除 | 单个 S3 image | S3 路径完整；GridFS legacy 缺失 |
| Dataset Collection 删除 | 原文件、S3 图片、旧 Mongo related image | 跨系统事务存在提前删除风险 |
| Dataset 删除 | Avatar + `dataset/{datasetId}` prefix | 主路径完整；alias/TTL prefix 元数据漏清 |
| Skill 删除 | Avatar、package prefix、Skill chat、Sandbox | 主路径完整；prefix 元数据漏清 |
| Chat Admin 硬删 | Chat Mongo + Sandbox + Chat prefix | 入队失败后可能失去 uid 定位信息 |
| Chat 用户软删 | 只写 `deleteTime` | 无独立 GC；Pro 保留期 Cron 可能稍后覆盖 |
| Chat 消息软删 | 只写 ChatItem `deleteTime` | 不判断附件是否仍被引用，不回收消息附件 |
| Team 删除 | 触发 Dataset/App 删除，删 Mongo image | Avatar/Portal/Skill 不完整；又不能直接清混合 owner 的 avatar prefix |
| Org/Group 删除 | 删除 Mongo owner | 不删除 avatar |
| Pro App Template 删除 | 删除 Mongo template | 不删除 avatar；type 批量删除同样缺失 |
| Sandbox 删除 | Provider、volume、record、archive | archive 入队失败无 durable fallback |
| Marketplace version 删除 | Mongo index + 三类对象 | best-effort，无重试/补偿 |
| Browser Sandbox session/output | 无统一 owner 删除入口 | `/downloads` 文件持续保留 |
| Pro Invoice | 无主动删除 | 可能是合规保留，需要明确 policy |

## 7. 当前定时清理和后台任务

| 任务 | 周期 | 清理内容 | 当前问题 |
| --- | --- | --- | --- |
| `clearExpiredS3FilesCron` | 启动后 3 秒 + 每小时 | 到期 `s3_ttls` | 入 S3 队列后立刻删 TTL，不等待实际删除；全量查询、串行处理 |
| S3 delete worker | 实时 BullMQ | key/keys/prefix、key 的 parsed prefix | prefix 不清 alias/TTL/session；alias 删除是 fire-and-forget |
| Mongo alias TTL | Mongo TTL monitor | `purgeAt` 到期 alias | 最后链接过期后再等 24h grace |
| Mongo upload session TTL | Mongo TTL monitor | `expiresAt` 到期 session | 正常兜底，但对象删除时未主动按 prefix 清理 |
| Mongo image TTL | Mongo TTL monitor | 旧 Mongo 临时图片 | 实际约 2 小时 |
| Mongo TTS TTL | Mongo TTL monitor | 24 小时音频缓存 | 独立缓存，逻辑清晰 |
| Multer `/tmp` cleanup | 每 10 分钟 | 2 小时前本机文件 | 扫描整个 `/tmp`，非 production 不运行 |
| Sandbox stop | 每 10 分钟 | 闲置运行实例 | 只 stop，不删除文件 |
| Sandbox archive | 每 12 小时 | 7 天未活跃 workspace | archive 无 TTL，完全依赖 record |
| Sandbox stale archive | 每 10 分钟 | 卡住的 archive 状态 | 只收敛状态，不是通用孤儿对象扫描 |
| Pro Chat retention cleanup | 每天 01:00 | 按套餐保留期硬删 Chat、文件、App runtime Sandbox | 不以用户 `deleteTime` 为基准；S3 仍只依赖 BullMQ |
| Pro free account cleanup | 每 8 小时 | 不活跃免费团队 Dataset | 复用 Dataset delete queue |
| Browser Sandbox output cleanup | 无 | `/downloads` 与 screenshots | 没有清理任务 |
| Code Sandbox task cleanup | 每个 child 结束时 | Python task 临时目录 | 进程内路径完整；宿主崩溃后的残留依赖容器/外部清理 |
| Pro/Marketplace Multer fallback | 无独立 Cron | 各自容器 `/tmp` | `finally` 前进程退出会残留 |

## 8. 已确认问题清单

### P0：跨系统事务可能删错或永久丢文件

#### P0-1 App/Dataset 删除在 Mongo transaction 内投递 BullMQ

App 和 Dataset 删除 API 在 transaction 内先写 `deleteTime`，再调用 Redis/BullMQ。BullMQ 不是 Mongo transaction 的一部分：

- 队列成功、Mongo commit 失败时，worker 仍可能执行；
- App/Dataset worker 发现 deleteTime 数量不一致时只记录 warning，仍继续硬删除；
- Skill worker 在同类检查失败时会抛错，这三者行为不一致。

#### P0-2 Avatar 更新在 Mongo transaction 内直接删除旧 S3 对象

事务回滚后 Mongo 仍引用旧头像，但旧 S3 对象已经删除。同时新头像 TTL 删除也可能与事务结果不一致。

#### P0-3 Chat 指定 chatIds 硬删后再投递 S3 删除

删除 Chat Mongo 记录后才按查询得到的 uid 投递 prefix。若 enqueue 失败，调用重试时 Chat 记录已经不存在，无法重新恢复 uid/prefix。

#### P0-4 Dataset Data/Collection 在 Mongo transaction 内执行外部删除

单条 DatasetData 删除、Collection 删除和 Dataset 整体清理会在 Mongo transaction/retry block 内
投递 S3 删除并调用 VectorDB。Mongo 回滚不能撤销这些动作：业务记录恢复后，图片/原文件可能已经被
队列删除。它和 App/Dataset 根资源删除的 outbox 问题相同，但入口更细，不能只修根删除 API。

### P1：明确的永久残留或错误过期

#### P1-1 用户软删 Chat 没有 GC

Chat soft delete 改造移除了即时 S3 清理，但没有写 `purgeAt` 或增加专属 GC。Pro 每日保留期 Cron
会按 `updateTime` 清所有过期 Chat，因此部分部署最终会回收；这不是软删除补偿，而且在非 Pro、无限
保留期或保留期很长时，用户已删除 Chat 及文件仍长期存在。消息级软删除也没有附件回收策略。

#### P1-2 S3 TTL 到期记录过早删除

TTL Cron 只确认“删除任务已入队”就删除 `s3_ttls`。S3 worker 10 次重试后仍失败时，TTL source 已丢失，只剩失败 BullMQ job，无法由下一轮 TTL Cron 再发现。

bucket 未初始化时当前逻辑甚至会直接删除 TTL 文档而不删除对象。

#### P1-3 Prefix 删除不清生命周期元数据

Chat、Dataset、Skill 的 owner 删除主要使用 prefix，但 prefix 分支不清：

- `s3_download_aliases`；
- `s3_ttls`；
- `s3_upload_sessions`。

Invoke 的长链接 alias 最长可能在对象删除后继续保留约 366 天。

#### P1-4 `temp -> dataset` move 失败产生永久孤儿

目标对象没有 temporary TTL，Mongo transaction 失败后没有 owner；源 TTL 也不会在 `removeObject` 时同步删除。

#### P1-5 Invoke 文件认领过早

`handleFileUpload` 上传后立即移除 TTL，而不是等标准 Chat file value 落库。插件失败或 Chat 不保存时可能永久残留。

#### P1-6 Sandbox Chat 文件错误地保持 2 小时临时语义

已修复：Chat 保存时认领工具文件，历史读取按 key 重新签链；未保存 Chat 仍由临时 TTL 兜底。

#### P1-7 Team S3 资产清理不完整

Team 删除没有清理 S3 Avatar/Portal 图片，Team processor 也没有直接触发 personal Skill 删除。
但 `avatar/{teamId}` 混入了 system config、运营广告和 App Template 等非 Team owner，不能直接按
prefix 删除。必须先修正 owner namespace/绑定，再补 Team 清理；personal Skill 是否随 Team 删除仍需
确认产品语义。

#### P1-8 Sandbox archive 无 orphan fallback

archive 没有 TTL。删除 record 后 enqueue archive 删除失败，会失去唯一业务定位来源。

#### P1-9 Marketplace 没有临时租约和可靠删除任务

部分上传失败、Mongo publish 失败和删除失败都可能留下永久对象。

#### P1-10 Avatar owner 删除链路缺失且上传者可关闭 TTL

Org、Group、Team portal、App Template 删除不回收图片；Template 更新不传旧 avatar，也会残留旧图。
头像预签 API 还允许客户端传 `autoExpired=false`，可在未创建 owner 时直接产生永久对象。

#### P1-11 Browser Sandbox 输出没有生命周期

浏览器下载和截图写入 `/downloads` 后只返回 path，没有消费确认、TTL、quota 或 Cron；长时间运行的
Browser Sandbox 实例会持续累积本机文件。

#### P1-12 独立服务的 multipart 崩溃残留没有兜底

App、Pro Admin、Marketplace 的 multipart API 都依赖 `finally` 删除。只有主 App 注册了 `/tmp`
兜底 Cron；Pro/Marketplace 独立容器在进程被杀死时没有应用级重扫，并且主 App Cron 也无法跨容器清理。

### P2：一致性、规模和历史兼容问题

#### P2-1 Skill 单 key 删除绕过统一 bucket API

`deleteSkillPackage` 直接调用 client，跳过 alias/TTL 清理。

#### P2-2 `s3_ttls` 缺少唯一约束

`{ bucketName, minioKey }` 只有普通索引；重复租约配合 string key 的 `deleteOne` 可能留下过期记录。

#### P2-3 TTL Cron 全量、串行处理

每小时一次性读取所有过期文档并串行 enqueue，数据量大时会形成长任务和内存压力。

#### P2-4 旧 GridFS 清理缺失

当前仍有读取兼容和 schema，但 Collection/Data/Dataset 删除没有删除对应 GridFS files/chunks。

#### P2-5 Mongo image TTL 语义偏差

代码设置 `expiredTime=now+1h`，TTL index 再延迟 1h，实际约 2h。

#### P2-6 `/tmp` 兜底范围过大

Cron 扫描整个 `/tmp`，应改为 FastGPT 专属上传目录。

#### P2-7 生命周期 source 没有统一注册表

Chat/Dataset/Avatar 使用 source class；Skill/Sandbox 使用自定义 prefix；Marketplace 完全独立。新增文件来源时无法通过类型或测试强制声明 owner/lease/delete/reconcile。

#### P2-8 S3 单 key 删除任务的去重 ID 不包含 bucket

`addS3DelJob` 对单 key 使用 object key 作为 BullMQ `jobId`，而 prefix job 才包含 bucket。public/private
在同一时间删除相同 key 时，第二个任务可能被当作重复任务；历史 Chat 同时兼容两个 bucket，这个风险
不是纯理论上的 namespace 假设。`jobId` 至少应包含 `bucketName + selector type + selector`。

#### P2-9 S3 health-check 删除失败无兜底

启动探针对象在 `finally` 直接删除；失败后没有 TTL。通常数量很少，但应进入统一临时对象策略。

#### P2-10 Pro 发票文件缺少显式保留和归档策略

电子发票 Buffer 跟随 Mongo record 永久保存。当前无法从代码判断这是合规要求还是历史默认，也没有
保留年限、冷归档、容量指标和 Team 删除后的处理说明。

## 9. 建议目标架构

### 9.1 Durable lifecycle record

治理协议需要先表达“资产在哪里”，不能把所有文件假设成 S3。建议定义 backend-aware 的资产引用；
PR-L1 可以先实现 S3 adapter，后续 GridFS/local/provider 复用相同状态机：

```ts
type StorageAssetRef =
  | {
      backend: 's3';
      bucketName: string;
      selector: { type: 'key'; key: string } | { type: 'prefix'; prefix: string };
    }
  | { backend: 'gridfs'; bucketName: string; fileId: string }
  | { backend: 'mongoBuffer'; collection: string; recordId: string; field: string }
  | { backend: 'local'; service: string; path: string }
  | { backend: 'sandboxProvider'; provider: string; resourceId: string };

type StorageAssetLifecycle = {
  asset: StorageAssetRef;
  owner?: {
    type:
      | 'chat'
      | 'dataset'
      | 'datasetData'
      | 'avatar'
      | 'systemAsset'
      | 'skillVersion'
      | 'sandbox'
      | 'marketplaceTool'
      | 'invoice'
      | 'browserSession'
      | 'temp';
    id: string;
  };
  state: 'temporary' | 'active' | 'deleting' | 'failed';
  expiresAt?: Date;
  deleteAfter?: Date;
  attempts: number;
  lastError?: string;
  createTime: Date;
  updateTime: Date;
};
```

这不要求所有 active 文件都在主 App Mongo 中一对象一文档：

- 临时对象和精确 key：一对象一 lease；
- owner 目录删除：一条 prefix deletion intent；
- Marketplace、Browser、Sandbox 等独立服务在自己的 durable store 保存 intent，但遵守相同字段和状态机；
- Invoice 等合规正式资产可以只有 owner/retention policy，不必进入普通 TTL 删除流。

### 9.2 BullMQ 与 Cron 的角色

- Mongo lifecycle/deletion intent 是 durable truth；
- BullMQ 是低延迟执行器，不是唯一事实来源；
- Cron 分页扫描 `temporary expiresAt <= now` 和待处理 `deleting/failed`；
- worker 成功删除对象和关联元数据后，才完成/删除 lifecycle record；
- worker 失败写 `lastError/attempts`，保留人工排查能力。

### 9.3 业务绑定

业务 transaction 内只能做：

1. 写业务 owner；
2. claim temporary lease，或写 prefix deletion intent；
3. commit 后触发 BullMQ wakeup。

不能在 transaction 内直接删除 S3 对象。

## 10. 待确认决策

在开始实现前，需要逐项确认：

1. 用户删除 Chat 后保留多久再硬删除？候选：立即、7 天、30 天、与 Chat log 合规配置一致。
2. Admin Chat log 是否必须继续查看用户已删除对话中的附件？
3. Sandbox 工具生成文件是否全部视为 Chat 正式附件？建议是。
4. Team 删除是否必须同步删除 personal Skills 及其 package/sandbox/avatar？
5. Marketplace 是否纳入本轮统一治理，还是拆成独立项目 PR？建议独立 PR，但保留同一套生命周期原则。
6. 旧 GridFS 数据是否仍承诺可用？如果是，需要补删除；如果否，需要迁移完成检查和最终下线计划。
7. 是否接受 Mongo deletion-intent/outbox 作为统一底座？如果不接受，需要给出另一种能跨 Mongo/Redis/S3 崩溃恢复的 durable 方案。
8. Avatar 是否接受拆分 namespace：team resource、system config、template/marketing asset？建议拆分，不能继续把 uploader teamId 当 owner。
9. Org、Group、TeamMember、Portal 和 App Template 删除时是否立即删除头像，还是保留恢复窗口？
10. Pro 电子发票文件的法定保留年限、Team 删除后策略和冷归档要求是什么？
11. Browser 下载/截图是短期工具产物，还是要转成 Chat 正式附件？建议默认短 TTL，需要长期使用时显式转存。
12. 删除单条 ChatItem 时，独占附件是否应立即/延迟回收？若附件可被多条消息引用，需要先定义引用计数或 ownership 规则。

## 11. Tasks 与建议 PR 拆分

下面按依赖顺序拆分。每个 PR 都应先补失败场景测试，再改实现。

### PR-L0：基线、指标与故障注入

- [ ] L0-T1 建立文件 source 注册清单，测试所有写入入口必须声明 `backend/ownerType/temporaryTTL/deleteStrategy`。
- [ ] L0-T2 增加 S3 删除指标：pending、retry、failed、oldest age、按 source/bucket 统计。
- [ ] L0-T3 增加 orphan 只读审计脚本：统计 TTL、alias、upload session、业务引用和 prefix 分布，不自动删除。
- [ ] L0-T4 增加 Mongo commit 失败、Redis enqueue 失败、S3 删除失败的故障注入测试。

建议文件：

- `packages/service/common/s3/lifecycle/*`
- `packages/service/test/common/s3/lifecycle/*`
- `projects/app/src/pages/api/admin/...`（只读审计 API，可后置）

### PR-L1：Durable deletion intent 基础设施

- [ ] L1-T1 定义 backend-aware deletion intent Zod schema；本 PR 先落 S3 Mongoose adapter 和索引。
- [ ] L1-T2 支持 `key/keys/prefix` selector、状态、attempts、lastError、nextRetryAt。
- [ ] L1-T3 BullMQ worker 改为消费 intent id，完成后再标记成功。
- [ ] L1-T4 增加分页 reconciliation Cron，补投 pending/failed intent。
- [ ] L1-T5 统一删除主对象、parsed prefix、TTL、alias、upload session。
- [ ] L1-T6 prefix 元数据删除使用可索引的范围查询，不使用无界正则。
- [ ] L1-T7 S3 delete job ID 纳入 bucket 和 selector type，补 public/private 同 key 并发测试。

建议文件：

- `packages/service/common/s3/lifecycle/schema.ts`
- `packages/service/common/s3/lifecycle/entity.ts`
- `packages/service/common/s3/lifecycle/service.ts`
- `packages/service/common/s3/queue/delete.ts`
- `packages/service/common/s3/accessLink/**/entity.ts`

### PR-L2：临时租约和 S3 TTL Cron 修正

- [ ] L2-T1 `s3_ttls` 增加 `{ bucketName, minioKey }` 唯一索引和重复数据迁移。
- [ ] L2-T2 `removeS3TTL` 对 string 也使用幂等 `deleteMany`。
- [ ] L2-T3 到期扫描分页处理，先创建 deletion intent，不提前丢失 durable 状态。
- [ ] L2-T4 bucket 未初始化时保留记录并重试，不允许直接删 TTL 文档。
- [ ] L2-T5 `removeObject/move/copy` 统一维护 source/target lease。

### PR-L3：App/Dataset/Skill/Team 删除一致性

- [ ] L3-T1 删除 API 在 Mongo transaction 内写 deletion intent，commit 后再唤醒 worker。
- [ ] L3-T2 App/Dataset worker 对 deleteTime mismatch 必须中止，和 Skill 对齐。
- [ ] L3-T3 App/Dataset/Team 增加启动恢复或 Cron 扫描，补偿“已软删但未完成”的任务。
- [ ] L3-T4 Team 删除补齐 Skill、Sandbox、legacy GridFS 策略；Avatar 只记录待清 owner，不直接删除混合 prefix。
- [ ] L3-T5 删除 worker 保留 owner tombstone，直到所有外部资源清理完成。
- [ ] L3-T6 Team Avatar 的最终删除依赖 PR-L6 namespace/owner 迁移，迁移前禁止按 `avatar/{teamId}` 盲删。

### PR-L4：Chat 生命周期与软删除 GC

- [ ] L4-T1 确认 Chat retention policy，并写环境变量/配置 schema。
- [ ] L4-T2 用户软删只写 `deleteTime/purgeAt`；GC 到期写 prefix deletion intent。
- [ ] L4-T3 Admin batch delete 在删除 Mongo 前持久化完整 `{sourceType, sourceId, uid, chatId}` intent。
- [ ] L4-T4 覆盖 App、outLink、API、Skill Edit、ChatAgentHelper、legacy App key。
- [ ] L4-T5 Chat GC 同步清 runtime Sandbox、private/public S3、alias、TTL/session。
- [ ] L4-T6 统一 Pro retention Cron 与通用 Chat GC，避免 Pro/非 Pro 生命周期语义分叉。
- [ ] L4-T7 明确 ChatItem 附件 ownership/reference，补消息级删除回收或记录“随 Chat 保留”的显式策略。

### PR-L5：Invoke 与 Sandbox 对话文件持久化

- [ ] L5-T1 Invoke 上传保留临时 TTL，不在 `handleFileUpload` 立即认领。
- [ ] L5-T2 标准化 Invoke 返回为 Chat file value，必须包含 key/type/name。
- [x] L5-T3 Sandbox 工具通过服务端 `fileRefs` 持久化 key，不向模型和历史接口暴露。
- [x] L5-T4 `saveChat.persistChatFiles` 在最终消息落库后认领 Sandbox 文件。
- [ ] L5-T5 Invoke 在 Chat 不保存、插件失败、Agent abort 时保留 TTL 兜底。
- [x] L5-T6 Sandbox 在 Chat 不保存或 Agent abort 时保留临时 TTL。
- [x] L5-T7 Sandbox 历史文件按 key 重新签链，不再随首个 2 小时链接失效。

### PR-L6：Avatar 生命周期

- [ ] L6-T1 建立 Avatar owner registry，区分 App/Dataset/Skill/Team/Member/Org/Group/Portal/System/Template。
- [ ] L6-T2 拆分或迁移 system config、marketing、template asset namespace，不能继续依赖 uploader teamId。
- [ ] L6-T3 Avatar 更新改为事务内记录旧/新 key，commit 后异步删除旧头像。
- [ ] L6-T4 新头像只在业务记录 commit 后 claim；API 不允许客户端关闭 temporary TTL。
- [ ] L6-T5 补 Org/Group/Portal/App Template 更新和删除清理，Template type 批量删除也必须覆盖。
- [ ] L6-T6 完成 namespace/owner 迁移后，再让 Team 删除收敛真正归属该 Team 的 Avatar。
- [ ] L6-T7 统一 S3 avatar 与 Mongo `image` 的路径解析和删除结果。
- [ ] L6-T8 修正 Mongo image TTL 到底是 1 小时还是 2 小时，并同步注释/测试。

### PR-L7：Dataset 文件与 legacy GridFS

- [ ] L7-T1 修复 `temp -> dataset`：target 先带 temporary lease，Collection commit 后 claim。
- [ ] L7-T2 move 成功后清 source TTL；失败时 source/target 均可恢复清理。
- [ ] L7-T3 Collection/Data 删除改为 durable intent，避免 Mongo 回滚后文件已删。
- [ ] L7-T4 明确 GridFS 支持状态；保留则补 files/chunks 删除，废弃则提供迁移完成校验。
- [ ] L7-T5 增加 Dataset 外部链接解析图片 owner/TTL 说明和测试。
- [ ] L7-T6 定义同一 fileId/imageId 被多个 Collection/Data 引用时的共享与删除规则。

### PR-L8：Skill package 与 Sandbox archive

- [ ] L8-T1 `deleteSkillPackage` 改走统一 bucket/lifecycle 删除入口。
- [ ] L8-T2 Skill prefix 删除同步清 alias/TTL/session。
- [ ] L8-T3 Sandbox archive 上传增加 temporary lease，record 标记 archived 后 claim。
- [ ] L8-T4 Sandbox record 删除前写 archive deletion intent，不能 catch 后丢失。
- [ ] L8-T5 补归档 CAS skip、并发删除、恢复失败的 orphan 测试。

### PR-L9：Marketplace 独立生命周期治理

- [ ] L9-T1 为 pkg/manifest/assets 增加 staging prefix 或临时 lease。
- [ ] L9-T2 publish 成功后 promote；失败按 etag staging prefix 清理。
- [ ] L9-T3 删除版本先写 durable tombstone，再删除 Mongo index 和对象。
- [ ] L9-T4 增加 Marketplace cleanup worker/Cron 和失败指标。
- [ ] L9-T5 清理历史无 Mongo index 的 staging/orphan assets。

### PR-L10：Pro/Browser 持久文件策略

- [ ] L10-T1 为 Browser download/screenshot 建立 session owner、quota、expiresAt 和清理任务。
- [ ] L10-T2 需要长期返回给用户的 Browser 文件转存为标准 Chat file，成功绑定后删除本地副本。
- [ ] L10-T3 明确 Invoice file 保留/归档/Team 删除 policy，并增加容量和年龄指标。
- [ ] L10-T4 若发票继续存在 Mongo，限制查询 projection 并验证备份/归档；若迁 S3，使用独立受控 namespace。

### PR-L11：本机临时文件与缓存

- [ ] L11-T1 Multer 使用 FastGPT 专属 temp 目录，并区分 App/Pro/Marketplace 实例。
- [ ] L11-T2 所有 multipart API 通过统一 wrapper 自动注册并在 finally 清理路径。
- [ ] L11-T3 每个独立服务注册自己的 temp reconciliation；Cron 只扫描本服务专属目录。
- [ ] L11-T4 为 Mongo TTS、Mongo image、GridFS 分别记录 TTL 和容量指标。
- [ ] L11-T5 保留 Code Sandbox task cleanup，并补父进程崩溃后由容器启动清理 stale `task-*` 的策略。
- [ ] L11-T6 S3 health-check 对象使用短租约或启动时清理专用 prefix。

### PR-L12：迁移、修复历史残留和上线保护

- [ ] L12-T1 上线前只读扫描并导出 orphan 报告。
- [ ] L12-T2 分 source、小批次执行历史 alias/TTL/session 清理。
- [ ] L12-T3 对无 owner S3 对象先隔离/延迟删除，不直接全量删除。
- [ ] L12-T4 提供 dry-run、limit、cursor、失败重试和审计日志。
- [ ] L12-T5 验证 Mongo、S3、BullMQ、Marketplace、GridFS、本机目录清理前后数量和容量。
- [ ] L12-T6 单独识别 Org/Group/Portal/Template 历史头像，禁止按 team prefix 盲删 system asset。

## 12. 测试矩阵

每个正式资产至少覆盖以下场景：

1. 上传成功、业务 commit 成功：临时租约消失，文件可读；
2. 上传成功、业务 commit 失败：文件保留临时租约并最终删除；
3. 业务删除成功、BullMQ enqueue 失败：deletion intent 仍存在并可补偿；
4. S3 删除连续失败：intent 保留、attempts/lastError 可观测；
5. S3 删除成功、Mongo metadata 清理失败：任务重试且幂等；
6. key 删除同时删除 parsed prefix；
7. prefix 删除同时删除 alias/TTL/upload session；
8. 重复任务、重复 TTL、对象不存在均幂等成功；
9. owner 更新事务回滚：旧文件仍可读，新文件最终回收；
10. Team/App/Dataset/Skill/Chat 删除后的跨存储数量一致；
11. public/private 同 key 并发删除不会因 BullMQ jobId 冲突漏掉任一 bucket；
12. 删除上传者 Team 不会误删仍被 System/Template owner 引用的 Avatar；
13. App/Pro/Marketplace 进程在 multipart `finally` 前退出，重启 reconciliation 可回收临时文件；
14. Browser download/screenshot 到期可回收，转存 Chat 成功的文件仍可访问；
15. Invoice policy 对保留、归档、Team 删除和权限读取都有可验证用例。

## 13. 推荐讨论顺序

建议不要直接从某个业务补丁开始，而按以下顺序讨论：

1. 先确认第 10 节的 retention 和产品语义；
2. 讨论 PR-L1 的 durable deletion intent 是否接受；
3. 先实施 PR-L1/L2，建立所有业务都能复用的可靠底座；
4. 再按 Chat、Avatar、Dataset、Skill/Sandbox 分业务迁移；
5. Marketplace 和历史数据清理最后独立上线。

如果没有统一 durable deletion intent，后续每个业务只能继续在 Mongo、Redis 和 S3 之间手写补偿，问题会以不同形式重复出现。

## 14. 代码证据索引

后续讨论或实施 Task 时，应从对应行的 owner 入口、存储适配器和删除入口一起修改，不能只改 API。

| 领域 | 写入/绑定证据 | 主动/定时清理证据 |
| --- | --- | --- |
| S3 通用 | `packages/service/common/s3/buckets/base.ts`、`packages/service/common/s3/utils.ts` | `packages/service/common/s3/lifecycle/cleanup.ts`、`packages/service/common/s3/queue/delete.ts` |
| S3 元数据 | `packages/service/common/s3/models/ttl.ts`、`packages/service/common/s3/accessLink/uploadSession/*` | `packages/service/common/s3/accessLink/downloadAlias/*`、Mongo TTL indexes |
| Avatar/Mongo image | `packages/service/common/s3/sources/avatar/index.ts`、`packages/service/common/file/image/controller.ts` | App/Dataset/Skill delete processors、Team/Org/Group/Template delete APIs |
| App composite | App create/update/copy APIs、`packages/service/core/app/controller.ts` | `packages/service/core/app/delete/*`、Chat/Sandbox semantic delete services |
| Chat | `packages/service/common/s3/sources/chat/index.ts`、`packages/service/core/chat/saveChat.ts` | `packages/service/core/chat/delete.ts`、`projects/app/src/pages/api/core/chat/history/*`、`pro/admin/src/service/support/wallet/sub/cron.ts` |
| Invoke/Sandbox Chat file | `packages/service/support/invoke/invoke.ts`、`packages/service/core/ai/sandbox/application/toolCall/getFileUrl.tool.ts` | Chat prefix、S3 TTL Cron |
| Dataset | `packages/service/common/s3/sources/dataset/index.ts`、`packages/service/core/dataset/collection/controller.ts`、`projects/app/src/service/core/dataset/data/data.ts` | `packages/service/core/dataset/delete/processor.ts`、Collection/Data delete services |
| Dataset parse/cache | `packages/service/common/file/read/*`、`packages/service/worker/function.ts`、`packages/service/common/s3/sources/rawText/index.ts` | 主 key/prefix 删除、`s3_ttls` |
| Temp/move | `projects/app/src/pages/api/common/file/presignTempFilePostUrl.ts`、`projects/app/src/pages/api/core/dataset/createWithFiles.ts` | `S3BaseBucket.move/removeObject`、`s3_ttls` |
| Skill package | `packages/service/common/s3/sources/skill/index.ts`、`packages/service/core/ai/skill/package/storage.ts` | `packages/service/core/ai/skill/delete/*` |
| Sandbox workspace | `projects/app/src/pages/api/core/ai/sandbox/upload.ts`、`packages/service/core/ai/sandbox/application/archive.ts` | `packages/service/core/ai/sandbox/application/resource.ts`、`application/cron.ts` |
| Marketplace | `projects/marketplace/src/service/tool/upload.ts`、`projects/marketplace/src/service/s3/index.ts` | `projects/marketplace/src/service/plugin/repo.ts` |
| Multer | `packages/service/common/file/multer.ts` 及所有 multipart API | `packages/service/common/file/utils.ts`、`projects/app/src/service/common/system/cron.ts` |
| Mongo binary | `packages/service/common/file/image/schema.ts`、`packages/service/common/buffer/tts/schema.ts`、`pro/admin/src/service/support/wallet/bill/invoiceSchema.ts` | Mongo TTL、owner delete；Invoice 当前无清理 |
| Legacy GridFS | `packages/service/common/file/gridfs/*`、`packages/service/core/dataset/image/*`、`projects/app/src/pages/api/admin/initv4143.ts`、`initv4144.ts` | 当前没有统一业务删除 |
| Browser/Code Sandbox local | `pro/browser-sandbox/src/tools/service.ts`、`projects/code-sandbox/src/isolated/python-isolated-runner.ts` | Browser 当前无；Code Sandbox `cleanupChild` |
