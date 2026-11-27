---
name: coze-to-fastgpt
description: End-to-end migration workflow from Coze (扣子) to FastGPT China (cloud.fastgpt.cn) using the official FastGPT CLI (`fastgpt`), covering browser-assisted export, avatars, 4-tree folders, datasets, MCP/HTTP tools, skills, workflows with `workflow-build` verification/self-repair, chatAgents, and live smoke testing.
---

# Coze to FastGPT Migration Skill

使用最新 `@fastgpt/cli`（`fastgpt`）将 Coze 资产（知识库、MCP/HTTP 工具、Skill、工作流、智能体及头像）按依赖拓扑完整迁移至 FastGPT 国内版（`https://cloud.fastgpt.cn`），并通过 `workflow-build` 校验纠偏与在线冒烟完成闭环验收。

## 前置条件（开始前必须向用户确认）

1. **目标环境限制**：**暂时只支持迁移到 FastGPT 国内版（`https://cloud.fastgpt.cn`）**，不支持国际版或未适配的旧版本环境。
2. **FastGPT 账号与额度**：需要用户提供 FastGPT 国内版**账号和密码**用于 CLI 登录（建议同时在浏览器登录 `cloud.fastgpt.cn` 方便对照查看与可视化验收），并**确保当前团队具备可用额度**（知识库向量索引、工作流与智能体 `agent test`/`agent run` 冒烟均会消耗积分/模型额度）。
3. **Coze 浏览器登录态**：需要用户提前在浏览器中**登录 Coze（`https://www.coze.cn`）**，以便读取待迁移空间的 Bot、工作流、插件/MCP、知识库源文件与头像资源。

## 核心原则

1. **实时进度汇报（必须执行）**：**每迁移一个资源（目录、知识库、工具、Skill、工作流、智能体）的开始前和结束后，必须向用户即时汇报当前资源名称、状态与 ID**，禁止静默批量跑完再一次性汇报。
2. **依赖拓扑顺序**：严格按 `头像上传 → 四棵目录树 → 知识库 → MCP/HTTP 工具 → Skill → 工作流（advanced）→ 智能体（默认 simple，按需 chatAgent）→ 复核与冒烟` 执行，确保下游绑定全部引用真实的 FastGPT ObjectId。
3. **幂等可重入**：每步创建前先通过 `list` 按名称与 `parentId` 查重复用，避免中断重试产生重复资源。
4. **智能体类型按需选型（`simple` 优先）**：普通 Coze Bot **默认迁移为 `--type simple`**（标准对话应用，完整支持全局变量、知识库、MCP/HTTP 工具与工作流调用）；**仅在明确需要挂载 Skill、虚拟机执行沙箱或 Agent V2 自主规划时才采用 `--type chatAgent`（Agent V2）**。注意 Agent V2 目前不支持全局变量，若源 Bot 同时依赖全局变量与 Skill，须提前与用户确认取舍。
5. **工作流必须经 `workflow-build` 复核**：所有创建或导入的 `advanced` / `simple` / `chatAgent` 必须走 `agent pull` → `workflow-build validate` / `inspect` → 纠偏 → `agent save` / `agent publish` → `workflow diff` → `agent test --detail` 闭环。
6. **不兼容项显式透明**：Coze 平台专属插件（如飞书云文档、LinkReader 等需独立 OAuth/凭证的商店插件）无法自动迁凭证，必须在工作流说明与交付报告中显式标注需人工补绑。

## 迁移流程

### 阶段 0：CLI 就绪、前置核验与登录

1. 核对上述三项前置条件均已满足，并确认本地已安装 `@fastgpt/cli`（Node.js `>= 20.12.0`）：
   ```bash
   fastgpt --version
   ```
   若未安装或版本过旧，先执行安装（完整引导可参考 `/cli/skill.md`）：
   ```bash
   npm install -g @fastgpt/cli@beta
   ```
2. 若 CLI 尚未登录 FastGPT 国内版，通过标准输入传入用户提供的密码完成登录（避免在日志或命令行参数中明文回显密码）：
   ```bash
   fastgpt login --base-url https://cloud.fastgpt.cn --username <username> --password-stdin --profile china --format json
   ```
3. 确认目标账号、团队权限及可用模型列表：
   ```bash
   fastgpt whoami --profile china --format json
   fastgpt model list --profile china --format json
   ```
4. 明确目标团队可用的 LLM `modelId`（用于替换 Coze 模型 ID）和默认向量模型，并确认账户额度充足后再开始迁移。

### 阶段 1：Coze 资产盘点与导出

1. 复用用户已登录 Coze 的浏览器会话采集源资产，落盘到本地临时工作目录（如 `./tmp/coze-export/`）：
   - **智能体（Bot）**：完整配置（名称、简介、系统提示词、变量、开场白、推荐问题、绑定的知识库/插件/工作流列表、头像）。
   - **工作流（Workflow）**：完整 `schema_json`（节点、边、LLM 提示词、代码节点脚本、插件入参）与头像。
   - **插件 / MCP**：服务 URL、协议类型、Header 鉴权配置、OpenAPI/工具列表与头像。
   - **知识库（Knowledge）**：文档清单、原始文件（PDF/TXT/DOCX 等）或分段文本，以及知识库头像。
   - **自定义 Skill**：整理为标准 `.zip` 包（根目录含 `SKILL.md` 及可选 `scripts/`、`references/`）。
2. 将所有资源头像下载为本地图片文件（PNG/JPG/WEBP）。

### 阶段 2：上传头像与建构四棵目录树

1. 逐一上传 Coze 资源头像，记录返回的 `/api/system/img/avatar/...` 路径：
   ```bash
   fastgpt file upload-avatar <local-image-path> --profile china --format json
   ```
2. 按 FastGPT 四棵独立目录树创建迁移目录（注意目录头像规则——服务端**不会**为 `dataset`/`app` 目录自动补头像）：
   - **知识库目录**（必须显式传 `--avatar /imgs/files/folder.svg`）：
     ```bash
     fastgpt dataset create --type folder --name "<目录名>" --avatar "/imgs/files/folder.svg" --profile china --format json
     ```
   - **工具目录**（CLI 默认注入 `/imgs/files/folder.svg`）：
     ```bash
     fastgpt tool folder create --name "<目录名>" --intro "<说明>" --profile china --format json
     ```
   - **技能目录**（留空由服务端使用默认图标）：
     ```bash
     fastgpt skill folder create --name "<目录名>" --description "<说明>" --profile china --format json
     ```
   - **Agent 目录**（CLI 默认注入 `/imgs/files/folder.svg`）：
     ```bash
     fastgpt agent folder create --name "<目录名>" --intro "<说明>" --profile china --format json
     ```

### 阶段 3：迁移知识库与集合（`dataset`）

1. 开始前汇报；在知识库目录下创建知识库并绑定 Coze 知识库头像：
   ```bash
   fastgpt dataset create --name "<知识库名>" --intro "<说明>" --avatar "<datasetAvatar>" --parent-id "<datasetFolderId>" --profile china --format json
   ```
2. 按源文档模式导入集合：
   - 原始文件：`fastgpt dataset collection create-file <datasetId> <filePath> --profile china --format json`
   - 分段文本：`fastgpt dataset collection create-text <datasetId> --name "<文档名>" --file <txtPath> --profile china --format json`
3. 用 `fastgpt dataset collection list <datasetId> --profile china --format json` 核对集合总数，结束后汇报。

### 阶段 4：迁移外部工具（`tool mcp` / `tool http`）

1. **MCP 工具集**（开始前汇报）：
   - 探测工具列表：`fastgpt tool mcp parse <url> --profile china --format json`
   - 创建工具集：`fastgpt tool mcp create --name "<名称>" --url <url> --avatar "<mcpAvatar>" --parent-id "<toolFolderId>" --tool-list '<json>' --profile china --format json`（返回值字段为 `appId`）
   - 若创建接口未持久化 `intro`，紧接补写：`fastgpt tool mcp update <mcpAppId> --intro "<说明>" --profile china --format json`
   - 验收子工具与在线调用：
     ```bash
     fastgpt tool mcp children <mcpAppId> --profile china --format json
     fastgpt tool mcp run --url <url> --tool <toolName> --params '<json>' --profile china --format json
     ```
2. **HTTP 工具集**：按 `tool http parse` → `tool http create` → `tool http children` → `tool http run` 同流程验收，结束后汇报。

### 阶段 5：迁移 Agent Skill（`skill`）

1. 开始前汇报；导入打包好的 `.zip` 到技能目录：
   ```bash
   fastgpt skill import <skill.zip> --name "<skillName>" --description "<描述>" --parent-id "<skillFolderId>" --profile china --format json
   ```
2. 用 `fastgpt skill get <skillId> --profile china --format json` 校验 `currentVersionId` 与归属目录，结束后汇报。

### 阶段 6：迁移工作流并执行 `workflow-build` 复核纠偏（`agent` + `workflow-build`）

1. 开始前汇报；将 Coze `schema_json` 转换为 FastGPT StoreWorkflow JSON（`nodes`、`edges`、`chatConfig`，模型替换成目标 `modelId`，节点映射见参考文档）。
2. 创建工作流应用（注意类型必须为 `advanced`，禁止传入含 `schemaVersion` 的未编译 `workflow.json`）：
   ```bash
   fastgpt agent create --name "<工作流名>" --type advanced --intro "<说明>" --avatar "<workflowAvatar>" --parent-id "<agentFolderId>" --file ./store-workflow.json --profile china --format json
   ```
3. **强制执行 `workflow-build` 复核与纠偏闭环**：
   ```bash
   fastgpt agent pull <wfAgentId> --dir <ws> --profile china --format json
   fastgpt workflow-build template load --dir <ws> --profile china --format json
   fastgpt workflow-build inspect --dir <ws> --format json
   fastgpt workflow-build validate --dir <ws> --format json
   fastgpt workflow diff --dir <ws> --profile china --format json
   ```
   - 若 `inspect` / `validate` 检出冗余 `catch` 连线或误启的 `catchError`：用 `workflow-build edge disconnect` + `workflow-build node update --node <id> --no-catch-error` 清理。
   - 若检出孤立节点、非法引用或模板缺失字段：用 `workflow-build` 命令（或 `changeset plan/apply`）修正直至 `valid: true` 且 `diagnostics: []`（`chatNode.modelId` 的 `WORKFLOW_BINDING_UNVERIFIED` 为本地非阻断警告，由远端运行校验）。
4. 同步发布并端到端测试：
   ```bash
   fastgpt agent save <wfAgentId> --dir <ws> --profile china --format json
   fastgpt agent publish <wfAgentId> --dir <ws> --version-name "v1.0.0 Coze迁移发布" --profile china --format json
   fastgpt workflow diff --dir <ws> --profile china --format json   # 确认 inSync: true 且 0 差异
   fastgpt agent test <wfAgentId> --dir <ws> --text "<测试输入>" --detail --profile china --format json
   ```
5. 核对 `executedNodeCount` 与各节点输出无报错后汇报完成。

### 阶段 7：迁移智能体（默认 `simple`，按需 `chatAgent`）并绑定依赖

1. 开始前汇报，并先判定目标应用类型：
   - **默认选用 `simple`（标准对话应用）**：适用于绝大多数 Coze Bot（纯对话、知识库问答、工具/工作流调用，**尤其包含全局变量 `chatConfig.variables` 的 Bot**）。
     - 按绑定能力组装对应图结构：纯对话用 `workflowStart → chatNode`；仅绑知识库用 `workflowStart → datasetSearchNode → chatNode`；挂载 MCP / HTTP / 工作流工具用 `workflowStart → toolCall` 并连接对应工具及知识库子节点；完整保留 `chatConfig`（`variables`、`welcomeText`、`questionGuide` 等）。
     - 创建命令：
       ```bash
       fastgpt agent create --name "<智能体名>" --type simple --intro "<说明>" --avatar "<agentAvatar>" --parent-id "<agentFolderId>" --file ./simple-agent-create.json --profile china --format json
       ```
   - **仅在必要时选用 `chatAgent`（对话 Agent V2）**：仅当源 Bot 明确需要挂载 **Agent Skill（`skills`）**、**虚拟机执行沙箱（`useAgentSandbox`）** 或 Agent V2 自主规划循环时采用（注意：**Agent V2 目前不支持全局变量**；若源 Bot 同时包含全局变量与 Skill/沙箱，先向用户说明限制并确认方案）。
     - 组装 `workflowStart` + `agent` 节点及 `chatConfig`（`welcomeText`、`questionGuide`）：
       - `agent_datasetParams.datasets`：填入阶段 3 迁移的真实 `datasetId` 列表。
       - `agent_selectedTools`：**必须使用持久化态结构**（`CanonicalSelectedToolsValueSchema`：每项含 `id`、`name`、`avatar`、`version`、`source`、`toolConfig`、`inputs: [{ key, mode }]`、`config: {}`），确保绑定阶段 4 的工具与阶段 6 的最新工作流版本。
       - `skills`：填入阶段 5 有效存在的 `skillId`（若目标 Skill 已删除务必移除悬空引用，避免触发 `unAuthSkill`）。
     - 创建命令：
       ```bash
       fastgpt agent create --name "<智能体名>" --type chatAgent --intro "<说明>" --avatar "<agentAvatar>" --parent-id "<agentFolderId>" --file ./agent-create.json --profile china --format json
       ```
2. 执行 `agent pull` → `workflow-build validate`、`agent publish`、`agent test --detail`（`chatAgent` 如遇展开态校验限制则用 `--local --detail`）、`agent run` 以及 `agent logs list <botAgentId>` 验证会话落库，结束后汇报。

### 阶段 8：最终核验与交付

1. 核验四棵目录头像与所有资源归属目录正确。
2. 清理本地临时工作区目录，向用户输出精简迁移汇总：
   - 源 Coze ID → 目标 FastGPT ID 映射清单（目录、知识库、工具、Skill、工作流、智能体）
   - `workflow-build` 纠偏记录与端到端冒烟验证结论
   - 需人工补齐的外部凭证/商店插件清单

## 参考文档

配套映射表与排障手册位于同目录 [references/mapping-and-pitfalls.md](./references/mapping-and-pitfalls.md)（通过文档站拉取时位于同域名 `/skills/coze-to-fastgpt/references/mapping-and-pitfalls.md`），包含：
- Coze 与 FastGPT 资源/节点映射表
- CLI 创建返回值字段与常见选项对照表
- 实战高频踩坑与排查修复手册
