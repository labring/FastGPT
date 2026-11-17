# 旧版自定义文本审核接口兼容调研

## 结论

建议新增一个 moderation 类型的“旧版自定义审核协议”适配插件，而不是恢复 `global.textCensorHandler`、模型 `config.censor` 与新策略并行执行。客户已有 HTTP 服务无需改协议；管理员安装适配插件并迁移原 URL。首版以人工配置迁移为宜，自动迁移需另行确认启用范围、安装依赖及异常策略。

本次仅调研与设计，不修改运行逻辑，不调用客户服务。以下以当前附加代码与 Git 历史为一手依据；未通过网络验证客户服务。

## 1. 旧协议实际是什么

### 外部客户自定义服务

- 配置：`fastgptPro.censor.customCensorURL`；非空时优先于百度审核配置。
- 方法：`POST`，`Content-Type: application/json`。
- 请求体：`{"text":"待审核文本"}`，不是新插件的 `input.content`，也不是 OpenAI messages。
- 响应体直接为 `{"success": true|false, "message": "说明"}`，没有 `data` 包装。
- 实现只读 `success`、`message`，没有 Zod 运行时校验：`success` 为真值即通过，否则拦截。因此字符串 `"false"` 也会被旧代码错误当作通过；不建议延续这种隐式转换。
- 没有单独配置 Authorization、自定义 headers、重试、文本切片或本地 timeout；不能把“没有本地 timeout”解释成无限等待，底层代理/客户端仍可能设置限制。
- 使用 `axiosWithoutSSRF`，允许管理员配置内网服务；当前有私网访问回归测试。

来源：
- `fastgpt-pro/admin/src/service/common/censor/custom.ts:7-36`
- `fastgpt-pro/admin/src/pages/api/common/censor/check.ts:27-40`
- `fastgpt-pro/admin/src/types/index.ts:9-15`
- `fastgpt-pro/admin/test/service/common/censor/customInternal.test.ts:35-74`

### Pro 内部协议不是客户接口协议

`censorCheckCustom` 将 `success` 真值转换为 `{code:200}`，否则转换为 `{code:5000,message}`。Pro `/common/censor/check` 使用内部请求鉴权，再转发至自定义服务或百度服务。客户配置 URL 不应指向这个内部鉴权接口，也不能将内部 `{code}` 当作旧客户标准。

来源：`fastgpt-pro/admin/src/pages/api/common/censor/check.ts:16-35`、`custom.ts:28-36`。

### 异常与业务调用范围

旧 `postTextCensor` 只在 code 严格等于数字 5000 时拒绝；其余返回和异步请求错误放行。`censorCheckRequest` 的 try/catch 没有 await，不会捕获后续 Promise rejection；最终 fail-open 主要来自 `postTextCensor` 的 catch。

旧模型调用只在 `model.config.censor` 为真且未使用 `externalProvider.openaiAccount.key` 时执行，文本拼接为 systemPrompt 与 userChatInput。旧链路不是全站所有输入、历史、模型输出的通用审核。直接启用新 userInput/modelInput/finalOutput 策略可能扩大送审数据范围和调用次数。

历史依据（FastGPT，删除前基线 `10a05a073^`）：
- `packages/service/core/chat/postTextCensor.ts:1-15`
- `packages/service/core/workflow/dispatch/ai/chat/dispatchChatCompletion.ts:128-136`
- `packages/service/core/workflow/dispatch/ai/toolcall/index.ts:174-181`
- `projects/app/src/pageComponents/admin/config/model.tsx:89-103`

## 2. 推荐适配方案

### 插件职责

新增独立 HTTP moderation 适配插件：

1. 插件配置保存原 `customCensorURL`，向该 URL POST `{text: input.content}`；不向客户服务发送插件 secrets、systemVar、完整对话历史或新增元信息。
2. 严格校验客户响应为对象，`success` 必须是 boolean，`message` 可选 string；未知字段可忽略。非法 JSON、缺少 success、错误类型、超时、非 2xx 归入服务异常，不伪造通过或违规命中。
3. 超时显式有界；首版不自动重试，避免重复发送隐私文本、增加流式审核延迟与客户服务负载。
4. 不虚构标签、命中词或置信度。旧协议只有总体通过/拦截，`message` 不能当作关键词。
5. plugin provider 与其他适配器一致，使用 factory 生成标准返回，运行时开关仍归 FastGPT 策略。

### 映射表

| 旧 HTTP 结果 | 新 verdict | hits / keywords | 说明 |
|---|---|---|---|
| `success: true` | `pass` | 空数组 | 不依赖 message 判定 |
| `success: false` | `block` | 空数组 | 旧协议没有 suspected |
| timeout / 网络异常 / 非 2xx / 非法响应 | `error` | 空数组 | 提供不含凭据与正文的 errorMessage |

新 `ModerationResult` 的 `errorMessage` 仅用于 error。旧违规 `message` 不应滥用该字段：若要继续向用户呈现客户服务的拒绝原因，需要单独评审可选 `reason`/拒绝文案字段，贯穿 SDK、记录、UI 与业务拦截。首版也可统一使用 FastGPT 拦截文案，但这不是完整的旧提示文本兼容。

新标准依据：`fastgpt-plugin/packages/domain/src/value-objects/moderation.vo.ts:21-106`。
策略依据：`FastGPT/packages/service/core/plugin/moderation/checker.ts:115-157`。

### fail-open 由宿主策略承担

为了接近旧异常处理，迁移时建议将 `serviceExceptionAction` 明确设为 `pass`，仍记录 error。不要在插件里吞掉网络异常并返回 pass，否则管理员将策略改为 block 后也不能生效。选择 fail-closed 是产品安全配置变化，应明确告知，不作为隐式迁移行为。

### 内网与安全边界

旧请求从 FastGPT/Pro 进程发出，新插件请求从 Plugin Server pod 发出。即使 URL 不变，网络、DNS、代理、证书信任与源 IP 白名单也可能不同：

- `localhost` 不再代表原 FastGPT/Pro 服务宿主。
- 私网地址必须由 Plugin Server 所在网络可达；需要按实际执行位置验证，而不是只在浏览器或 FastGPT 进程 curl。
- 插件网络沙箱由 `POOL_SERVICE_POD_ALLOW_NET` 等运行环境控制，不应简单宣称配置 URL 后即可访问。
- URL 只能由系统管理员配置，不开放给普通团队用户；可访问内网是受信运维配置的边界，而不是通用 SSRF 绕过能力。
- 不自动给新插件附加旧内部 Pro token；不日志输出完整 URL query、请求正文或客户完整响应。

依据：`fastgpt-plugin/packages/infrastructure/src/plugin/plugin-runtime/drivers/local-pool/pod/index.ts:475-508`；旧私网测试同上。

## 3. 方案对比

| 方案 | 优点 | 问题 | 建议 |
|---|---|---|---|
| moderation 协议适配插件 | 统一策略、记录、配置测试、生命周期；客户端无需改协议 | 请求发起位置迁移；需安装插件 | 推荐默认路径 |
| FastGPT 内置 legacy provider | 原网络出口可保留；易做临时回退 | 宿主新增插件旁路与专有实现，长期双轨 | 仅在明确存在不可迁移网络约束时另议 |
| 恢复旧 global hook 并行调用 | 短期代码少 | 重复审核、不同放行策略、遗漏锚点、模型级开关与全局策略冲突 | 不推荐 |
| 要求客户改成新接口 | 新协议最干净 | 不满足旧 HTTP 服务零改动诉求 | 可作为长期原生接入，不作兼容方案 |

## 4. 迁移验收与待确认项

- [ ] 确认范围是“旧 HTTP 协议兼容”，还是要求模型开关、独立密钥跳过及旧拒绝 message 全部兼容。
- [ ] 开发适配插件，配置 URL 与明确超时，补充中英文元数据；不在本次调研中实现。
- [ ] 单测覆盖 true/false、缺少 message、非法 JSON、错误类型、timeout、网络失败、非 2xx；保证 false 不依赖 message。
- [ ] 运行时验证 Plugin Server 到客户内网地址的可达性与网络沙箱、代理及证书设置。
- [ ] 保存配置探测使用固定非敏感文本；审核服务合法返回 block 说明服务可调用，不能误判为连通性失败。
- [ ] 人工迁移 URL 并选择审核锚点和异常策略；测试通过再启用；不自动开启模型输出审核或扩大送审范围。
- [ ] 如需自动迁移，走既有系统升级框架，设计幂等与断点恢复；插件不可用时不清空旧配置，不静默开启策略。
- [ ] 增加 legacy 拒绝原因字段前，先确认是否需要向最终用户回显，并限制长度、防止泄露上游服务内部信息。

当前不需要修改已有客户 HTTP 服务，也不需要还原已删除的 `postTextCensor.ts`。
