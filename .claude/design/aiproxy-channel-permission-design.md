# FastGPT x AIProxy Channel 权限绕过修复方案

## 1. 文档目的

本文档用于沉淀 `aiproxy` channel 权限绕过问题的预研结论，作为后续实施、联调、测试和上线的指导文档。

适用问题场景：

1. 用户 A 创建了自定义模型 `00000xxx001`，模型名为 `qwen-3.6`，且未配置 `requestUrl/requestAuth`。
2. root 创建了另一条模型 `00000xxx002`，模型名同为 `qwen-3.6`，并在 `aiproxy` 中配置了对应 `model-channel`。
3. 用户 A 在 FastGPT 中测试或调用自己的模型时，实际越权命中了 root 的 `model-channel`。

## 2. 问题结论

问题本质不是 FastGPT 的“模型读权限”失效，而是：

1. FastGPT 在校验用户可访问某个 `modelId` 后，调用 `aiproxy` 时只传了上游模型名 `model=qwen-3.6`。
2. `aiproxy` 默认按“模型名 -> channel 列表”做路由，不知道当前请求实际对应的是哪一条 FastGPT 模型配置。
3. 因此，只要不同 FastGPT 模型共享同一个上游模型名，且其中某些模型没有直连配置，`aiproxy` 就可能把请求路由到不属于当前 FastGPT 模型的 channel。

## 3. 根因拆解

### 3.1 FastGPT 侧

FastGPT 当前链路的关键特征：

1. 先用 `modelId` 做权限校验，只能证明“用户能访问这条 FastGPT 模型配置”。
2. 当模型未配置 `requestUrl/requestAuth` 时，请求会回退到全局 `AIPROXY_API_ENDPOINT + AIPROXY_API_TOKEN`。
3. 发往 `aiproxy` 的运行时请求，通常只包含上游模型名，不包含 FastGPT 侧的来源模型身份。
4. 模型测试接口只有在显式传入 `channelId` 时，才会使用 `Aiproxy-Channel` 指定 channel。

涉及代码入口：

- `projects/app/src/pages/api/core/ai/model/test.ts`
- `packages/service/support/permission/model/auth.ts`
- `packages/service/core/ai/config.ts`
- `packages/service/core/ai/llm/request.ts`
- `packages/service/core/ai/embedding/index.ts`
- `packages/service/core/ai/rerank/index.ts`
- `packages/service/core/ai/audio/transcriptions.ts`

### 3.2 AIProxy 侧

`aiproxy` 当前链路的关键特征：

1. `TokenAuth` 只识别 token/group 级别权限，不理解 FastGPT 的 `teamId/tmbId/modelId`。
2. 默认选路时，直接从 `model -> channels` 缓存里获取候选 channel。
3. 只要 channel 声明支持 `qwen-3.6`，就会进入候选集。
4. `aiproxy` 虽然已经可以解析部分请求体中的 `metadata`，但目前没有用它约束 channel 归属。

涉及代码入口：

- `../aiproxy/core/middleware/auth.go`
- `../aiproxy/core/controller/relay-channel.go`
- `../aiproxy/core/model/model_caches.go`
- `../aiproxy/core/middleware/distributor.go`

## 4. 设计目标

本次修复目标：

1. 阻断“同名上游模型”在 `aiproxy` 侧误命中其他 FastGPT 模型专属 channel 的问题。
2. 尽量不引入 FastGPT 权限体系与 `aiproxy` token/group 体系的深度耦合。
3. 尽量不改 `aiproxy` 的数据库表结构和基础鉴权模型。
4. 保持现有公共 channel 的兼容性。
5. 让模型测试、正常推理、embedding、rerank、TTS、STT 等链路都能复用同一套约束机制。

## 5. 非目标

本次方案不做以下事情：

1. 不把 FastGPT 的 `teamId/tmbId/协作权限` 完整同步到 `aiproxy`。
2. 不重做 `aiproxy` 的 token/group 权限模型。
3. 不要求所有自定义模型都必须填写 `requestUrl/requestAuth`。
4. 不改变公共 channel 的默认行为。

## 6. 选型结论

选用“来源模型身份透传 + channel 归属过滤”的轻量方案。

核心思想：

1. FastGPT 在每次发往 `aiproxy` 的请求中，显式带上“来源 FastGPT 模型 ID”。
2. `aiproxy` 在选择 channel 前，判断该 channel 是否被限制为某个 FastGPT 模型专用。
3. 若 channel 是专用 channel，则只有来源模型 ID 命中时才允许参与路由。
4. 若 channel 未配置该限制，则保持当前行为，继续作为公共 channel 使用。

这是对现有方案的“实施化细化”，不改变原始选型原则，只是把“来源模型身份”的承载方式从抽象概念落到可实现的协议上。

## 7. 为什么最终建议用请求头承载身份

原始预研里，来源身份建议放在请求体 `metadata` 中。这条思路对 JSON 请求成立，但直接落地有一个缺口：

1. `aiproxy` 当前只会在部分 JSON 模式下解析 `metadata`。
2. `AudioTranscription` 等 `multipart/form-data` 请求路径，并不会走相同的 `metadata` 解析逻辑。
3. 仅靠 JSON `metadata`，无法完整覆盖模型测试和全部模型调用链路。

因此，实施时建议：

1. 以请求头作为来源模型身份的主承载方式。
2. 对支持 JSON `metadata` 的链路，再镜像写入一份 `metadata`，方便日志和后续扩展。

这样可以统一覆盖 JSON 请求和 multipart 请求。

## 8. 协议设计

### 8.1 FastGPT -> AIProxy 请求身份

建议新增以下请求头：

```http
X-FastGPT-Model-Id: 00000xxx001
X-FastGPT-Team-Id: <optional>
```

字段约定：

| 字段 | 必填 | 说明 |
|------|------|------|
| `X-FastGPT-Model-Id` | 是 | 当前请求在 FastGPT 中对应的模型 ID |
| `X-FastGPT-Team-Id` | 否 | 当前模型所属团队 ID，仅用于日志或未来扩展 |

对支持 JSON 请求体的链路，建议同步写入：

```json
{
  "metadata": {
    "fastgpt_model_id": "00000xxx001",
    "fastgpt_team_id": "team-xxx"
  }
}
```

落地约束：

1. 只要请求最终走 `aiproxy`，就应带上 `X-FastGPT-Model-Id`。
2. 若模型本身配置了 `requestUrl/requestAuth`，直接走外部地址，则不强制要求该头。
3. 如果调用方已存在 `metadata`，应做 merge，不应覆盖业务已有字段。

### 8.2 AIProxy Channel 归属配置

基于 `Channel.Configs` 增加一个可选字段：

```json
{
  "fastgpt_owner_model_id": "00000xxx002"
}
```

字段定义：

| 字段 | 必填 | 说明 |
|------|------|------|
| `fastgpt_owner_model_id` | 否 | 声明该 channel 只允许某个 FastGPT 模型 ID 使用 |

选择这个字段的原因：

1. `Channel.Configs` 已经是扩展 JSON，无需表结构迁移。
2. 单值字段足够解决本次越权问题。
3. 语义清晰，便于排障和运营配置。

### 8.3 V1 匹配规则

V1 规则如下：

1. channel 未配置 `fastgpt_owner_model_id` 时，视为公共 channel，保持现有行为。
2. channel 配置了 `fastgpt_owner_model_id` 时：
   - 请求必须携带 `X-FastGPT-Model-Id`
   - 且请求头中的模型 ID 必须与 `fastgpt_owner_model_id` 相等
3. 不相等时，该 channel 不能进入候选集。
4. 对显式指定 channel 的路径，同样应用该校验，不能因为手工指定 `Aiproxy-Channel` 而绕过。

## 9. 路由行为定义

### 9.1 默认路由

默认路由流程调整为：

1. 先按当前逻辑拿到 `modelName` 对应的候选 channel 列表。
2. 再按 `fastgpt_owner_model_id` 与 `X-FastGPT-Model-Id` 进行二次过滤。
3. 过滤后的结果继续走原有优先级、错误率、重试和 fallback 逻辑。

### 9.2 显式 `Aiproxy-Channel`

当前 FastGPT 模型测试接口支持显式传 `channelId`。该路径必须补一层约束：

1. 先根据 `Aiproxy-Channel` 解析到 channel。
2. 再校验该 channel 是否允许当前 `X-FastGPT-Model-Id` 使用。
3. 校验失败时，直接返回无权限或 channel 不可用错误。

### 9.3 Pinned channel

`aiproxy` 某些链路会在上下文中带回 `ChannelID` 做回查。该路径同样应复用相同的归属校验函数，避免固定 channel 成为旁路。

## 10. 推荐实现方式

### 10.1 FastGPT 侧

建议新增一个统一的“AIProxy 请求身份构造器”，负责生成 headers 和 JSON metadata。

建议输出：

```ts
type AIProxyRequestIdentity = {
  headers: Record<string, string>;
  metadata: Record<string, string>;
};
```

建议责任：

1. 输入当前 `model.id`、可选 `teamId`。
2. 产出 `X-FastGPT-Model-Id` 和可选 `X-FastGPT-Team-Id`。
3. 对 JSON 请求产出可 merge 的 `metadata.fastgpt_model_id`。
4. 被 LLM、Embedding、Rerank、TTS、STT、模型测试等链路统一复用。

建议接入点：

- `projects/app/src/pages/api/core/ai/model/test.ts`
- `packages/service/core/ai/llm/request.ts`
- `packages/service/core/ai/embedding/index.ts`
- `packages/service/core/ai/rerank/index.ts`
- `packages/service/core/ai/audio/transcriptions.ts`
- 其他所有最终走 `AIPROXY_API_ENDPOINT` 的模型调用入口

### 10.2 AIProxy 侧

建议新增一个 channel 访问约束结构：

```go
type FastGPTChannelAccessConfig struct {
    FastGPTOwnerModelID string `json:"fastgpt_owner_model_id"`
}
```

建议新增一个统一判定函数，例如：

```go
func isChannelAllowedForFastGPTModel(c *gin.Context, channel *model.Channel) bool
```

判定逻辑：

1. 读取 channel `Configs.fastgpt_owner_model_id`
2. 若为空，返回允许
3. 读取请求头 `X-FastGPT-Model-Id`
4. 若请求头为空，返回不允许
5. 若两者不相等，返回不允许
6. 相等则返回允许

建议接入点：

1. `GetChannelFromHeader`
2. `GetChannelFromRequest`
3. `getAvailableChannels`

这样可以同时覆盖：

1. 默认按模型名选路
2. 显式 `Aiproxy-Channel`
3. pinned channel 回查

## 11. 兼容性策略

该方案默认兼容现网，前提是按以下方式上线：

1. 新代码上线后，不立即给现有 channel 配置 `fastgpt_owner_model_id`
2. 先让 FastGPT 稳定透传 `X-FastGPT-Model-Id`
3. 确认日志中已能看到来源模型身份
4. 再逐步给“专属 channel”补上 `fastgpt_owner_model_id`

兼容性结论：

1. 不配置 `fastgpt_owner_model_id` 的 channel 完全保持旧行为。
2. 新版 FastGPT 对旧版 `aiproxy` 是向后兼容的，旧版会忽略新请求头。
3. 新版 `aiproxy` 对未加限制的 channel 是向后兼容的。
4. 只有在 channel 被配置为专属后，请求侧才必须带上来源模型身份。

## 12. 测试与验收

### 12.1 必测正向用例

1. root 模型 `00000xxx002` 调用 `qwen-3.6`，命中自己配置的专属 channel。
2. 用户 A 模型 `00000xxx001` 调用 `qwen-3.6`，若存在自己的专属 channel，则命中自己的 channel。
3. 用户 A 模型 `00000xxx001` 调用 `qwen-3.6`，若只有公共 channel，则正常走公共 channel。
4. 模型测试接口显式指定正确的 `channelId`，测试通过。

### 12.2 必测反向用例

1. 用户 A 模型 `00000xxx001` 不能命中 root 模型 `00000xxx002` 的专属 channel。
2. 模型测试接口即使显式传入 root 的 `channelId`，也不能绕过限制。
3. 缺少 `X-FastGPT-Model-Id` 的请求，不能命中任何配置了 `fastgpt_owner_model_id` 的 channel。
4. multipart 链路的 STT 测试与调用，仍然能正确做归属校验。

### 12.3 回归用例

1. 未配置 `fastgpt_owner_model_id` 的历史 channel 不受影响。
2. 重试、错误率降级、优先级选路逻辑不受影响。
3. embedding、rerank、TTS、STT、LLM 的公共调用能力不受影响。

## 13. 上线建议

建议按以下顺序上线：

1. `aiproxy` 发布支持识别 `X-FastGPT-Model-Id` 和 `fastgpt_owner_model_id` 的版本。
2. FastGPT 发布统一透传 `X-FastGPT-Model-Id` 的版本。
3. 联调验证 headers 和日志字段已生效。
4. 先选一组 root 专属 channel 做灰度配置。
5. 验证无误后，逐步为所有需要隔离的 channel 配置 `fastgpt_owner_model_id`。

## 14. 方案边界与后续扩展

V1 的边界：

1. 一个专属 channel 只绑定一个 FastGPT 模型 ID。
2. 如果后续需要“一个 channel 允许多个 FastGPT 模型共享”，再扩展为：

```json
{
  "fastgpt_allowed_model_ids": ["model-a", "model-b"]
}
```

V1 不建议直接实现多值白名单，原因是：

1. 本次问题只需要解决“一对一专属 channel 被串用”。
2. 单值绑定更容易配置和排障。
3. 先上线最小闭环，再根据业务需要扩展。

## 15. 最终结论

最终推荐落地方案如下：

1. FastGPT 统一透传 `X-FastGPT-Model-Id` 作为来源模型身份。
2. 对 JSON 请求，额外镜像写入 `metadata.fastgpt_model_id` 用于日志和扩展。
3. `aiproxy` 在 channel `Configs` 中支持 `fastgpt_owner_model_id`。
4. `aiproxy` 在默认选路、显式指定 channel、pinned channel 三条路径上统一执行归属校验。
5. 未配置归属限制的 channel 继续保持公共行为。

该方案改动面小、耦合低、兼容性好，能以最小成本修复当前的 channel 权限绕过问题。
