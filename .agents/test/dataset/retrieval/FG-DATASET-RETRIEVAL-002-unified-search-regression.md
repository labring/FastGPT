---
case_version: 1
id: FG-DATASET-RETRIEVAL-002
title: 统一搜索迁移保持召回结果、权限与实际用量一致
business: dataset/retrieval
types: [api, integration]
category: boundary
scenario: special
priority: P0
status: ready
tags: [pr-8194, searchTest, multi-dataset, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, database, log, storage, cache]
sources:
  - packages/global/core/dataset/search/type.ts
  - packages/global/openapi/core/dataset/api.ts
  - packages/service/core/dataset/search/service.ts
  - packages/service/core/dataset/search/runtime.ts
  - packages/service/core/dataset/search/defaultRecall/index.ts
  - packages/service/core/dataset/search/filter/collectionFilter.ts
  - packages/service/support/permission/collection/auth.ts
  - packages/service/core/workflow/dispatch/dataset/search.ts
  - packages/service/core/workflow/dispatch/ai/agent/sub/dataset/index.ts
  - projects/app/src/pages/api/core/dataset/search.ts
  - projects/app/src/pages/api/core/dataset/searchTest.ts
  - projects/app/src/service/core/dataset/search.ts
  - projects/app/src/service/core/dataset/searchTest.ts
routes:
  - POST /api/core/dataset/search
  - POST /api/core/dataset/searchTest
  - POST /api/core/dataset/create
  - POST /api/core/dataset/collection/create
  - POST /api/core/dataset/data/insertData
related: [FG-DATASET-RETRIEVAL-001]
automation:
  - runner: node
    script: .agents/test/dataset/retrieval/FG-DATASET-RETRIEVAL-002.mjs
    items: [C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12]
baseline: "upstream/main=4095901cf83484c686e32c50379014f8ebc7977b; pr=0caaf967951dacd9adfdafcd0f56f883f92438af; pro=205efaac6afcdb90d8f3e6d09c8de21c8509ee60"
---

# 统一搜索迁移保持召回结果、权限与实际用量一致

## 用例简介

同一批已完成索引的知识库数据，在迁移前后的单库搜索接口中应保持召回、融合、重排和结果预算语义。新多库接口复用这些行为，同时严格限制本次调用身份可以访问的知识库、集合和临时图片；模型实际用量只计量一次。

## 前置准备

- 环境：主线与 PR 分别启动实际 Next dev HTTP 服务，固定相同 Pro 提交。连接 Mac Mini Dev MongoDB、PG/pgvector、Redis、对象存储和已配置模型网关；本机禁止创建或下载数据库。使用本轮独立 Mongo 数据库及日志库、PG schema 和空闲 Redis DB，登记名称与 run 标识，不操作 Dev 业务数据。
- 配置：从 Dev 只读复制系统模型、默认模型和当前有效的系统配置到隔离库，保留真实模型网关和存储凭证，凭证只放仓库外 0600 文件。先核对网关实际可用模型；隔离目录的选定模型使用非零测试积分价格，保证能验证真实扣费，不修改 Dev 原目录的价格。`FASTGPT_TEST_SEARCH_FIXTURE` 指向本轮环境与资源清单，包含已核实的两个入口、数据库/schema、认证材料和网关观测入口；不提交该文件。
- 数据：独立团队 T、owner A、普通成员 B、外团队 U；A 的个人 API Key 与登录 session；B 对 K1/K2 可读。通过真实 API 创建同 embedding 模型的 K1/K2、不同 embedding 模型的 K3，以及两个集合、至少 12 条可区分文本分块。记录真实 dataId/indexes[].dataId；K1 有足够候选验证重排截断。输入图片为本轮写入 `temp/T/` 的 PNG，清理时只删登记对象。
- 对照：每组先调用主线 searchTest，再调用 PR searchTest 和对应的新协议。比较有序 dataId、datasetId/collectionId、正文、分数及检索配置；新接口不回显检索模式、预算和相似度等入参，使用本次实际提交参数参与对照。耗时和签名 URL 的临时参数不参与相等判断。比较分数保留可解释浮点精度；积分增量使用 1e-8 精度消除已有累计值相减的 IEEE 754 舍入误差，可选 outputTokens 缺省按计费契约视为 0。不忽略结果丢失、顺序变化或错误降级。
- 外部模型：HTTP 观测代理首轮转发真实 Dev 网关，并记录响应。确定性对照将该轮真实响应按规范化请求回放给后续入口，逐次截取业务请求前后的模型调用差集，比较请求哈希多重集；保留重复哈希以识别重复或缺失调用，不要求并发完成顺序一致。新旧接口、重复目标、计费和工作流对照均检查此项，避免 LLM 随机性造成伪差异；额外实时请求确认增强能力实际可用。报告必须区分实时与回放，不能将回放称作再次调用真实模型。
- 数据库证据：usage、usage items、openapi.usagePoints、审计和搜索埋点均只查询本轮 teamId/tmbId 与操作时间窗。等待异步记录最多 30 秒；API/模型请求最多 120 秒。除明确恢复步骤外，各行不改变公共数据；权限与模型场景结束后恢复快照并清理本轮成员缓存。
- 工作流：C12 直接执行两种真实 dispatcher，每个入口/场景使用固定且前后一致的查询标记，避免两次真实重排结果覆盖同一回放记录；使用相同团队、模型目录、数据库、召回和网关；不替换内部权限或召回。该场景是服务集成，不宣称覆盖工作流画布或完整聊天 UI。
- 清理：停止本轮独占进程，按清单删除对象及本轮隔离数据库/schema，删除登记的 Redis key；保留脱敏证据和失败历史，不 flush Dev 业务库、不删除其他任务的资源。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；公共文本索引 | embedding/fullTextRecall/mixedRecall 三种模式逐一对照主线旧接口、PR 旧接口及 PR 新接口。 |
| C2 | 预算与旧协议边界；恢复公共基线 | 对照旧接口默认参数、25000 token 截断、低 token 预算、历史范围 similarity=-1/embeddingWeight=1.25；新接口分别验证 topk=100、topk=1/maxTokens=1 的优先级及 maxTokens=25000；保证新接口不反向收紧旧接口。 |
| C3 | 重排；相同召回候选 | 分别指定模型 ID、旧模型名称及失效模型配置回退；对照候选数 10/20/省略以及非法值归一化；检查模型收到的文档数量与实际重排标志。 |
| C4 | 查询扩展；有效 LLM | 对照开启扩展及背景信息，检查原问题/扩展问题进入召回的行为与实际模型 ID；执行实时增强请求。 |
| C5 | 图文；本团队 PNG | 对照纯图片和文字+图片；真实 VLM 描述参与召回，保留文字输入；检查没有把未执行的图片向量能力记为成功。 |
| C6 | 多库；K1/K2 同模型、K3 不同模型 | 联合搜索 K1/K2，重复目标 ID 对照；K1/K3 的 embedding/mixed 拒绝、全文允许；输出只能属于本次授权范围。 |
| C7 | 权限；B 可读库、集合 ACL 开启 | B 只可读一个集合时，在三种模式下对照旧接口并验证新多库；移除可读集合后为空；加入不可读库或外团队库时在模型调用前拒绝。 |
| C8 | 筛选；有效商业能力 | 新接口按 collectionIds、创建时间、结构化标签筛选，并与 B 的集合 ACL 求交集；无匹配返回空；不支持筛选的配置另作明确拒绝对照。 |
| C9 | 模型边界；资源权限不变 | 主线/PR 旧接口与新接口分别验证索引模型停用、不存在及 B 无使用权；辅助模型无使用权时拒绝。每个变体后恢复模型/ACL 与目录版本。 |
| C10 | 输入与身份；公共基线 | 无认证/无效 Key、空查询/目标、未知字段、严格新协议数值/布尔、外团队或非 temp 图片 key；验证拒绝及英文自定义错误。 |
| C11 | 计量与观测；正 token 用量 | 比较一次普通搜索及扩展/重排搜索的模型 token、总积分和 API Key 增量，检查只产生一次搜索用量和一次搜索埋点；登录态复测；拒绝请求不得产生模型用量。 |
| C12 | 工作流；公共文本索引 | 主线/PR 分别执行搜索节点与 Agent 搜索工具，覆盖普通搜索、重排及筛选配置；比较引用 ID/正文和实际用量，核对各入口只上报一次搜索统计。 |

## 预期结果

公共断言：HTTP 成功必须同时满足实际状态、业务 code=200 和返回字段约束；预期拒绝必须有明确业务错误。所有分块、向量、账单和图片都属于本轮资源清单。外部模型回放与实时请求分开记录；不能用模块级 mock 或旧报告代替执行证据。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | HTTP/PG/Mongo/网关 | 三模式实际命中已知分块；相同输入时三个入口有序结果、分数及配置一致，不能仅比较非空。 | 请求、归一化响应、向量与 dataId 映射、外部调用清单。 |
| C2 | HTTP/网关 | 旧协议边界保持主线结果；limit>20000 归一为 20000，低预算保留完整块。新协议 topk 返回排序前缀且优先于 maxTokens，不进行 token 过滤；仅传 maxTokens 时允许超过 20000 的预算；响应 meta 不回显预算、模式或相似度等入参。 | 各变体前后响应与调用输入。 |
| C3 | HTTP/网关 | 实际 usingReRank=true；只向重排发送允许数量的候选，非法旧值默认 100；别名与配置回退行为一致，模型权限错误不能回退。 | 重排输入文档数、模型名、结果及用量。 |
| C4 | HTTP/网关/账单 | 扩展真实执行，确定性对照结果一致；LLM 与扩展 embedding 用量均记录且无重复。 | 实时/回放标识、阶段调用与 usage items。 |
| C5 | HTTP/S3/网关 | 纯图与图文均可执行并召回已知内容；临时 URL 不破坏输入归属与结果比较。 | 对象 key、实际图片请求、caption 与规范化引用。 |
| C6 | HTTP/数据库 | 去重不改变结果；多库覆盖允许目标，向量空间不一致时召回前拒绝，全文仍成功。 | 目标与命中 ID 集合、模型调用前后差集、拒绝响应。 |
| C7 | HTTP/ACL/PG | 隐藏集合永不进入结果，空权限不扩大召回；任一目标不可读则整次拒绝且不计模型用量。 | 成员/资源 ACL、三个模式的引用集合与模型调用差集。 |
| C8 | HTTP/ACL/数据库 | 筛选与权限取交集；未匹配为空；不支持筛选时明确拒绝而非忽略配置。 | 筛选输入、标签/创建时间快照、结果差集和配置切换记录。 |
| C9 | HTTP/模型目录/网关 | 各模型失效原因明确拒绝，不发起召回/重排/扩展；主线与 PR 不因重构绕过校验。 | 实际错误、模型/授权快照、网关与计费差集、恢复快照。 |
| C10 | HTTP/数据库/网关 | 非法请求在相应边界拒绝；服务端身份不取自 body，临时对象校验发生在读取前；本 PR 自定义错误英文。 | 原始状态与脱敏响应、调用/账单差集。 |
| C11 | HTTP/Pro/Redis/Mongo | 正 token 搜索一次入账；相同模型响应下分阶段 token 与积分一致，API Key 增量等于账单金额；登录态来源正确；审计/统计不重复。 | 用量及 items、openapi 前后值、team_audits 与 tracks 的本轮差集。 |
| C12 | 真实服务/PG/Mongo/网关 | 两种 dispatcher 引用与用量保持一致；筛选能力传到底层，搜索统计一次；异常不能用空结果冒充成功。 | dispatcher 输入/输出、有序引用、实际调用与统计差集。 |

### 自动化运行约定

观测代理实现与测例一起归档，避免复测依赖临时脚本。先将主线、PR 与同一固定版本的 Pro 配置为本轮隔离数据环境，两个应用的 `AIPROXY_API_ENDPOINT` 均指向 `gatewayUrl`，代理的 `upstreamGateway` 保留真实 Dev 模型网关。

仓库外 fixture JSON 的固定字段为：`run`、`database`、`logDatabase`、`schema`、`baseUrl`、`baselineUrl`、`baselineRoot`、`gatewayUrl`、`upstreamGateway`、`models`、`members`、`env`、`imageKey`。`models` 包含 embedding、altEmbedding、rerank、llm 的 `{id,name}` 以及 disabledEmbeddingId；`members` 包含 owner、member、foreign 的 `{teamId,tmbId,userId,apiKey,session}`。`env` 使用两个应用实际启动的配置，至少包含 Mongo/日志库、PG、Redis、Pro 与模型网关连接。datasets/collections/data 由脚本按真实 API 的成功响应登记，失败复测只续接已登记资源；图片 key 必须已存在且绑定本团队。该 JSON 包含认证材料，不作为报告附件。

```bash
# 代理单独运行；只监听 fixture.gatewayUrl 指定的 loopback 地址。
FASTGPT_TEST_SEARCH_FIXTURE=/仓库外/fixture.json node .agents/test/dataset/retrieval/FG-DATASET-RETRIEVAL-002.gateway.mjs

# 先按 runner skill 创建报告，再完整串行执行本用例。
FASTGPT_TEST_SEARCH_FIXTURE=/仓库外/fixture.json pnpm test:cases --report /仓库外/report.html --case FG-DATASET-RETRIEVAL-002 --timeout-ms 900000
```

执行过程中不并行修改该 fixture 的知识库数据、授权和模型目录，也不向观测代理发送其他模型请求。完成后由本轮环境准备方停止其独占进程并按前置准备清单统一清理，脚本的 `finally` 释放自身数据库连接；分场景复测期间保留夹具用于对照，不清理其他任务数据。
