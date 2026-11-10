---
case_version: 1
id: "FG-DATASET-RETRIEVAL-001"
title: "数据与索引编辑及检索测试一致拒绝不可用索引模型"
business: "dataset/retrieval"
types: ["api", "ui", "integration"]
category: "abnormal"
scenario: "failure"
priority: "P1"
status: "ready"
tags: ["pr-8205", "model-deprecation", "覆盖基础场景", "覆盖异常场景", "覆盖边界场景"]
evidence: ["response", "ui", "database"]
sources:
  - "packages/global/openapi/core/dataset/data/api.ts"
  - "packages/global/openapi/core/dataset/api.ts"
  - "packages/global/core/dataset/type.ts"
  - "packages/global/core/dataset/data/constants.ts"
  - "packages/service/core/dataset/model.ts"
  - "packages/service/core/dataset/data/schema.ts"
  - "packages/service/core/dataset/training/schema.ts"
  - "packages/service/core/ai/model/catalog/handle.ts"
  - "projects/app/src/pages/api/core/dataset/data/insertData.ts"
  - "projects/app/src/pages/api/core/dataset/data/insertImages.ts"
  - "projects/app/src/pages/api/core/dataset/data/pushData.ts"
  - "projects/app/src/pages/api/core/dataset/data/update.ts"
  - "projects/app/src/pages/api/core/dataset/data/index/create.ts"
  - "projects/app/src/pages/api/core/dataset/data/index/update.ts"
  - "projects/app/src/pages/api/core/dataset/searchTest.ts"
  - "projects/app/src/pageComponents/dataset/detail/components/InputDataModal/useInputDataModal.ts"
routes:
  - "POST /api/core/dataset/data/insertData"
  - "POST /api/core/dataset/data/insertImages"
  - "POST /api/core/dataset/data/pushData"
  - "PUT /api/core/dataset/data/update"
  - "POST /api/core/dataset/data/index/create"
  - "POST /api/core/dataset/data/index/update"
  - "POST /api/core/dataset/searchTest"
related:
  - "FG-DATASET-INGESTION-002"
  - "FG-APP-MANAGEMENT-001"
baseline: "3eca129944291a82acda9471201dccc5cb2525cf; pro=48ee04dd34d4d5b13e77ed4ce184124e491a765a"
---

# 数据与索引编辑及检索测试一致拒绝不可用索引模型

## 用例简介

索引模型的可用性应贯穿知识库的日常数据维护和检索测试。即使用户已打开编辑弹窗或绕过前端直接请求接口，后端也应使用当前操作者权限进行统一检查，拒绝时保留原数据和索引。

## 前置准备

- 复用 INGESTION-001 的隔离 T/A/K/E/E2、状态 S0～S4、响应与清理规范。先在 S0 导入一条含 RUN 的文本 D0 和一张图 P0，完成索引；记录 dataId、collectionId、自定义索引的 `indexes[].dataId`，其中向量 ID 不等于 Mongo 数据 ID。
- 请求矩阵 Q：insertData=`{collectionId,q:RUN,a:"答案"}`；pushData=`{collectionId,data:[{q:RUN,a:"答案"}]}`；update=`{dataId,q:RUN+"-修改",a:"答案"}`；index/create=`{dataId,type:"custom",text:RUN}`；index/update=`{dataId,indexDataId:原向量ID,type:"custom",text:RUN+"-修改"}`；searchTest=`{datasetId:K,text:RUN,searchMode:"embedding",usingReRank:false}`。insertImages 为真实小图片 multipart，沿用 UI 成功请求的字段结构。
- 所有请求先在独立副本上验证可成功；图片能力、文件权限、套餐及索引配额保持满足。修改类场景每次恢复相同 D0/P0/索引快照，新增类使用独立集合副本，避免互相改变初态。
- Mongo 只读查询按 teamId+datasetId+collectionId/dataId 限定，保存 `q/a/indexes/indexStatus/indexErrorMsg` 和 dataset_trainings 中本例任务 ID。真实向量库按原 indexes[].dataId 读取前后记录；若环境没有向量只读能力，相关副作用证据阻塞，不能以 Mongo 不变替代向量未写入。
- 使用可控 embedding 接收端记录请求数；检索成功以结果中包含已知 D0 ID、查询模式和来源归属为准，不逐字比较随机模型输出。写入每秒最多 120 秒等 indexed 或明确 error；搜索与拒绝请求最多 30 秒。
- 只对模型校验之前完成的审计/限流/鉴权按实际语义记录；不要求所有 usage/pays/日志都完全不变。清理删除本例数据/索引/集合并恢复模型、权限和存储对象。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；S0，各 Q 独立副本 | 对 Q 全部入口完成一次真实请求，保存合法基线和终态。 |
| C2 | 异常；S2 | 对 Q 全部入口复现合法 body；编辑弹窗在停用前打开，停用后尝试保存。 |
| C3 | 异常；S3/S4 独立 | 对 update、index/create、index/update、searchTest 分别使用已删除 E 和未授权 E；知识库读写权保持不变。 |
| C4 | 边界；S1 | 执行一次插入、自定义索引编辑与检索，验证仅预警时仍可用。 |
| C5 | 身份边界；A/B 均可维护 K | E 仅授权 B，A、B 对相同 D0 分别执行 index/create 与 searchTest；独立副本使用有效 API Key，记录其实际绑定成员身份。 |
| C6 | 修复恢复；由 C2 的拒绝副本继续 | 恢复 E并授权A，或切到能力/维度兼容的 E2 并完成必要的正式重建；确认原请求未成功后再提交一次数据更新和检索。 |

## 预期结果

公共断言：调用方身份与目录快照传入统一检查，不能因某入口自行解析模型而跳过权限。失败断言限定于模型检查后应发生的数据、索引与任务写入。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | API/数据库/向量库 | 各入口 HTTP 200/code=200，返回真实 dataIds、index 或数据字段；异步写入最终 indexed，检索命中已知 D0。 | Q 响应、数据/向量 ID 与终态。 |
| C2 | UI/API/数据库/向量库 | 停用模型明确拒绝；原 q/a/indexes 不改，新数据/索引/训练任务不产生，检索不发起 embedding 请求；弹窗提示先配置索引模型。 | 原始响应、UI、三类存储差集及模型请求计数。 |
| C3 | API/数据库 | 删除为模型不存在类拒绝，缺使用权为 unAuthModel；原数据与索引保留，不能退回其他默认模型继续写入。 | 各身份/模型快照、错误、向量差集。 |
| C4 | API/数据库 | 全部代表操作允许，预警字段不改变执行许可。 | 标记 true 的快照与成功输出。 |
| C5 | API/数据库 | A 被拒，B 正常；API Key 依其服务端实际身份判定，不能因为知识库可写就授予模型使用权。 | 凭证归属、允许/拒绝对照与真实副作用。 |
| C6 | API/数据库/向量库 | 恢复后可完成一次更新并检索命中，拒绝阶段未留下半成品；切模型按正式重建结果验证，不能直接宣称向量天然兼容。 | 前次无写入、新次完成及查询结果 ID。 |
