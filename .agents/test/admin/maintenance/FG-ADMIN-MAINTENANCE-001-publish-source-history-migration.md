---
case_version: 1
id: "FG-ADMIN-MAINTENANCE-001"
title: "publishSource 历史回填、兼容上线与断点恢复"
business: "admin/maintenance"
types:
  - "integration"
category: "boundary"
scenario: "special"
priority: "P1"
status: "draft"
tags:
  - "customuid-publishsource"
  - "phase2"
  - "publishSource"
  - "migration"
  - "覆盖基础场景"
  - "覆盖异常场景"
  - "覆盖边界场景"
evidence:
  - "database"
  - "ui"
sources:
  - "projects/app/src/migration/registry.ts"
  - "projects/app/src/migration/runner.ts"
  - "projects/app/src/migration/plan.ts"
  - "projects/app/src/migration/startup.ts"
  - "projects/app/src/migration/tasks/README.md"
  - "packages/service/core/chat/chatSchema.ts"
  - "packages/service/core/app/logs/chatLogsSchema.ts"
  - "packages/service/core/chat/saveChat.ts"
  - "packages/service/support/outLink/schema.ts"
  - "packages/service/common/mongo/indexManager.ts"
routes: []
related:
  - "FG-CHAT-CONVERSATION-005"
  - "FG-PERMISSION-RESOURCE-001"
  - "FG-CHAT-HISTORY-FEEDBACK-002"
baseline: "dd3cc357757bfb7c11a607c279a69a5f73a48c74"
---

# publishSource 历史回填、兼容上线与断点恢复

## 用例简介

升级后需要将可确定的历史来源回填为 publishSource，同时保留旧名称并允许无法恢复渠道 ID 的对话继续使用。本例检查可信关联、并发新来源保护、迁移重试和统计不失真，避免把当前 Chat 来源错误填回历史统计桶。

## 前置准备

- 阻塞：基线没有本需求迁移注册项；任务 ID、首发版本/版本目录、触发模式和具体入口尚未定稿。按已讨论的“兼容部署后手动分批回填”设计这些验收步骤，注册后补实际路径和任务参数再设 ready；不填写虚构迁移 API。
- 必须用独立可回收环境/库，包含主库和实际日志库。记录部署拓扑，能暂停/重启单个迁移 worker、读取任务进度/错误与 checkpoint，并控制一批业务写入提交后至 checkpoint 前的中断；缺观测或故障注入能力时相关行阻塞。
- 夹具 H：H1 source=share、shareId 能在同 T/W 唯一匹配现存 S1；H2 为已删除外链；H3 为旧 api/mcp，无 Key ID但名称与多个 Key 相同；H4 online/test/cronJob，online 额外带残留 shareId；H5 已有最新完整 publishSource；H6 跨团队/类型冲突或无法唯一匹配的异常数据。均保留 sourceName 原值及完整前快照。
- 在 app_chat_logs 放两个不同历史时间桶，分别保留 source=share/api；对应 Chat 当前来源为 API B。记录所有计数、总积分、token、时间等原值。统计桶只允许使用自身已有分类，不从当前 Chat 逆推 ID。
- 建立精确 appId/chatId/_id 白名单；主库查询 chats 投影来源及身份，日志库查询 app_chat_logs 的来源/计数。索引用只读 getIndexes/explain，区分代码管理索引与客户自建索引。
- 清理：销毁独立测试资源或按 manifest 回收，保留脱敏进度/失败证据；故障注入后恢复节点与开关。未执行本例，不代表迁移通过。

## 测试步骤

| 子场景 | 类型与起始状态 | 操作 |
| --- | --- | --- |
| C1 | 回填；H 初态 | 所有相关节点已运行兼容版本后，通过已注册任务的实际管理员入口触发，轮询进度每 2 秒、最长 10 分钟；超时保存状态不擅自重置。 |
| C2 | 并发；恢复 H | 扫描读取 H5/某旧记录后，用真实授权 API 运行保存新的来源，再让迁移提交该批。 |
| C3 | 重试；独立 H 副本 | 在业务批次已提交、checkpoint 尚未保存时中断 worker，恢复后重新调度；再演练存在失败记录且 checkpoint 已前进的重试。 |
| C4 | 错误恢复；H6 | 观察结构异常记录和任务终态；通过确定的业务修复/测试夹具修复后，使用框架重试入口，不直接修改任务状态集合。 |
| C5 | 兼容；升级前后同 H | 混合节点阶段、全部兼容节点阶段、回填完成后各取来源/名称、筛选与统计快照；旧 API/MCP 无 ID的对话由授权调用续聊一次。 |
| C6 | 清理边界；回填完成后 | 检查旧字段和当前/废弃索引声明；若实现了后续独立清理任务，再在兼容窗口结束的副本验证字段/索引清理及回滚目标。 |

## 预期结果

公共断言：迁移仅追加可靠来源，不改凭证、身份归属、消息正文或历史计数；未解决结构错误与“历史 ID 不可恢复”分别报告。已存在/并发写入的最新 publishSource 不被扫描旧值覆盖。进度/错误不包含密钥和正文。

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| C1 | H1→share/S1._id；H2保留分类无 id；H3仅分类不按名称猜 Key；H4保留原分类且不由残留 shareId 重判；H5保留；H6记录异常。统计桶只回填自身 type，无当前 Chat 的新渠道 ID；所有历史数值计数不变。 | H→目标逐条投影、各分类计数和任务结果。 |
| C2 | CAS 冲突后重读/核验，不用旧来源覆盖新运行；不能把未验证的跳过项直接算成功。 | 并发时间线、前后来源与 task 进度。 |
| C3 | 重放幂等、不重复计数；完整未解决错误快照在断点推进前持久化，恢复时先重试已跳过错误，再续扫，Checkpoint 不含业务正文。 | 实际 checkpoint/错误快照和不重复的目标数据。 |
| C4 | 未解决结构问题不能标记成功；修复并重试后达到声明的完成条件，框架收敛结果/错误。无法恢复的历史 id 不被伪造。 | 管理页面终态及精确错误记录。 |
| C5 | 混合阶段维持兼容读写，不出现新旧来源不同步；界面缺 type 为 `-`，名称仍可回退 sourceName；旧缺 type/id 不强制新增来源检查，授权续聊后写入本次最新来源；统计不会因界面缺字段漏数。 | 各阶段快照、实际续聊响应与统计差集。 |
| C6 | 首轮回填保留旧字段，尤其 sourceName 不在本期清空；索引只能按明确的 defineIndex/deprecated 定义处理，不提前删仍服务旧查询的索引，不删客户自建索引。回滚只到理解新来源的兼容版本。 | 迁移前后字段投影、索引精确差集及声明。 |
