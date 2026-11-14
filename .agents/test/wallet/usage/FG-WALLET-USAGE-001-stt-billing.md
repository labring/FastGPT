---
case_version: 1
id: 'FG-WALLET-USAGE-001'
title: 'STT 按模型价格口径记录用量并扣除积分'
business: 'wallet/usage'
types: [api, ui, e2e, integration]
category: basic
scenario: success
priority: P0
status: ready
tags: [STT, 语音输入, Tokens, 时长计费, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, database, log]
sources:
  - packages/global/core/ai/model/schema.ts
  - packages/global/core/ai/model/pricing.ts
  - packages/service/core/ai/audio/utils.ts
  - packages/service/support/wallet/usage/controller.ts
  - projects/app/src/pages/api/v1/audio/transcriptions.ts
  - pro/admin/src/service/support/wallet/usage/utils.ts
  - pro/admin/src/service/support/wallet/controller.ts
routes:
  - POST /api/v1/audio/transcriptions
  - PUT /api/core/ai/model/update
  - POST /api/proApi/support/wallet/usage/getUsage
related: []
automation: []
baseline: '0b810741cc4b7c1259f26e402bde50053cd97a01'
---

# STT 按模型价格口径记录用量并扣除积分

## 用例简介

通过实际 FastGPT/Pro HTTP 服务上传确定时长的语音，连接 dev AI Proxy，核对转写响应、上游用量、账单及积分余额。真实上游场景与受控响应缺字段场景分别记录，不能将故障注入结果冒充模型本身返回了缺失用量。

## 前置准备

- 确认主站及 Pro 的实际提交，沿用本地 dev 已配置的服务。每轮新增测试团队、应用和 STT 模型并记录 ID；不得修改已有用户余额或原模型价格。临时切换默认 STT 时先记录原值，结束按清单恢复。
- 主站与 Pro 完整启动，使用已授权的开发环境，确认真实授权校验及商业计费已启用。不能以社区版跳过计费判定零计费通过；缺少授权时记录所需条件，不修改已有授权。
- 上传合成的 5 秒与 60 秒语音；以 ffprobe 和 PCM 样本数核对输入时长。通过可观测转发器连接实际 dev AI Proxy，记录请求 ID、实际上游 usage 与注入后的 usage；不保存凭证。
- 以独立模型的价格 `{type: duration, unitPrice:0.2}` 为 D0，固定每 60 秒。客户端 duration 传 77、极大值、非法字符串或省略，不能参与计费。
- 每个请求记录生成前后的 usages、usage_items 和 team_subscriptions.surplusPoints。对真实扣款轮询至余额变化与账单一致，最长 30 秒；零费用在队列周期后仍须无余额变化。
- 按 ID 清单删除本轮团队、应用、模型、账单及相关队列数据，恢复原默认模型；仅关闭本轮拥有的进程。保留脱敏报告与证据，删除临时会话凭证，不清空共享开发库。

## 测试步骤

| 子场景 | 起始状态                    | 输入与操作                                                            |
| ------ | --------------------------- | --------------------------------------------------------------------- |
| C1     | D0 按时长价格                   | 上传 5 秒语音，客户端 duration=77；真实转发 Qwen3-ASR-Flash。         |
| C2     | D0 按时长价格                   | 上传 60 秒语音，客户端 duration 传极大值；真实转发相同模型。          |
| C3     | 显式按时长每 60 秒 0.3 积分   | 模型配置确认无单位输入框，保存后上传 5 秒语音；检查固定按 60 秒分母计算，不分段进位。               |
| C4     | 切换输入 0.8、输出 2.7 积分/百万 Tokens | 上传 5 秒语音，省略客户端时长；真实上游同时返回秒数、输入和输出 Tokens；分别上传 5 秒及 60 秒音频。        |
| C5     | 按时长计费                  | 受控转发响应保留真实 total_tokens、删除 seconds；客户端提供伪造时长。 |
| C6     | 按 Tokens 计费              | 分别删除 input_tokens、output_tokens（同时保留 total_tokens 和 seconds），各执行一次。                         |
| C7     | 两种模式各执行一次          | 受控转发响应删除整个 usage，识别文本保持正常。                        |
| C8     | 按 Tokens 计费              | 受控响应 usage.type=duration，兼容 Tokens 字段填成秒数。             |
| C9     | 承接上述历史账单            | 再次改变模型价格，调用使用详情接口并读取历史明细。                    |

## 预期结果

公共断言：识别成功时 HTTP 和业务响应均成功；每次仅产生本轮对应账单，账单只保存所选口径的数量和已计算的积分，不额外保存价格快照；详情按数量字段展示 Tokens 或时长，无计费类型列。非零费用应与真实套餐积分变化一致，零费用不得扣除积分。所有查询限定本轮 teamId/请求时段。

| 子场景 | 验证方式               | 特有预期                                                                      | 证据获取方式                         |
| ------ | ---------------------- | ----------------------------------------------------------------------------- | ------------------------------------ |
| C1     | HTTP、数据库、余额     | 按上游 seconds/60\*0.2，Tokens 和客户端 77 不进入秒数；按明确的 duration 配置计费。 | 上游响应、账单、套餐余额前后值       |
| C2     | HTTP、数据库、余额     | 上游时长约 60 秒，费用为对应秒数/60\*0.2，不以 Tokens 或客户端值计算。        | 输入时长探测及上游 usage、账单、余额 |
| C3     | HTTP、数据库、余额     | 表单单位固定为 60 秒，费用为上游 seconds/60\*0.3，账单仅保存 duration 和 amount。                                | 模型更新响应及账单数量、金额               |
| C4     | HTTP、数据库、余额     | 按 (input_tokens\*0.8+output_tokens\*2.7)/1e6 扣费，分别保存 inputTokens/outputTokens，不写合计或伪造时长。            | 实际上游 usage 与总 Tokens 账单      |
| C5     | 故障注入、数据库、余额 | duration=0、积分=0；不从 total_tokens 或客户端 duration 兜底。                | 原始及注入后响应、零账单、稳定余额   |
| C6     | 故障注入、数据库、余额 | 缺少的一侧为 0，另一侧按对应单价收费；不从合计差值或 seconds 反推。                                    | 原始及注入后响应、零账单、稳定余额   |
| C7     | 故障注入、数据库、余额 | 两种模式均正常返回文字、对应计费用量 0、积分不变。                            | 两个变体各自响应与账单               |
| C8     | 故障注入、数据库、余额 | 不把 duration 兼容字段视为真实 Tokens，费用为 0。                             | 注入响应与零扣费证据                 |
| C9     | 查询接口、数据库       | 历史数量和金额不随当前配置改变；使用详情保留 inputTokens/outputTokens 或 duration，兼容历史 totalTokens，不新增价格快照或计费类型列。   | 查询 JSON 与原账单数量、金额对比           |
