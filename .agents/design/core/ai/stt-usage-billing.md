# STT 用量与计费

## 范围

STT 模型各自保存计价口径，网页语音输入、公众号语音和飞书语音采用同一套用量适配与计费方法。其他模型保持现有价格规则，团队模型仍免费。

## 模型价格

`pricing.type` 与模型类别 `model.type`、上游返回的 `usage.type` 是不同字段。模型类别仍为 `stt`；新增的价格类型只允许以下两种：

```typescript
// 每 60 秒 0.2 积分；N 可独立调整。
pricing: { type: 'duration', unitPrice: 0.2, secondsPerUnit: 60 }

// 每百万输入与输出合计 Tokens 10 积分。
pricing: { type: 'tokens', unitPrice: 10 }
```

时长费用为 `seconds / secondsPerUnit * unitPrice`；Tokens 费用为 `totalTokens / 1_000_000 * unitPrice`。N 是单价分母，不是分段进位步长。单次费用保留精度，时长不强制最少 1 秒，不做向上取整。

两种配置通过判别联合解析；Tokens 配置不保存秒数分母。表单提供计价类型单选，只有时长模式展示正整数 N。价格表和公开价格页展示对应单位。

缺少单价保持免费；单价 0 表示显式免费。清空 STT 单价时保留所选类型，但不恢复历史根级价格。其他模型保留原有清空语义。

## 权威用量

| 价格类型 | 唯一计费用量来源 | 缺失或无效时 |
| --- | --- | --- |
| duration | 上游 `usage.seconds` | 0 秒、0 积分 |
| tokens | 上游 `usage.total_tokens` | 0 Tokens、0 积分 |

客户端 `duration` 从请求契约和新客户端发送内容移除；旧客户端继续传入的未知字段会被剥离，不参与校验或计费。飞书消息自带的时长也不用于兜底。

上游 seconds 必须为有限非负数，保留小数；total_tokens 必须为安全非负整数。字符串、负数、NaN 和 Infinity 均记 0。不从识别文字估算、不将 Tokens 换算成秒数、不将秒数换算成 Tokens。

上游同时返回两种用量时，始终按模型价格类型选择一种。上游 `usage.type` 不切换本地价格类型；若它明确为 duration，其兼容填入的 total_tokens 不作为真实 Tokens 使用。

## 统一计费入口

原 `pushWhisperUsage` 改名为 `pushSTTUsage`，旧名字不保留转导。用量参数为明确的判别联合：

```typescript
usage: { type: 'duration', seconds: number }
// 或
usage: { type: 'tokens', totalTokens: number }
```

`getSTTBillableUsage({ pricing, usage })` 根据模型价格处理原始上游 usage，供三个业务入口复用。其输出 type 是本地选择的计费口径，不是对上游 type 的直接复制。

`pushSTTUsage` 接收本次实际调用的模型和上述用量，不重新查询默认模型，防止转写过程中默认模型变更造成错计费。内部再次校验用量与价格类型一致；类型不一致或绕过适配器传入非法数量时，在写账单前报内部错误。

通用价格计算的 STT 分支接收 `sttUsage`，不再把时长放进 inputTokens。原有 inputTokens/outputTokens 参数无法触发 STT 扣费。

上游缺少用量时正常返回识别结果，并保留对应口径的零用量账单。Pro 的扣积分队列对 0 积分直接跳过，不发生钱包扣款。

## 账单持久化

时长账单记录 duration；Tokens 账单新增 totalTokens，避免写入已废弃的 tokens 字段。新增可选的 sttBilling 快照包含：

- type：当时采用的价格类型。
- quantity：本次实际计费数量。
- unitPrice：当时的积分单价。
- unitSize：时长模式为 N，Tokens 模式为 1_000_000。

快照在生成账单时写入，不根据当前模型配置重新推导。Pro 创建明细、批量明细持久化、查询响应及共享 Schema 均透传新字段。详情展示总 Tokens 或时长以及计费类型。

## 兼容与迁移决定

本次不新增自动系统迁移任务。只扩展普通业务字段，不修改已有索引，现有索引也没有因此废弃。

旧 STT `pricing: { unitPrice }` 在统一 Schema 中解释为 duration、secondsPerUnit=60，单价数值不变。读取不写回 Mongo；下次保存、安装或导入时写明确类型。未配置和显式清空保持免费，不从历史根字段重建价格。

因此，新运行期接收到的已定价 STT 配置具有明确类型，同时无需扫描模型集合。此兼容只针对旧价格数据，不允许客户端时长成为用量来源。

历史账单不回填新用量字段、不重算价格、不调整余额。旧记录缺少快照时按原保存字段展示，不使用当前价格判断它以前的计价方式。

### 升级边界

FastGPT 与 Pro 共同升级。旧版本只认识每 60 秒，无法正确解释 Tokens 或自定义 N；应在所有计费入口升级后启用新模式。回退旧版本前须先把使用中的 STT 价格恢复为旧版本支持的每 60 秒配置，不能仅忽略新字段。

已有历史价格单位迁移的规则仍以 [模型计价统一为百万单位](./model-token-price-unit.md) 为准；本设计不重新注册或修改已发布迁移。

## 验证范围

局部验证以下行为，不运行全仓测试：

- 两种计价模式、N 秒分母、亚秒级时长、显式免费和团队免费。
- 上游同时返回 seconds 与 total_tokens，价格配置只选择对应字段。
- 缺少用量、非法数字、duration 兼容 Tokens 字段均不误扣费。
- 伪造或省略客户端 duration 不影响接口成功及实际费用。
- 表单切换与保存、公开价格单位、JSON 导入导出、Mongo 模型保存和运行目录。
- 网页 API 使用真实计费函数；公众号和飞书使用统一适配器。
- Pro 使用真实 MongoDB 集成测试验证数量和快照落库、0 积分不进入扣款队列。
- 用量类型不匹配和非法直接调用在持久化之前失败。
