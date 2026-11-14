# STT 用量与计费

## 范围

STT 模型各自保存计价口径，网页语音输入、公众号语音和飞书语音采用同一套用量适配与计费方法。其他模型保持现有价格规则，团队模型仍免费。

## 模型价格

`pricing.type` 与模型类别 `model.type`、上游返回的 `usage.type` 是不同字段。模型类别仍为 `stt`；新增的价格类型只允许以下两种：

```typescript
// 固定每 60 秒 0.2 积分。
pricing: { type: 'duration', unitPrice: 0.2 }

// 输入、输出每百万 Tokens 分别定价。
pricing: { type: 'tokens', inputPrice: 0.8, outputPrice: 2.7 }
```

时长费用为 `seconds / 60 * unitPrice`；Tokens 费用为 `(inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000`。60 秒是固定单价分母，不是分段进位步长。单次费用保留精度，时长不强制最少 1 秒，不做向上取整。

两种配置通过判别联合解析，均不保存可配置的单位分母。表单提供计价类型；时长模式一个单价，Tokens 模式分别配置输入和输出单价；按时长固定展示每 60 秒，按 Tokens 固定展示每 1M Tokens。价格表和公开价格页使用相同单位。

缺少单价保持免费；单价 0 表示显式免费。清空 STT 单价时保留所选类型，但不恢复历史根级价格。其他模型保留原有清空语义。

## 权威用量

| 价格类型 | 唯一计费用量来源 | 缺失或无效时 |
| --- | --- | --- |
| duration | 上游 `usage.seconds` | 0 秒、0 积分 |
| tokens | 上游 `usage.input_tokens`、`usage.output_tokens` | 各侧独立记 0，只收有效侧费用 |

客户端 `duration` 从请求契约和新客户端发送内容移除；旧客户端继续传入的未知字段会被剥离，不参与校验或计费。飞书消息自带的时长也不用于兜底。

上游 seconds 必须为有限非负数，保留小数；input_tokens/output_tokens 必须为安全非负整数。字符串、负数、NaN 和 Infinity 均记 0。不从识别文字估算、不将 Tokens 换算成秒数、不将秒数换算成 Tokens。

上游同时返回两种用量时，始终按模型价格类型选择一种。上游 `usage.type` 不切换本地价格类型；若它明确为 duration，其中任何兼容 Tokens 字段均不作为真实 Tokens 使用。

## 统一计费入口

原 `pushWhisperUsage` 改名为 `pushSTTUsage`，旧名字不保留转导。用量参数为明确的判别联合：

```typescript
usage: { type: 'duration', seconds: number }
// 或
usage: { type: 'tokens', inputTokens: number, outputTokens: number }
```

`getSTTBillableUsage({ pricing, usage })` 根据模型价格处理原始上游 usage，供三个业务入口复用。其输出 type 是本地选择的计费口径，不是对上游 type 的直接复制。

`pushSTTUsage` 接收本次实际调用的模型和上述用量，不重新查询默认模型，防止转写过程中默认模型变更造成错计费。内部再次校验用量与价格类型一致；类型不一致或绕过适配器传入非法数量时，在写账单前报内部错误。

通用价格计算的 STT 分支接收 `sttUsage`，不再把时长放进 inputTokens。原有 inputTokens/outputTokens 参数无法触发 STT 扣费。

上游缺少用量时正常返回识别结果，并保留对应口径的零用量账单。Pro 的扣积分队列对 0 积分直接跳过，不发生钱包扣款。

## 账单持久化

usage 保存本次总积分 totalPoints；usage_item 保存模型、实际计费用量及该项积分 amount。时长账单只记录 duration（秒）；Tokens 账单只记录 inputTokens、outputTokens，避免写入已废弃的 tokens 字段。上游两种数量同时存在时，账单仍只保存本次配置选择的计费用量；即使数量为 0 也保留对应字段。

不额外保存 STT 专属的类型、单价、分母或数量快照。单次金额在计费时计算并落库，历史记录直接读取已存数量及金额，不根据当前模型价格重算。Pro 创建明细、批量持久化及查询均透传所选数量。

详情按字段是否存在展示输入/输出 Tokens 或时长列，不增加计费类型列；字段值 0 显示为 0，未记录的字段显示横线。

## 兼容与迁移决定

新增普通后台任务 `20261112_backfill_stt_pricing_type`（4.18.0），在注册表末尾追加。按统一批大小、固定 `_id` 上界和游标断点处理系统及团队 STT 模型，不作为启动依赖；运行缓慢或失败均不阻塞业务。

旧 STT 价格缺少 `pricing.type` 时补 `duration`；缺少整个价格对象时写 `{type: 'duration'}`，保持免费。原单价、显式零价、未知旧字段和已配置的 duration/tokens 都保留，不换算金额。非法记录保存 ID 及原因，仅让后台任务失败，修复后通过管理员重试恢复。模型写入与目录修订号在同一事务内提交，读请求沿用已有目录修订号刷新机制，无需等待回填完成。

新 API/JSON 写入仍要求已配置价格明确声明类型。后台回填完成前，数据库读取使用最小默认值：STT 价格缺少类型时按时长解释，保留原单价。运行目录与管理员 JSON 导出共用 `formatDbModelToDocumentData`，不回写数据库；null 或无法识别的数据库价格按未配置价格处理，暂不计费，避免坏价格阻断业务。新 API/JSON 写入仍严格拒绝非法价格。

`instrumentation-node.ts` 和通用启动 helper 沿用主分支流程，不增加 STT 专属的 Provider 预载、Pro 健康检查顺序调整或迁移后强制重载。升级期间允许临时不计费或计费偏差，不为保证滚动期间的费用准确性增加启动屏障、版本协调或旧节点写入恢复流程。

历史账单按保存的数量及金额展示，不重算价格、不调整余额；已有历史价格单位迁移仍以 [模型计价统一为百万单位](./model-token-price-unit.md) 为准。

## Tokens 单价配置

Tokens 综合单价版本尚未上线，直接使用 inputPrice、outputPrice 两个独立字段，不增加单价迁移或旧综合价回退。
STT Tokens 明细直接记录 inputTokens、outputTokens，不额外保存合计、单价或计费类型。

## AI Proxy 契约

STT 统一返回 input_tokens/output_tokens，兼容上游 prompt_tokens/completion_tokens；显式原生字段优先（包括 0）。
缺少的项不从 total_tokens、音频时长、识别文字或另一侧估算。保留 total_tokens 的既有计数与服务器补齐 seconds 的逻辑。
无上游用量时，响应标记 duration，不把历史估算的 Tokens 暴露为真实输入输出；网关内部历史 total_tokens 计算保留。

## 验证范围

局部验证以下行为，不运行全仓测试：

- 两种计价模式、固定 60 秒和百万 Tokens 分母、亚秒级时长、显式免费和团队免费。
- 后台迁移、幂等重放、断点前崩溃、坏数据修复、并发改价、目录修订号事务回滚，以及 STT 任务失败时业务仍可启动；运行目录及 JSON 导出可读取未回填价格，保留配置与凭证且不回写数据库。
- 上游同时返回 seconds、input_tokens、output_tokens 与 total_tokens，价格配置只选择对应字段；两个 Tokens 单价不同，缺少一侧不从合计反推。
- 缺少用量、非法数字、duration 兼容 Tokens 字段均不误扣费。
- 伪造或省略客户端 duration 不影响接口成功及实际费用。
- 表单切换与保存、公开价格单位、JSON 导入导出、Mongo 模型保存和运行目录。
- 网页 API 使用真实计费函数；公众号和飞书使用统一适配器。
- Pro 使用真实 MongoDB 集成测试验证所选数量和金额落库、0 积分不进入扣款队列。
- 用量类型不匹配和非法直接调用在持久化之前失败。
