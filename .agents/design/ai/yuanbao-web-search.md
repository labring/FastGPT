# 元宝联网搜索接入

## 已确认需求

- 智能体、简易应用和工作流 AI/Agent 节点提供「元宝联网搜索」开关，默认关闭。
- 开启后模型自行决定是否搜索以及搜索关键词；检索结果进入模型上下文，并保留来源链接。
- 搜索失败以工具错误反馈给模型，保留普通对话能力，不泄露服务端凭据。
- 使用 `key/key.md` 中的腾讯云凭据及模型渠道配置；密钥仅保存在本地服务端配置和现有模型渠道中。
- 用户已经确认「按此方案直接实现」，后续按本方案连续执行。

## 技术方案

### 公共配置

新增 `NodeInputKeyEnum.enableWebSearch = 'enableWebSearch'`。应用表单的 `aiSettings.enableWebSearch` 与工作流节点输入共用该字段，缺失和 false 均不启用搜索。

在智能体、简易应用编辑表单及工作流 AI/Agent 节点中展示统一开关与说明。表单转换到工作流、从工作流读回表单、导入和保存均保留此字段。仅将布尔开关传给客户端；服务端搜索凭据不进入应用表单。

### 腾讯云搜索适配

复用 `/home/yuanbao/test.py` 的协议：`wsa.tencentcloudapi.com`、`SearchPro`、`2025-05-08`、请求字段 `Query`，响应 `Pages` 的元素可以是对象或 JSON 字符串。

服务端配置：`YUANBAO_SECRET_ID`、`YUANBAO_SECRET_KEY`。固定官方搜索地址，通过腾讯云 TC3-HMAC-SHA256 签名请求，设置超时和输入/输出上限。结果归一化为 query 与 results，单条包含 title、url、snippet 和可选发布日期。只保留 HTTP(S) 来源，去重并限制最多 10 条，限制单条摘要长度。

### 工具调用

共享工具名 `yuanbao_web_search`，输入 `{ query: string }`。工具说明要求模型在需要时搜索，并在回答中附上实际使用的来源链接。

Agent 的 fastAgent 和 piAgent 使用相同的工具 schema 和搜索执行器；复用现有工具事件、运行详情和取消机制。开关关闭时不注入工具、不发起搜索请求。

AI Chat 节点开启时采用有界的工具调用循环（最多 3 轮），保持原有历史、流式回复、用量、requestId、引用及最终节点响应约定。简易应用转换保留搜索参数，并复用已有工具调用节点路径或 AI Chat 的搜索支持。

### 模型接入及运行环境

使用已有模型和渠道管理能力接入文档中声明的 `gpt-6.1-sol` 与自定义服务地址。通过真实调用验证能力；如果上游拒绝访问，保留准确错误，不能宣称模型已经联通。

最初提供的模型上游探测收到 Cloudflare 403；用户随后提供替代地址 `https://yuzapi.fun`，已同步更新 `key/key.md` 及原模型渠道，模型名称保持 `gpt-6.1-sol`。新上游的对话、原生工具调用及 FastGPT AI Proxy 中转均已返回 HTTP 200。

## 验证范围

- 搜索适配：成功、字符串 Pages、空结果、坏条目、去重、URL 安全、输入上限、超时和上游失败。
- 工具运行：关闭无搜索工具，开启后模型可调用；错误能反馈并继续；fastAgent/piAgent 目录一致。
- 表单转换：智能体和简易应用 true/false/缺省的往返行为。
- AI Chat：工具轮次上限、最终响应和用量不丢失。
- 局部 Vitest、改动文件静态检查、真实元宝搜索和页面/API 验证。用户最终验收前不运行全量测试。

## 实施任务与进度

- [x] Task 1：公共字段与各编辑入口；先添加序列化失败用例，再实现字段映射和开关。
  - 修改 global workflow 常量、app/formEdit/type、应用默认值、Agent/AI Chat 模板。
  - 修改 ChatAgent/SimpleApp EditForm、utils 及工作流 NodeAgent/AI Chat 渲染。
  - 验证现有 utils 局部测试及新增开启、关闭、旧配置兼容用例。
  - 红灯：新增 6 个用例失败、既有 37 个通过；实现后 43/43 通过。
- [x] Task 2：搜索服务和运行时工具；先添加并运行失败测试，再实现。
  - 新建 `packages/service/core/ai/webSearch/yuanbao.ts`，维护 serviceEnv 搜索凭据声明和 `.env.template` 示例。
  - 为 Agent 工具目录与执行链路增加 `yuanbao_web_search`，为 AI Chat 增加有界工具调用支持。
  - 仅修改 service 与其测试，不修改 Task 1 的 global 和 frontend 文件。
- [x] Task 3：本地服务端凭据和模型渠道；使用已有服务/API 导入，不将凭据加入版本控制。
- [x] Task 4：集成检查和代码审查，修复后运行覆盖改动的局部测试。
  - 前端 68 个用例、后端及受影响执行链路 60 个用例均通过；TypeScript 与改动文件 ESLint 无错误。
  - 已修复审查发现的非布尔导入、工具卡片名称、流式文本与历史一致性、空响应多轮用量及真实请求工具模式问题。
- [x] Task 5：重启应用，验证搜索调用、开关保存、来源链接和普通对话兼容；交付运行入口和实际限制。
  - 腾讯云服务及真实 LLM→搜索→带来源回答通过；`/api/core/chat/chatTest` 的真实 Agent 执行已返回搜索事件与引用回答。
  - 浏览器确认开关可切换、保存后刷新仍保留；客户端无运行错误。
  - 已创建「元宝联网搜索示例」，配置 `gpt-6.1-sol` 并打开搜索开关。
  - 主应用和本地 MongoDB 使用独立 systemd 服务托管，避免终端中断导致退出。

## 执行约束

- 所有代码遵循 `.agents/code/syntax.md`；新增核心函数补充职责及边界注释。
- 不改任何部署相关 `.yml/.yaml` 文件。
- 如需新增 API，使用 `parseApiInput` 和完整 schema/OpenAPI 声明；优先复用已有模型渠道 API。
- 不新增 MongoDB 字段索引；如实现中需要修改 Schema 或索引，另按仓库索引维护规范处理。
- 当前目录在 `codex/yuanbao-web-search` 分支实现，便于现有运行实例直接验收。
- 搜索服务和 UI 通过唯一公共布尔字段与工具名集成；测试分批串行运行，避免多个 Mongo/Vitest 实例争抢资源。
