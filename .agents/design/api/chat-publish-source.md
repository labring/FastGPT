# 第二阶段：调用来源改造

> 首发版本：4.18.0。HTML 阅读稿：`/Volumes/code/FastGPT/local/tmp/chat-publish-source.html`。

本次把对话上的 `source / sourceName / shareId` 收敛为 `publishSource`，记录**最近一次运行来自哪个渠道**，并调整对应鉴权和日志展示。应用 Key 分类、绑定和离职交接另期实现。

## 1. 字段怎么改

```ts
// 数据库存储：id 是渠道记录的真实 _id，子文档不再生成 _id。
publishSource: { type: 'api', id: ObjectId('渠道记录 ID') }

// 日志接口返回：名称按渠道 ID 查询，不存入 publishSource。
publishSource: { type: 'api', id: '渠道记录 ID', name: '客服后端' }
```

| 入口 | type | id |
| --- | --- | --- |
| API Key | api | OpenApi 记录的 _id |
| MCP | mcp | McpKey 记录的 _id |
| 分享链接、iframe | share | OutLink 记录的 _id |
| 飞书、企微、微信、公众号、钉钉 | 对应渠道类型 | OutLink 记录的 _id |
| 网页、调试、定时任务 | online / test / cronJob | 不填 |

type/id 从服务端已鉴权的配置获取。新 API/MCP/外链调用必须带真实渠道 ID；历史无法恢复时允许缺失。沿用现有来源类型，补齐钉钉映射。

会话所属资源仍由 `sourceType + sourceId`（物理字段 appId）表示；鉴权者仍为 tmbId，使用者仍为 `outLinkUid || tmbId`。

## 2. 什么时候更新

统一在 **preChatRound（获取现有 Redis 租约之后）** 更新：

```text
鉴权并校验旧来源 → 读取历史 → preChat 抢占生成槽并更新来源 → 执行与保存
```

- 抢占生成槽时，用同一条 Mongo 条件更新复核旧来源、整体替换 publishSource；运行状态继续由 Redis 租约表示。
- 新会话、续聊、交互续跑都经过这个入口。prepare/finalize/fail 不再重复写 Chat 来源及其旧兼容字段。
- 鉴权或并发抢占失败不改来源；取得生成槽后，即使运行失败也保留本次来源。不保存历史的运行仍不落库。
- 整体替换可清除上一渠道 ID，例如 API 转网页后变为 `{type:'online'}`。旧来源名称同步更新或清除；旧 shareId 仅保留存量值并标记弃用，新运行不再写入。

## 3. 哪些入口需要校验

**仅当前请求来自 MCP、分享链接时，检查是否与对话已记录的来源一致。**

| 对话中的旧来源 | 处理 |
| --- | --- |
| type、id 都存在且与当前来源相同 | 通过来源检查 |
| type、id 都存在但任一个不同 | 拒绝 |
| 缺 publishSource、type 或 id | 跳过渠道一致性检查，不回退旧 shareId；资源权限与访客 UID 仍校验 |

API、网页登录和其他第三方入口沿用原有权限，合法运行后更新为本次来源。例如分享 → API 可以；更新后再从原分享进入，会因来源不同拒绝。

检查在返回历史、文件、恢复数据之前执行；preChat 写入时再次原子复核，竞争失败需重读判断，不能直接当成新会话。分享历史列表只按当前 publishSource.type/id 与访客 UID 匹配；没有渠道 ID 的历史记录不进入渠道列表。后台查看日志仍走管理权限。

## 4. 日志怎么展示

| 列 | 展示规则 |
| --- | --- |
| 调用渠道（新增） | 按 publishSource.type 显示“API调用 / 分享链接 / MCP / …”；缺失或未知显示 `-` |
| 渠道名（复用原列） | 在线使用固定 `-`；其他来源：当前渠道名 → 旧 sourceName → “渠道已删除” |

Hover 渠道名时，有 id 就显示 `渠道 ID：{id}`，没有则不显示 Tooltip。关联不到渠道时仍先回退有效旧名；空串和纯空白不算有效名称。使用者默认显示，鉴权者默认隐藏；保留已有列偏好，新调用渠道列默认显示。

列表先分页，再按本页渠道批量查询名称，限定团队及对应资源关系，避免逐行查库。列表与导出共用名称规则；筛选、count、用户候选和 Pro 图表同步适配新字段。

## 5. 旧数据怎么兼容

- 旧 source 回填为 type；旧 shareId 能在同团队、同应用唯一匹配外链且类型一致时，回填对应 OutLink._id。
- 历史 API/MCP 没有 Key ID，只保留 type，不按名称或 tmbId 猜测。已有新来源不被回填覆盖。
- Chat.shareId 保留可选 Schema/类型并标记 deprecated，仅作历史数据与迁移读取；移除正常保存传参和查询回退，旧索引保留、不登记自动清理。OutLink.shareId 仍是分享 URL、外部请求、回调和计费使用的凭证，保留；source/sourceName 继续支持约定的名称回退。
- 查询/统计在新 type 缺失时回退旧 source；UI 的调用渠道列只看新 type。AppChatLog 保留原有 15 分钟聚合口径，新桶记录首条来源；历史桶仅从自身 source 回填，不能拿 Chat 最新来源倒推，桶的兼容名称也不跨来源覆盖。
- 历史回填使用系统升级框架，启动链完成后独立自动执行，不阻塞业务启动、不等待普通后台队列，使用集群共享的 3 个独立任务名额。分批断点续跑，条件写入避免覆盖并发新来源；异常由管理员修复后重试；只追加 publishSource，不更新或删除任何旧字段；已有合法新来源不改动。完成条件校验来源合法，不要求旧字段消失。新索引按查询计划验证，通过 defineIndex 声明。
- 上线允许快速滚动升级，本期不处理升级期间新建分享会话的旧版读取兼容，不增加过渡双写；迁移不删除旧字段。回滚到理解新字段的兼容版本。首发版本为 4.18.0，保留旧 source/sourceName，第一阶段 customUid 从 4.18.0 起支持的说明保留。

### 改造落点与 TODO

| 范围 | 主要位置 |
| --- | --- |
| 契约与来源 ID | global chat 类型；API Key / 分享鉴权；MCP / 第三方 runtime |
| 更新与鉴权 | generationLease、prepare、saveChat、authChatTargetCrud、v1/v2 completions |
| 日志与兼容 | LogTable / 列配置、logs list/export/getUsers、history、Sandbox、Pro 图表 |
| 数据回填 | Chat / AppChatLog schema、系统升级任务及相关索引 |

- [x] 贯通全部运行入口；来源只在 preChat 中原子更新。
- [x] 验证同源/跨源、缺字段兼容、访客 UID、交互续跑及并发失败不改来源。
- [x] 验证两列、名称回退、ID Tooltip、导出和第一阶段身份展示。
- [x] 验证回填重跑/断点恢复/并发保护，以及来源筛选和 logs/list 性能；清理临时 mock 数据。

复用测例 PR #8251 的四个第二阶段用例；实施时只运行相关局部测试。
