# aee6c0b1..labring/main 多轮复查报告

复查日期：2026-04-29  
基准提交：`aee6c0b1b0a37aa9e264abb1894903d7c023cfac`  
远程目标：`https://github.com/labring/FastGPT.git` `main`  
远程 HEAD：`ea8abf47a1af77c873bd523993321c5d6223ddbf`  
范围：9 个提交，165 个文件，`6979 insertions / 1821 deletions`

## 结论

第一轮报告中的 4 个问题仍然成立：

1. `P1` preview `workflow_run` 用高权限消费不可信 PR 构建产物。
2. `P1` SSRF 只校验初始 URL，未覆盖 redirect 和真实连接 IP。
3. `P2` `SKIP_FILE_TYPE_CHECK=true` 会绕过“禁止上传”的业务门禁。
4. `P2` 钉钉知识库编辑时无法安全保留 `App Secret`。

第二轮逐提交复查后，新增 1 个明确问题：

1. `P3` 无创建权限用户仍可能通过 UTM workflow 自动打开 JSON 导入弹窗，服务端会拦截，但前端权限面不一致。

第三轮复查后，新增 2 个明确问题：

1. `P2` Simple App 的 reasoning effort 设置不会写入底层 workflow 节点，保存后实际请求仍不带 `reasoning_effort`。
2. `P2` preview admin workflow 的 author gate 从 `MEMBER` 改成 `COLLABORATOR/OWNER`，会漏掉组织成员 PR；同时该 workflow 仍在 `pull_request_target` 中 checkout PR head 并使用 `PRO_SUBMODULE_TOKEN`，需要按高风险信任边界处理。

第四轮复查补充：

1. `test-fastgpt-pro.yaml` 也属于同一类 `pull_request_target` + PR head checkout + `PRO_SUBMODULE_TOKEN` 信任边界，已合并到 GitHub Actions `P2` 问题。
2. 新增 `P3` 钉钉文档类型过滤风险：`doc` 子串匹配会把 `.doc/.docx` 等普通文件当作可读在线文档展示，后续导入再失败。
3. 新增 `P3` workspace 覆盖风险：`pnpm-workspace.yaml` 从 `projects/*` 收窄后排除了 `projects/volume-manager`，根目录 `pnpm --filter @fastgpt/volume-manager ...` 已无法匹配该包。

另有 2 个建议补测的风险缺口：变量更新校验的前端回归测试、钉钉开放 API 实际 ID/分页行为联调。code-sandbox 内网检查疑点在最后一轮重新归类为默认配置风险。

最后一轮详细复查补充：

1. 修正 1 个误报：`reasoning_response` 的实际文案已是“隐藏 AI 思考 / Hide AI reasoning”，`isChecked={!reasoning}` 与当前文案和保存值一致，不再作为问题保留。
2. 新增 1 个 `P2/配置风险`：code-sandbox JS `SystemHelper.httpRequest` 在默认部署配置 `CHECK_INTERNAL_IP=false` 下会放行 RFC1918/ULA 私网地址，而安全测试在 `CHECK_INTERNAL_IP=true` 下运行；Python worker 又始终阻止私网，形成默认安全姿态与运行时行为不一致。
3. 修正此前的 sandbox dev 疑点：`NODE_ENV=development` 的跳过逻辑存在于工具函数中，但 worker 子进程当前只透传 `PATH` 和 `CHECK_INTERNAL_IP`，未透传 `NODE_ENV`，因此更准确的风险是默认私网策略和测试环境不一致。

## 问题列表

### P1: preview workflow 会把不可信 PR 构建产物提升到高权限环境

相关提交：

- `073bd5914 fix: skip allowed extensions (#6854)`
- 也覆盖本范围内新增/调整的 preview build/push workflow。

证据：

- `.github/workflows/preview-fastgpt-build.yml:3-5` 在 `pull_request` 上运行。
- `.github/workflows/preview-fastgpt-build.yml:25-29` checkout 的是 PR head 仓库和 head sha。
- `.github/workflows/preview-fastgpt-build.yml:51-63` 从 PR 代码构建 Docker image tar。
- `.github/workflows/preview-fastgpt-push.yml:3-6` 通过 `workflow_run` 接续 build。
- `.github/workflows/preview-fastgpt-push.yml:13-20` push 阶段有 `packages: write`、`id-token: write`、`pull-requests: write`、`issues: write`。
- `.github/workflows/preview-fastgpt-push.yml:44-76` 直接下载、`docker load`、tag 并 push build 产物。
- `.github/workflows/preview-docs-build.yml:3-7` docs build 同样由 `pull_request` 触发。
- `.github/workflows/preview-docs-build.yml:22-26` docs build 同样 checkout PR head 仓库。
- `.github/workflows/preview-docs-push.yml:13-20` docs push 有写包权限。
- `.github/workflows/preview-docs-push.yml:62-75` docs push 还会使用 `KUBE_CONFIG_CN` 更新预览环境 deployment。

风险链路：

1. 外部或低信任 PR 修改 Dockerfile、构建脚本或文档站构建产物。
2. `pull_request` build 在低权限上下文里生成 Docker tar artifact。
3. `workflow_run` push 在 base repo 高权限上下文里下载同一个 artifact。
4. push job 没有重新按可信规则 checkout/rebuild，也没有校验 PR 作者、head repo 是否可信、当前 PR head 是否仍等于 artifact 中的 sha、artifact digest/provenance 是否来自可信构建。
5. 结果是不可信 PR 产物被推送到 GHCR；docs preview 还会部署到集群预览环境。

建议：

- 不要在高权限 `workflow_run` 中 `docker load` 来自 untrusted PR 的 image tar。
- 对 fork PR 只构建不发布；发布预览镜像改成 maintainer 手动触发、可信 label 触发、或仅 same-repo trusted branch 触发。
- 如果必须自动发布，push 阶段必须重新验证 PR head repo/author association/current head sha，并在高权限 job 内从可信 ref 重新构建，而不是消费 artifact。
- docs deployment 尤其应与不可信 PR artifact 隔离，避免预览集群执行未审核镜像。

### P1: SSRF 校验没有覆盖 redirect 与真实连接 IP

相关提交：

- `225cb7e62 perf: catch error toast (#6849)`
- `1fd5eed88 perf: ssrf check (#6852)`
- `109a1f189 perf: codex-sandbox check (#6851)` 中 code-sandbox 自有 `SystemHelper.httpRequest` 处理得更完整，但主服务 axios/MCP 链路仍有缺口。

证据：

- `packages/service/common/api/axios.ts:8-24` 只在 axios request interceptor 中对最终发起前的 URL 调 `isInternalAddress`。
- `packages/service/common/api/axios.ts:29-46` safe axios 仍使用标准 axios/ProxyAgent 行为，未禁用 redirect，也未配置 redirect 前二次校验。
- `packages/service/common/system/utils.ts:119-178` `isInternalAddress` 是 DNS 预解析检查，未绑定真实 socket 连接 IP；DNS rebinding 或解析差异仍可能绕过。
- `packages/service/core/app/mcp.ts:17-20` MCP URL 只在连接前校验一次。
- `packages/service/core/app/mcp.ts:52-65` `StreamableHTTPClientTransport` 后续 HTTP 请求由 SDK/fetch 执行。
- `packages/service/core/app/mcp.ts:67-90` SSE fallback 使用 fetch，默认会跟随 redirect。
- `packages/service/core/workflow/dispatch/ai/agent/sub/sandbox/skill.ts:210-213` sandbox 文件 URL 下载走 `pickOutboundAxios(...).get(...)`。
- `packages/service/core/ai/sandbox/toolCall/index.ts:93-99` sandbox tool 写入文件也会下载外部 URL。
- `projects/app/src/pages/api/core/app/mcpTools/runTool.ts:18-24` MCP tool API 只对入参 URL 做初始校验。

风险链路：

1. 攻击者提供 `https://public.example/file` 或 MCP endpoint。
2. 初始 URL/DNS 解析为公网，`isInternalAddress` 通过。
3. 服务端 HTTP 客户端跟随 302/307 到 `http://127.0.0.1`、metadata IP 或私网域名，或真实连接时 DNS 解析结果与预检不同。
4. 后续 redirect hop / socket 连接 IP 未再校验，仍可能访问内部地址。

建议：

- safe axios 设置 `maxRedirects: 0`，或在 `beforeRedirect` 中对每一跳重新做内部地址校验。
- 更强方案是统一 outbound client：自定义 DNS lookup、校验所有解析结果、连接到已校验 IP，并保持 `Host`/SNI 与原 hostname 对齐。
- MCP transport 需要同等规则，不能只在 constructor 前校验一次 URL。
- 增加 redirect-to-localhost、redirect-to-metadata、DNS rebinding 风格测试。

### P2: `SKIP_FILE_TYPE_CHECK=true` 会绕过上传禁用门禁

相关提交：

- `073bd5914 fix: skip allowed extensions (#6854)`

证据：

- `projects/app/src/pages/api/core/chat/file/presignChatFilePostUrl.ts:49-52` 只有在 `!env.SKIP_FILE_TYPE_CHECK && allowedExtensions.length === 0` 时才拒绝。
- `packages/service/common/s3/utils/uploadConstraints.ts:42-55` 没有 fileSelect 配置或没有启用扩展名时返回空数组。
- `packages/service/common/s3/validation/upload.ts:166-180` 允许列表为空时不做扩展名限制，且 `SKIP_FILE_TYPE_CHECK` 会跳过 MIME 探测。

风险链路：

1. 应用或节点关闭文件上传时，`allowedExtensions` 是空数组。
2. 开启 `SKIP_FILE_TYPE_CHECK=true` 后，预签名接口不再因为空数组拒绝。
3. 后续校验也因 allowed list 为空而不限制扩展名。
4. 一个本意为“跳过文件类型探测”的环境变量变成“允许任意文件上传”的业务开关。

建议：

- 将“是否允许上传”和“是否做 MIME/魔数检测”拆开。
- `allowedExtensions.length === 0` 应始终拒绝，除非另有显式业务配置表示允许任意扩展名。
- `SKIP_FILE_TYPE_CHECK` 只影响 `fileTypeFromBuffer`/MIME 探测，不应影响上传功能开关。

### P2: 钉钉知识库编辑无法安全保留 App Secret

相关提交：

- `ea8abf47a dingding (#6856)`

证据：

- `projects/app/src/pages/api/core/dataset/detail.ts:27-35` 返回数据前会过滤 `apiDatasetServer`。
- `packages/global/core/dataset/apiDataset/utils.ts:30-39` 钉钉 `appSecret` 被置空。
- `projects/app/src/pageComponents/dataset/ApiDatasetForm.tsx:283-292` App Secret 输入框仍是 required。
- `projects/app/src/pages/api/core/dataset/update.ts:168-194` 会递归 flatten 前端传来的 `apiDatasetServer`。
- `projects/app/src/pages/api/core/dataset/update.ts:197-212` flatten 后的字段直接写入 Mongo。
- `packages/service/core/dataset/apiDataset/dingtalkDataset/api.ts:141-147` 后续取 token 时没有 `appSecret` 会直接失败。

风险链路：

1. 用户打开已有钉钉数据集详情，后端出于安全把 `appSecret` 返回为空。
2. 前端编辑表单要求填写 App Secret，但没有“保持原密钥”的占位语义。
3. 如果用户保存空值或前端传回空字符串，update 会把空值写入数据库。
4. 下一次同步、添加文件、读取内容时 token 获取失败。

建议：

- 编辑场景不要把空 `appSecret` 写回，除非用户明确输入新 secret。
- 使用 placeholder/dirty flag 表示“已配置，留空则不修改”。
- update API 对 `appSecret === ''` 做 preserve，而不是覆盖。
- 增加创建、编辑不改 secret、编辑替换 secret、编辑清空被拒绝的回归测试。

### P2: pro 相关 workflow 的信任边界和 author gate 仍有问题

相关提交：

- `073bd5914 fix: skip allowed extensions (#6854)` 中 preview push 迁移到 GHCR。
- 该范围内 `.github/workflows/preview-admin-build.yml` 和 `.github/workflows/test-fastgpt-pro.yaml` 都修改了 author gate。

证据：

- `.github/workflows/preview-admin-build.yml:3-6` 使用 `pull_request_target`。
- `.github/workflows/preview-admin-build.yml:28` 条件从旧的 `author_association == 'MEMBER'` 改为 `COLLABORATOR/OWNER`。
- `.github/workflows/preview-admin-build.yml:32-37` 在 `pull_request_target` job 中 checkout PR head 仓库和 head sha。
- `.github/workflows/preview-admin-build.yml:39-51` 随后使用 `PRO_SUBMODULE_TOKEN` 更新子模块。
- `.github/workflows/preview-admin-build.yml:57-69` 用 checkout 后的代码/子模块构建 admin image artifact。
- `.github/workflows/preview-admin-push.yml:3-6` 后续由 `workflow_run` 接续。
- `.github/workflows/preview-admin-push.yml:12-19` push 阶段有 `packages: write`、`id-token: write`、`pull-requests: write`、`issues: write`。
- `.github/workflows/preview-admin-push.yml:27-42` 下载并 load build artifact。
- `.github/workflows/preview-admin-push.yml:54-59` 将 admin preview image 推到 GHCR。
- `.github/workflows/test-fastgpt-pro.yaml:3-4` 同样使用 `pull_request_target`。
- `.github/workflows/test-fastgpt-pro.yaml:23` 条件同样从 `MEMBER` 改为 `COLLABORATOR/OWNER`。
- `.github/workflows/test-fastgpt-pro.yaml:31-37` checkout PR head 仓库和 sha。
- `.github/workflows/test-fastgpt-pro.yaml:38-50` 使用 `PRO_SUBMODULE_TOKEN` 更新子模块，随后执行 `pnpm install --frozen-lockfile` 和 `pnpm test:admin`。

风险链路：

1. `pull_request_target` 运行在 base repo 安全上下文，能访问 repository secrets。
2. build job checkout 的却是 PR head 代码，并在该工作区内处理 `.gitmodules`/submodule。
3. `author_association` 不是精确权限判断；`COLLABORATOR` 可能扩大到并不应该接触 `PRO_SUBMODULE_TOKEN` 或 preview 发布链路的账号类型。
4. 新条件没有包含 `MEMBER`，对组织仓库来说 org member PR 可能不再触发 admin preview，形成 CI/预览回归。
5. `test-fastgpt-pro.yaml` 在同一信任上下文中运行 PR 代码的 install/test 脚本，风险不只限于 preview image。
6. admin build artifact 再由高权限 `workflow_run` 推到 GHCR，和前面的 preview image trust-boundary 问题叠加。

建议：

- admin preview build 不要在 `pull_request_target` 中直接 checkout PR head 后使用 secret。
- 如果必须支持 admin preview，应先用 GitHub API 校验 PR 作者对 base repo 的实际 permission 至少为 `write`/`maintain`/`admin`，不要只依赖 `author_association`。
- 条件里若仍想支持组织成员，应显式包含 `MEMBER`，并区分 `OWNER`、`MEMBER`、`COLLABORATOR` 的信任策略。
- submodule secret 使用阶段和 PR-controlled build/test 阶段隔离；发布阶段仍应避免消费未重新验证的 image artifact。

### P2/配置风险: code-sandbox JS 默认放行私网地址，测试与 Python 策略不一致

相关提交：

- `109a1f189 perf: codex-sandbox check (#6851)`

证据：

- `projects/code-sandbox/src/env.ts:50` 将 `CHECK_INTERNAL_IP` 默认值设为 `false`。
- `deploy/templates/docker-compose.prod.yml:258-260` 的 code-sandbox 服务默认也配置 `CHECK_INTERNAL_IP: false`；其他 docker compose 模板同样是 `false`。
- `document/content/self-host/upgrading/4-14/4149.mdx:21` 文档说明内网安全检查默认关闭，需要手动设置 `CHECK_INTERNAL_IP=true`。
- `projects/code-sandbox/src/pool/worker.ts:472-480` JS `SystemHelper.httpRequest` 通过 `isInternalAddress` 和 `isInternalResolvedIP` 判断是否阻止。
- `projects/code-sandbox/src/utils/ipCheck.util.ts:114-123`、`:136-169`、`:172-190` 只有在 `CHECK_INTERNAL_IP === 'true'` 时才把 `private/uniqueLocal/carrierGradeNat` 等非公网地址视为阻止；metadata、loopback、unspecified 仍始终阻止。
- `projects/code-sandbox/vitest.config.ts:19-22` 测试环境强制 `CHECK_INTERNAL_IP: 'true'`。
- `projects/code-sandbox/test/unit/security.test.ts:815-837` 的 JS 安全用例验证了 `10.x`、`172.16.x`、`192.168.x` 被阻止，但这是在测试环境强制开启内网检查的前提下。
- `projects/code-sandbox/src/pool/worker.py:50-60`、`:180-187` Python worker 使用固定 `_BLOCKED_CIDRS`，不读取 `CHECK_INTERNAL_IP`，因此 Python 默认会阻止私网，而 JS 默认会放行私网。

风险链路：

1. 默认部署模板把 code-sandbox 的 `CHECK_INTERNAL_IP` 设置为 `false`。
2. JS 沙箱用户代码可以通过 `SystemHelper.httpRequest` / `httpRequest` 访问容器网络可达的 `10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、IPv6 ULA 等私网服务。
3. 安全测试中“私网应被阻止”的断言因为 `vitest.config.ts` 强制开启了检查，不能证明默认部署姿态下也会阻止。
4. Python 运行时又始终阻止私网，导致同一个 sandbox HTTP helper 在 JS/Python 下行为不一致，用户和运维很难从配置上预测真实能力边界。

建议：

- 先明确产品安全目标：如果 code-sandbox 是执行用户或模型生成代码的边界，默认应考虑把 code-sandbox 模板改为 `CHECK_INTERNAL_IP: true`，或改用更直观的 `ALLOW_PRIVATE_NETWORK=false` 一类反向开关。
- JS 与 Python worker 应统一策略：都读取同一个配置，或者明确记录两个 runtime 的差异并分别测试。
- 补两组测试：`CHECK_INTERNAL_IP=false` 的默认行为测试、`CHECK_INTERNAL_IP=true` 的安全阻断测试，避免当前测试只覆盖开启状态。
- 如果为了兼容必须默认放行私网，应在部署文档把风险写清楚，并建议生产环境尤其是多租户/公网实例显式开启。
