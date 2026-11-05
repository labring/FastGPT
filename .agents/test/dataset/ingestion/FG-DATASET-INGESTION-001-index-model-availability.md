---
case_version: 1
id: "FG-DATASET-INGESTION-001"
title: "知识库导入与重训练先校验索引模型可用性"
business: "dataset/ingestion"
types: ["api", "ui", "integration"]
category: "abnormal"
scenario: "failure"
priority: "P1"
status: "ready"
tags: ["pr-8205", "model-deprecation", "覆盖基础场景", "覆盖异常场景", "覆盖边界场景"]
evidence: ["response", "ui", "database", "storage"]
sources:
  - "packages/global/openapi/core/dataset/collection/createApi.ts"
  - "packages/service/core/dataset/model.ts"
  - "packages/service/core/dataset/entity.ts"
  - "packages/service/core/dataset/collection/controller.ts"
  - "packages/service/core/dataset/apiDataset/service.ts"
  - "packages/service/core/dataset/schema.ts"
  - "packages/service/core/dataset/collection/schema.ts"
  - "packages/service/core/dataset/training/schema.ts"
  - "packages/service/core/ai/model/catalog/handle.ts"
  - "packages/service/core/ai/utils.ts"
  - "packages/service/common/response/index.ts"
  - "projects/app/src/pageComponents/dataset/detail/CollectionCard/Header.tsx"
  - "projects/app/src/pages/api/core/dataset/collection/create/text.ts"
  - "projects/app/src/pages/api/core/dataset/collection/create/localFile.ts"
  - "projects/app/src/pages/api/core/dataset/collection/create/fileId.ts"
  - "projects/app/src/pages/api/core/dataset/collection/create/link.ts"
  - "projects/app/src/pages/api/core/dataset/collection/create/images.ts"
  - "projects/app/src/pages/api/core/dataset/collection/create/backup.ts"
  - "projects/app/src/pages/api/core/dataset/collection/create/template.ts"
  - "projects/app/src/pages/api/core/dataset/collection/create/apiCollection.ts"
  - "projects/app/src/pages/api/core/dataset/collection/create/apiCollectionV2.ts"
  - "projects/app/src/pages/api/core/dataset/collection/create/reTrainingCollection.ts"
routes:
  - "POST /api/core/dataset/collection/create/text"
  - "POST /api/core/dataset/collection/create/localFile"
  - "POST /api/core/dataset/collection/create/fileId"
  - "POST /api/core/dataset/collection/create/link"
  - "POST /api/core/dataset/collection/create/images"
  - "POST /api/core/dataset/collection/create/backup"
  - "POST /api/core/dataset/collection/create/template"
  - "POST /api/core/dataset/collection/create/apiCollection"
  - "POST /api/core/dataset/collection/create/apiCollectionV2"
  - "POST /api/core/dataset/collection/create/reTrainingCollection"
related:
  - "FG-MODEL-MANAGEMENT-001"
  - "FG-DATASET-RETRIEVAL-001"
  - "FG-APP-MANAGEMENT-001"
baseline: "3eca129944291a82acda9471201dccc5cb2525cf; pro=48ee04dd34d4d5b13e77ed4ce184124e491a765a"
---

# 知识库导入与重训练先校验索引模型可用性

## 用例简介

用户导入资料或重新训练集合时，平台应在创建依赖任务之前检查知识库索引模型。模型不可用或当前用户无权使用时明确拒绝；仅标记即将下架时仍可导入，并保留原有文件安全与资源清理行为。

## 前置准备

- 独立团队 T、可写知识库 K、集合 C，成员 A 对 K/C 有写权限且可使用有效 embedding E、处理 LLM 和图片能力。另有正常同类型 E2；C 含可重训文本来源。所有名称带 RUN，记录 datasetId/collectionId，不能使用共享知识库。
- 使用真实 App/Mongo/向量库/对象存储/训练 worker，API 数据源用返回固定文件树与内容的受控 HTTP 服务。额度充足；各来源均先以 E 正常完成一次基线，记录浏览器实际请求的合法必填参数和返回集合 ID。
- 入口参数矩阵 I：text 的 JSON `{datasetId:K,name:RUN,text:"唯一文本"}`；localFile/backup/template 的 multipart=`file` + `data` JSON；images 为多 file + `data:{datasetId:K,collectionName:RUN}`；fileId 为合法当前团队 dataset 路径对象键；link 为受控 URL；apiCollection 为 name/apiFileId；V2 为合法 apiFiles 列表；reTrainingCollection 为 collectionId=C 并沿用基线分块参数。保留来源各自 schema 的真实字段，不以同一 JSON 强行调用所有入口。
- I 中各请求只提交一条文本或一张真实图片，备份/模板从产品合法导出或模板下载获得；fileId 源文件先完成正式上传。每个变体重建独立目标副本，保存已有源 C 与源对象键，不能把预先存在文件误判为本次泄漏。
- 状态矩阵 S：S0=E启用且A获授权；S1=S0且预警true；S2=E停用；S3=K显式引用已删除E的稳定ID；S4=E启用但撤销A使用权。每行只修改该条件，刷新模型目录后读取实际快照；资源本身写权限始终保留。
- 只读：`db.dataset_collections.find({teamId:T,datasetId:K})`、`db.dataset_trainings.find({teamId:T,datasetId:K})`、`db.dataset_datas.find({teamId:T,datasetId:K})`，比较精确 ID/状态差集。对象存储只读列举已知本例目标前缀或 HEAD 精确键；临时本地文件仅在测试实例可读取时检查，不猜路径。
- 成功请求后每秒最多 120 秒轮询本例集合/训练，直到任务完成且可读数据到位；拒绝在响应后确认无新集合/训练任务，不声称所有额度、审计与上传限流计数绝对不变，图片入口可能先更新上传限流。
- 清理：通过产品删除本例集合与知识库并核对业务清理结果；恢复模型状态/权限。fileId 既有来源按准备时登记的所有权清理，不能连带删除其他集合共用文件。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；S0 | 逐项执行 I 合法入口，记录该入口成功基线，重训单独使用 C 的副本。 |
| C2 | 边界；S1 | 代表执行 text 与 images，再完成一次重训，证明预警不等于不可用。 |
| C3 | 异常；S2 | 对 I 全部入口发送与 C1 同形的合法请求；同时在知识库“导入”相关按钮尝试进入。 |
| C4 | 异常；S3/S4 独立 | text 对照删除与无模型使用权；API V2 对照 S4，确保 HTTP 操作者权限传到共享导入服务。 |
| C5 | 来源边界；S2 | localFile/backup/template/images 上传后触发模型拒绝；fileId 复用已存在合法来源，检查各自文件生命周期。 |
| C6 | 修复恢复；承接 C3 的独立目标 | 恢复 E 或把 K 配置切到兼容有效 E2 并授权A，再重发一次此前明确失败的 text/V2 请求；先查无成功资源，避免重复导入。 |

## 预期结果

公共断言：模型拒绝必须来自模型校验，不得用损坏文件、错误对象键、无知识库权限或额度不足代替。HTTP 与业务 code/statusText/message 同时保存；不存在/停用是 modelUnExist，权限拒绝为 unAuthModel；不臆造固定 HTTP 403。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | API/数据库/训练 | 成功 HTTP 200/code=200，返回本入口真实集合/计数字段；数据与任务归当前团队和目标 K，训练可到完成。 | 各 I 请求/响应、目标资源 ID、任务终态。 |
| C2 | API/数据库 | 三个代表入口允许，与 S0 具有相同任务语义；预警不能导致拒绝。 | 模型标记、返回与新增任务差集。 |
| C3 | UI/API/数据库 | UI 给出先配置索引模型的错误提示；直接 API 仍拒绝，全部 I 不新增依赖集合或训练任务；重训保留原 C。 | 可见提示、各入口模型错误、前后 ID 集合。 |
| C4 | API/数据库 | 删除与未授权均拒绝；V2 不因进入共享服务而丢失 A 的模型使用权约束。 | 两种模型状态和 V2 原始响应、无新增任务差集。 |
| C5 | 存储/数据库 | 模型拒绝发生在持久化资料/图片之前，临时本地上传按 finally 清理；fileId 原有源不因拒绝被删除。不泛化成上传前绝无任何文件。 | 目标前缀差集、临时清理能力说明、原源对象 HEAD。 |
| C6 | API/数据库 | 原阻塞解除后允许一次导入，无此前失败遗留集合/任务；对象与数据可归因到该成功请求。 | 修复后目录/权限快照、唯一新集合与任务。 |
