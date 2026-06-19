# 第一个企业知识库同步源方案

## 目标

选择一个企业知识源作为第一批同步对象，建立可重复的同步任务模式。

## 推荐选择

优先选择 SharePoint 或飞书文档，最终取决于公司实际文档主系统。

## 选择标准

| 标准 | 说明 |
| --- | --- |
| 文档权威性 | 是否是业务事实来源 |
| API 可用性 | 是否有稳定 API |
| 权限信息 | 是否能读取部门、成员、文件权限 |
| 变更信息 | 是否有更新时间或 webhook |
| 文件格式 | 是否能导出 PDF、DOCX、MD、HTML |
| 失败可恢复 | 是否支持分页、重试、断点 |

## 同步架构

```text
Source API -> Sync Job -> Object Storage -> FastGPT Dataset -> Vector Index
                      -> Sync Log
                      -> Audit Log
```

## 同步任务字段

| 字段 | 说明 |
| --- | --- |
| `source` | `sharepoint`、`feishu` 等 |
| `sourceId` | 外部文档 ID |
| `datasetId` | FastGPT 知识库 ID |
| `collectionId` | FastGPT collection ID |
| `etag` | 外部版本或 hash |
| `lastModifiedAt` | 外部更新时间 |
| `lastSyncedAt` | 最近同步时间 |
| `status` | pending、running、success、failed、deleted |
| `error` | 失败原因 |

## 同步流程

1. 拉取外部文件列表。
2. 比对 `etag` 或 `lastModifiedAt`。
3. 下载新增或变更文件。
4. 上传原始文件到对象存储。
5. 创建或更新 FastGPT collection。
6. 触发索引训练。
7. 记录同步日志和审计事件。
8. 对外部已删除文件执行软删除或标记失效。

## 权限映射

第一阶段不做复杂权限同步，只做资料范围控制：

1. 一个同步源绑定一个部门知识库。
2. 同步账号只能读取该部门授权目录。
3. FastGPT 内权限由知识库协作者控制。

第二阶段再考虑：

1. 外部文件权限映射到 FastGPT 成员或群组。
2. 文档级权限过滤。
3. 离职和转岗自动回收。

## 失败处理

1. 单文件失败不阻塞整个任务。
2. 失败文件进入重试队列。
3. 连续失败 3 次触发告警。
4. 保存错误码、外部文档 ID、请求 ID。
5. 支持从上次成功游标恢复。

## 验收

1. 能同步 100 个文件并生成知识库索引。
2. 修改外部文件后能增量更新。
3. 删除外部文件后 FastGPT 中能标记或删除。
4. 同步失败可追踪。
5. 不同步未授权目录。
