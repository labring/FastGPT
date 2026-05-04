# aee6c0b1..labring/main Review 最终展示报告

生成日期：2026-04-30  
基准提交：`aee6c0b1b0a37aa9e264abb1894903d7c023cfac`  
目标分支：`https://github.com/labring/FastGPT.git` `main`  
目标 HEAD：`ea8abf47a1af77c873bd523993321c5d6223ddbf`  
范围：9 个提交，165 个文件，`6979 insertions / 1821 deletions`  
详细过程报告：`.codex/issue/review-aee6c0b1-to-labring-main-deep-dive.md`

## 一句话结论

本轮提交中有 2 个高风险信任边界问题需要优先处理：preview workflow 会把不可信 PR 构建产物带入高权限发布/部署链路，主服务 SSRF 防护只覆盖初始 URL 而没有覆盖 redirect 与真实连接 IP。其余中风险集中在上传门禁、密钥保留、Simple App 配置持久化、pro workflow secret 边界，以及 code-sandbox 默认私网访问策略。

## 结果概览

| 等级 | 数量 | 结论 |
| --- | ---: | --- |
| P1 | 2 | 必须优先修复，涉及供应链/部署链路和 SSRF 信任边界 |
| P2 | 4 | 需要修复，涉及业务门禁、密钥、配置持久化、workflow secret |
| P2/配置风险 | 1 | 需要产品/安全策略确认，涉及 code-sandbox 默认私网访问 |
| P3 | 3 | 建议修复，涉及权限 UX、导入体验、workspace 覆盖 |
| 测试/联调风险 | 2 | 建议补测，避免后续回归 |

## 需要优先处理的问题

### P1: preview workflow 消费不可信 PR artifact 后高权限发布/部署

涉及文件：

- `.github/workflows/preview-fastgpt-build.yml`
- `.github/workflows/preview-fastgpt-push.yml`
- `.github/workflows/preview-docs-build.yml`
- `.github/workflows/preview-docs-push.yml`

核心风险：

`pull_request` 低权限 build 会 checkout PR head 并生成 Docker image artifact；后续 `workflow_run` 高权限 push job 拿这个 artifact 做 `docker load/tag/push`，docs preview 还会使用 `KUBE_CONFIG_CN` 更新预览环境。这里缺少对 PR 作者、head repo、当前 head sha、artifact provenance 的二次校验，也没有在高权限 job 中从可信 ref 重新构建。

建议处理：

- fork/低信任 PR 只构建不发布。
- preview 镜像发布改为 maintainer 手动触发、可信 label 触发，或仅 same-repo trusted branch 触发。
- 如果必须自动发布，高权限 job 必须重新校验 PR 当前 head 与信任级别，并在可信上下文内重新构建，不直接消费 PR artifact。

### P1: SSRF 防护没有覆盖 redirect 与真实连接 IP

涉及文件：

- `packages/service/common/api/axios.ts`
- `packages/service/common/system/utils.ts`
- `packages/service/core/app/mcp.ts`
- `packages/service/core/workflow/dispatch/ai/agent/sub/sandbox/skill.ts`
- `packages/service/core/ai/sandbox/toolCall/index.ts`
- `projects/app/src/pages/api/core/app/mcpTools/runTool.ts`

核心风险：

当前 safe axios/MCP 主要在请求前对初始 URL 做 `isInternalAddress`。如果公网 URL 返回 302/307 到 localhost、metadata IP 或私网地址，或者出现 DNS rebinding / 预解析与真实连接 IP 不一致，后续 redirect hop 与 socket 连接 IP 没有统一二次校验。

建议处理：

- safe axios 禁止自动 redirect，或在每一跳 redirect 前重新做内部地址校验。
- 统一 outbound client：校验所有解析结果，连接到已校验 IP，并保持 Host/SNI 语义。
- MCP transport 不能只在 constructor 前校验一次 URL。
- 增加 redirect-to-localhost、redirect-to-metadata、DNS rebinding 风格测试。

## 中风险问题

### P2: `SKIP_FILE_TYPE_CHECK=true` 会绕过上传禁用门禁

涉及文件：

- `projects/app/src/pages/api/core/chat/file/presignChatFilePostUrl.ts`
- `packages/service/common/s3/utils/uploadConstraints.ts`
- `packages/service/common/s3/validation/upload.ts`

核心风险：

应用或节点关闭文件上传时，`allowedExtensions` 为空。当前预签名接口只有在 `!SKIP_FILE_TYPE_CHECK && allowedExtensions.length === 0` 时拒绝，所以开启 `SKIP_FILE_TYPE_CHECK=true` 会从“跳过 MIME/魔数检测”扩大成“允许任意文件上传”。

建议处理：

- 上传是否允许与 MIME/魔数检测开关分离。
- `allowedExtensions.length === 0` 应始终拒绝，除非有明确的“允许任意扩展名”业务配置。

### P2: 钉钉知识库编辑无法安全保留 `App Secret`

涉及文件：

- `projects/app/src/pages/api/core/dataset/detail.ts`
- `packages/global/core/dataset/apiDataset/utils.ts`
- `projects/app/src/pageComponents/dataset/ApiDatasetForm.tsx`
- `projects/app/src/pages/api/core/dataset/update.ts`
- `packages/service/core/dataset/apiDataset/dingtalkDataset/api.ts`

核心风险：

详情接口会把钉钉 `appSecret` 过滤为空，但编辑表单仍要求填写；保存时 update API 会把前端传回的空值 flatten 后写入数据库。后续 token 获取依赖 `appSecret`，密钥被清空后同步/读取会失败。

建议处理：

- 编辑场景留空表示“不修改原 secret”，不要写回空字符串。
- 表单增加 dirty flag 或“已配置，留空不修改”的语义。
- 增加创建、编辑不改 secret、编辑替换 secret、编辑清空被拒绝的回归测试。

### P2: Simple App 的 reasoning effort 保存后不会生效

涉及文件：

- `projects/app/src/pageComponents/app/detail/Edit/SimpleApp/EditForm.tsx`
- `projects/app/src/pageComponents/app/detail/Edit/SimpleApp/utils.ts`
- `packages/service/core/workflow/dispatch/ai/chat.ts`
- `packages/service/core/workflow/dispatch/ai/toolcall/toolCall.ts`

核心风险：

Simple App 编辑页能修改 `aiChatReasoningEffort`，但 Simple App 转内部 workflow node 时没有把该字段写入 chat/tool call node inputs；重新打开也不会从 node 中还原该字段。运行时 dispatcher 只有在 node params 里存在该字段时才会传 `reasoning_effort`，所以用户保存后实际请求仍使用模型默认值。

建议处理：

- `appWorkflow2Form` 读取 `NodeInputKeyEnum.aiChatReasoningEffort`。
- chat node 和 tool call node inputs 生成时写入隐藏 input。
- 增加 Simple App 保存、重开、运行链路测试。

### P2: pro workflow 信任边界和 author gate 仍不安全

涉及文件：

- `.github/workflows/preview-admin-build.yml`
- `.github/workflows/preview-admin-push.yml`
- `.github/workflows/test-fastgpt-pro.yaml`

核心风险：

`preview-admin-build.yml` 和 `test-fastgpt-pro.yaml` 使用 `pull_request_target`，但 checkout PR head 后又使用 `PRO_SUBMODULE_TOKEN` 或运行 install/test。author gate 从 `MEMBER` 改为 `COLLABORATOR/OWNER`，一方面漏掉组织成员 PR，另一方面 `author_association` 不是精确权限判断。admin preview artifact 后续还会由高权限 `workflow_run` 推送到 GHCR。

建议处理：

- 不要在 `pull_request_target` 中 checkout PR head 后使用 secret。
- 使用 GitHub API 校验作者对 base repo 的实际 permission，至少为 `write`/`maintain`/`admin`。
- secret 使用阶段与 PR-controlled build/test 阶段隔离。
- 如果仍支持组织成员，应显式处理 `MEMBER` 策略。

### P2/配置风险: code-sandbox JS 默认放行私网地址

涉及文件：

- `projects/code-sandbox/src/env.ts`
- `projects/code-sandbox/src/utils/ipCheck.util.ts`
- `projects/code-sandbox/src/pool/worker.ts`
- `projects/code-sandbox/src/pool/worker.py`
- `projects/code-sandbox/vitest.config.ts`
- `deploy/templates/docker-compose.prod.yml`
- `document/content/self-host/upgrading/4-14/4149.mdx`

核心风险：

默认部署配置 `CHECK_INTERNAL_IP=false`，JS `SystemHelper.httpRequest` 在该配置下会放行 RFC1918/ULA 等私网地址；但测试环境强制 `CHECK_INTERNAL_IP=true`，安全测试证明的是开启状态，不是默认部署状态。Python worker 又使用固定 blocklist，默认始终阻止私网，导致 JS/Python 行为不一致。

建议处理：

- 明确产品安全目标：多租户/公网 code-sandbox 默认应倾向阻止私网。
- JS 与 Python worker 统一读取同一配置，或明确记录差异。
- 同时补 `CHECK_INTERNAL_IP=false` 默认行为测试和 `CHECK_INTERNAL_IP=true` 安全阻断测试。

## 建议修复的问题

### P3: 无创建权限用户仍可能打开 UTM JSON 导入弹窗

涉及文件：

- `projects/app/src/pages/dashboard/agent/index.tsx`
- `projects/app/src/pageComponents/dashboard/agent/JsonImportModal.tsx`
- `projects/app/src/pages/api/core/app/create.ts`

结论：

服务端会拦截无权限创建，因此不是权限绕过。但前端在 UTM workflow 存在时未检查 `hasCreatePer` 就自动打开导入弹窗，权限面与用户体验不一致。

建议：

- `useMount` 打开 UTM 导入前检查 `hasCreatePer`。
- 弹窗渲染也加权限保护。
- 无权限时清理 UTM workflow 或给出明确 toast。

### P3: 钉钉普通 Office 文档会被误判为可导入在线文档

涉及文件：

- `packages/service/core/dataset/apiDataset/dingtalkDataset/api.ts`

结论：

当前用 `includes('doc')` 判断可导入在线文档，`.doc/.docx` 等普通文件也可能命中。列表阶段显示可导入，真正读取时再因为 block API 不支持而失败。

建议：

- 改为按钉钉返回的 `type/category/docType/fileType` 做正向白名单。
- 对普通附件标记 unsupported 或直接过滤。
- 增加 `extension: 'docx'` 的测试。

### P3: `projects/volume-manager` 被排除出 pnpm workspace 覆盖

涉及文件：

- `pnpm-workspace.yaml`
- `projects/volume-manager/package.json`

结论：

workspace 从 `projects/*` 收窄到显式列表后，`projects/volume-manager` 不再被根目录 pnpm filter 匹配。本地验证 `pnpm --filter @fastgpt/volume-manager test --help` 返回 `No projects matched the filters`，但部署面仍使用 volume-manager 镜像。

建议：

- 如果仍由本仓库维护，加回 workspace 显式列表并补 CI。
- 如果有意移出 workspace，去掉 `catalog:` 依赖或补独立安装/测试说明。

## 测试与联调风险

| 风险 | 建议 |
| --- | --- |
| 变量更新节点 legacy boolean validator 缺前端回归测试 | 补覆盖 legacy boolean input 没有 `booleanMode` 但有 `value[1]` 的场景 |
| 钉钉真实 API ID/分页行为未联调 | 用真实工作区确认 wiki node ID 与 doc suite document ID 是否可共用，并确认 `hasMore=true` 但 `nextToken` 异常缺失时的行为 |

## 已排除或修正的疑点

- `reasoning_response` 开关不是反向问题：当前 i18n 文案是“隐藏 AI 思考 / Hide AI reasoning”，`isChecked={!reasoning}` 与 UI 语义匹配。
- 钉钉 `listNodes` 返回结构不是问题：`@alicloud/dingtalk@2.2.34` SDK 类型显示返回 `nodes[]`。
- 钉钉 `listWorkspaces` 返回结构不是问题：同一 SDK 类型显示返回 `workspaces[]`。
- OpenAI SDK v6.34.0 当前仍包含 `ChatCompletionCreateParams.Function`，reasoning effort 枚举也包含 UI 列表里的值。
- code-sandbox Node/tsdown 运行时未确认出镜像启动级断点：`build.sh` 会复制 `worker.py`，Docker runner 复制整个 `dist`，runtime deps 通过 `runtime.package.json` 安装。
- `serverRequest` / `plusRequest` 的 config 覆盖面当前未找到可达漏洞，但 helper 合约上建议未来限制 config 白名单，避免调用方传入 `baseURL` 或 `url`。

## 建议处理顺序

1. 立即处理两个 P1：preview workflow trust boundary、SSRF redirect/连接 IP。
2. 接着处理四个确认 P2：上传门禁、钉钉 secret preserve、Simple App reasoning effort 持久化、pro workflow author gate/trust boundary。
3. 同步确认 code-sandbox 默认私网策略，并统一 JS/Python 行为与测试口径。
4. 最后处理 P3 与补测：UTM 弹窗门禁、钉钉文档类型过滤、volume-manager workspace 覆盖、变量更新测试、钉钉真实 API 联调。

## 验证状态

- 远程 HEAD 已在 2026-04-30 重新确认，仍为 `ea8abf47a1af77c873bd523993321c5d6223ddbf`。
- 本次整理基于静态代码审查、远程 diff、SDK 类型核对和局部命令验证。
- 未运行项目全量测试，未做真实钉钉外部服务联调。
- SDK 类型核对包括 `openai@6.34.0` 与 `@alicloud/dingtalk@2.2.34`。
