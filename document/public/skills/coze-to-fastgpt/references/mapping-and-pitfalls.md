# Coze 到 FastGPT 迁移映射与排障手册

## 1. 资产与目录树映射

| Coze 资产 | FastGPT 资源类型 | 所属目录树 | CLI 创建命令 | 目录头像规则 |
| --- | --- | --- | --- | --- |
| 知识库（Knowledge） | `dataset` | `dataset` (`type: folder`) | `dataset create` | 服务端不自动补齐，建目录须显式传 `--avatar /imgs/files/folder.svg` |
| 知识库原始文件 | `dataset collection` | 归属知识库 | `dataset collection create-file` | N/A |
| 知识库文本分段 | `dataset collection` | 归属知识库 | `dataset collection create-text` | N/A |
| MCP 插件 | `toolSet` | `toolFolder` | `tool mcp create` | CLI 默认注入 `/imgs/files/folder.svg` |
| HTTP / OpenAPI 插件 | `httpToolSet` | `toolFolder` | `tool http create` | CLI 默认注入 `/imgs/files/folder.svg` |
| 自定义 Skill | `skill` | `skill` (`type: folder`) | `skill import` | 留空由服务端默认处理 |
| 工作流（Workflow） | `advanced` | `folder` | `agent create --type advanced` | CLI 默认注入 `/imgs/files/folder.svg` |
| 智能体（Bot，默认推荐） | `simple`（标准对话应用） | `folder` | `agent create --type simple` | CLI 默认注入 `/imgs/files/folder.svg`；支持全局变量、知识库、工具与工作流 |
| 智能体（Bot，按需升级） | `chatAgent`（对话 Agent V2） | `folder` | `agent create --type chatAgent` | CLI 默认注入 `/imgs/files/folder.svg`；仅在需要 Skill / 虚拟机沙箱 / 自主规划时使用，当前不支持全局变量 |

## 2. Coze 工作流节点 → FastGPT 节点映射

| Coze 节点类型 | FastGPT `flowNodeType` | `workflow-build` 模板 ID | 迁移注意点 |
| --- | --- | --- | --- |
| 开始（Start, type `1`） | `workflowStart` | `builtin:workflow-start` | 入口变量映射为 `userChatInput` 或全局变量 `chatConfig.variables` |
| 大模型（LLM, type `3`） | `chatNode` | `builtin:ai-chat` | 替换 `modelId` 为目标团队有效模型；`{{input}}` 改为上游引用或变量 |
| 代码（Code, type `5`） | `code` | `builtin:code` | Python/JS 需统一为 FastGPT 沙盒支持语法（常用 JS `function main({...})`）并声明动态 `inputs`/`outputs` |
| 结束 / 回复（End, type `2`） | `answerNode` | `builtin:assigned-answer` | 多路输出可通过 `{{$nodeId.outputKey$}}` 汇总展示 |
| 条件分支（Selector） | `ifElseNode` | `builtin:if-else` | 注意分支 handle 名称与 `workflow-build` 校验 |
| API / 插件（Plugin, type `4`） | `httpRequest468` / 工具节点 | `builtin:http-request` / 团队工具 | 公开 HTTP/MCP 可直接迁移；飞书云文档、LinkReader 等需独立 OAuth/凭证的 Coze 商店插件需标注人工补绑 |

## 3. CLI 返回值 ID 字段与关键选项速查

| 命令 | 返回 `data` 中的主 ID 字段 | 易错点 |
| --- | --- | --- |
| `file upload-avatar <path>` | `avatar` | 相对路径如 `/api/system/img/avatar/...`，可直接传给各资源的 `--avatar` |
| `dataset create`（含 `--type folder`） | `datasetId` | 创建目录时务必带 `--avatar /imgs/files/folder.svg` |
| `tool folder create` | `folderId` | 自动带目录头像 |
| `tool mcp create` | `appId` | 返回字段是 `appId`（非 `toolSetId`）；`intro` 建议随后用 `tool mcp update <id> --intro` 补写 |
| `tool mcp run` | 工具执行结果 | 工具名参数是 `--tool <name>`（非 `--tool-name`） |
| `skill folder create` | `folderId` | 不接受 `--avatar` |
| `skill import <zip>` | `skillId` | 仅接受 `.zip`，根目录需含 `SKILL.md` |
| `agent folder create` | `folderId` | 自动带目录头像 |
| `agent create` | `agentId` | 仅接受 `--type chatAgent\|simple\|advanced`（禁止 `workflow`）；`--file` 仅接受编译态 JSON（禁止带 `schemaVersion` 的 `workflow.json`） |

## 4. 实战高频踩坑与自愈方案

### 4.1 工作流反编译后出现多余 `catch` 边与 `catchError: true`
- **现象**：直接用手工 JSON `agent create` 后，`agent pull` + `workflow-build inspect` 在代码/工具节点上出现非预期的 `catchError: true` 与 `node@catch -> downstream@target` 连线。
- **修复**：
  ```bash
  fastgpt workflow-build edge disconnect --dir <ws> --from <nodeId>@catch --to <targetId>@target
  fastgpt workflow-build node update --dir <ws> --node <nodeId> --no-catch-error
  fastgpt agent save <id> --dir <ws> && fastgpt agent publish <id> --dir <ws> --version-name "<ver>"
  ```

### 4.2 `workflow-build validate` 报 `WORKFLOW_BINDING_UNVERIFIED`
- **原因**：`chatNode.modelId` 的自动化策略为 `remoteValidated`，本地校验无法证明远端团队模型权限，故输出 warning（`valid: true`, `diagnostics: []`）。
- **处理**：属于正常非阻断提示；通过 `agent test --detail` 或 `agent run` 实际触发一次模型调用确认 `finishReason: stop` 即可。

### 4.3 `chatAgent` 中 `agent_selectedTools` 需保持持久化契约
- **背景**：`GET /core/app/detail` 会把 `agent_selectedTools` 展开为前端展示态对象（带 `flowNodeType`/`outputs`、缺少 `config`、且 `inputs` 为完整 IO 项），而 `/core/chat/chatTest` 与创建/发布接口均要求 `CanonicalSelectedToolsValueSchema` 持久化态。CLI 执行 `agent test --remote` 时会自动通过 `serializeAgentTool` 还原远端展示态草稿；但在手工组装创建 JSON 或本地 `workflow.json` 时，仍必须写成持久化形态：
  ```json
  {
    "id": "<toolAppId>",
    "name": "<name>",
    "avatar": "<avatar>",
    "version": "<versionIdOrEmpty>",
    "source": "<source>",
    "toolConfig": {},
    "inputs": [{ "key": "userChatInput", "mode": "agentGenerated" }],
    "config": {}
  }
  ```
  再用 `agent test <id> --dir <ws> --local --detail` 跑通测试，并用 `agent publish` 推送最新引用版本。

### 4.4 `agent test` 报 `509001 unAuthSkill`
- **原因**：`chatAgent` 的 `skills` 输入中引用了已被删除或无权访问的 `skillId`。
- **修复**：用 `fastgpt skill get <skillId>` 核实目标 Skill 是否存在；若已删除，则在 `workflow.json` 中移除该悬空 `skillId` 后重新 `agent publish` 与 `agent test`。

### 4.5 工作流更新后 `chatAgent` 引用的工具版本过旧
- **原因**：工作流经 `workflow-build` 纠偏重新发布后生成了新的 `versionId`，`chatAgent` 节点内的工具快照可能仍指向旧版。
- **修复**：重新获取该工作流最新版预览信息（`version` 字段）并同步更新 `chatAgent` 的 `agent_selectedTools` 后再 `agent publish`。

### 4.6 Coze Bot 含全局变量时误选 `chatAgent`（Agent V2）导致变量不可编辑/不生效
- **原因**：FastGPT 的 `simple`（标准对话应用）完整支持全局变量（`chatConfig.variables`）与提示词变量插值，同时支持知识库和工具/工作流挂载；而 `chatAgent`（对话 Agent V2）当前版本暂不支持全局变量配置。
- **修复**：默认优先将 Coze Bot 迁移为 `--type simple`（按需组合 `chatNode`、`datasetSearchNode` 或 `toolCall`）；仅在明确需要 Agent Skill、虚拟机沙箱或 Agent V2 自主规划时再选用 `--type chatAgent`。若源 Bot 同时强依赖全局变量与 Skill，迁移前与用户确认优先保留哪项能力或改用 `advanced` 工作流承接变量。
