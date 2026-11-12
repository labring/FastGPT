---
name: fastgpt-cli-setup
description: FastGPT CLI setup and initialization workflow for AI agents (Codex, Claude Code, Cursor, Windsurf). Installs @fastgpt/cli, guides login, runs doctor health checks, and lists capabilities.
---

# FastGPT CLI 智能体初始化引导 (Agent Skill)

本技能供 AI 编程助手（如 Codex、Claude Code、Cursor、Windsurf 等）在当前开发环境中全自动安装并初始化配置 FastGPT 官方命令行工具（`fastgpt`）。

## 交互原则
- 优先附加 `--format json` 参数以获取纯净的结构化输出便于机器解析，避免 TTY 控制字符污染。
- 引导登录时，如果用户未提供凭据或实例地址，主动向用户确认，绝不伪造凭据。
- 破坏性命令（如 `delete`）在自动化执行时必须显式传 `--yes`，写操作建议配合 `--dry-run` 预览。

---

## 执行步骤

### 1. 安装 CLI
首先检测本地运行环境，若 Node.js 版本低于 20.12.0，先提醒用户升级（`@clack/prompts` 依赖 Node 20.12.0+ 的 `node:util` `styleText`）；随后执行全局安装：

```bash
# 检查 Node 版本（需 >= 20.12.0）
node -v

# 全局安装 FastGPT CLI
npm install -g @fastgpt/cli || pnpm add -g @fastgpt/cli

# 验证安装与版本
fastgpt --version
```

### 2. 引导用户登录
通过 `whoami` 探测当前是否已有可用凭据：

```bash
fastgpt whoami --format json
```

- **若返回成功 (`ok: true`)**：记录当前已登录的用户标识、所属团队及 Profile 名称，直接进入第 3 步。
- **若尚未登录或凭据失效**：询问用户的 FastGPT 服务端地址（默认公有云为 `https://cloud.fastgpt.cn/api`，私有化部署请提供实例 API 地址）以及期望的认证方式：
  1. **API Key 登录（Agent / CI 自动化首选推荐）**：
     ```bash
     fastgpt login --api-key <FASTGPT_API_KEY>
     # 若为自建实例：fastgpt login --base-url https://your-domain.com/api --api-key <FASTGPT_API_KEY>
     ```
  2. **账号密码登录（非交互式通过标准输入传密码）**：
     ```bash
     echo "<PASSWORD>" | fastgpt login --username <USERNAME> --password-stdin
     ```
  3. **交互式终端登录（人类交互模式推荐）**：
     ```bash
     fastgpt login
     ```
  登录完成后，再次执行 `fastgpt whoami --format json` 验证登录结果。

### 3. 检查健康度 (Doctor)
执行内置体检诊断命令，确认本地运行时、凭据存储与服务端连通性完全正常：

```bash
fastgpt doctor --format json
```

核心检查项说明：
- `nodeRuntime`：Node.js 版本 `>= 20.12.0`。
- `configStorage`：配置文件与本地凭据存储安全（密钥环可用或 0600 文件受保护）。
- `serverReachability`：目标服务端可达且 TLS 握手正常。
- `authentication`：凭据有效性及有效期限。

若存在 Warning 或 Error，分析原因并指导用户解决（例如权限异常时提示 `chmod 600` 或证书问题时提供 `--ca-cert` 说明）。

### 4. 输出 CLI 能力列表
运行命令元数据探测命令，获取当前 CLI 的全部功能与参数规范：

```bash
fastgpt commands --format json
```

整理并向用户展示 CLI 的核心能力矩阵：
- **认证与会话 (`auth` / `login` / `logout` / `whoami`)**：支持 24 小时防抖的 7 天滑动会话续期、多 Profile 环境隔离、团队空间一键切换（`fastgpt auth switch-team --team-id <id>`）。
- **知识库管理 (`dataset`)**：知识库全生命周期 CRUD、根目录与层级目录移动、`--dry-run` 请求预览、破坏性删除二次确认、混合检索召回测试。
- **本地配置 (`config`)**：查看所有配置项（`fastgpt config list`）与修改参数。
- **环境诊断 (`doctor`)**：环境体检与连通性诊断。

---

## 最终汇报格式

完成初始化后，请以规范简洁的 Markdown 格式向用户输出汇报：

```markdown
### ✅ FastGPT CLI 初始化完成

- **CLI 版本**：v0.1.0-beta.1
- **当前身份**：<用户名>（团队：<团队名>）
- **服务端地址**：https://cloud.fastgpt.cn/api
- **健康诊断**：全部检查通过 (All checks passed)

#### 🚀 可用能力一览
| 命令域 | 核心能力 | 示例命令 |
| :--- | :--- | :--- |
| `whoami` | 查看身份与团队 | `fastgpt whoami` |
| `auth` | 切换工作空间团队 | `fastgpt auth switch-team --team-id <id>` |
| `dataset` | 检索知识库与召回测试 | `fastgpt dataset list` / `fastgpt dataset search <id> "query"` |
| `config` | 查看本地所有配置 | `fastgpt config list` |
| `doctor` | 运行状态体检 | `fastgpt doctor` |

> 提示：在编写自动化脚本或通过 Agent 调用时，添加 `--format json` 即可获取纯净的结构化输出。
```
