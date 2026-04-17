---
name: auto-dev
description: 全自动需求开发流水线，将「需求分析 → 文档生成 → 代码实现 → i18n 更新」串联为一条完整链路。TRIGGER when: 用户提供截图或设计稿并要求「自动开发」「一键实现」「全流程实现」「从设计稿生成代码并实现」，或明确说「全流程自动化」「auto-dev」。DO NOT TRIGGER when: 用户仅要生成需求文档（用 img-to-docs）、仅要修复 bug、仅做代码审查。
---

# Auto-Dev 全自动需求开发流水线

## 目录

- [When to Use This Skill](#when-to-use-this-skill)
- [How It Works](#how-it-works)
- [Phase 1：生成需求开发文档](#phase-1生成需求开发文档)
- [Phase 2：自动执行开发任务](#phase-2自动执行开发任务)
- [Phase 3：汇总与执行文档](#phase-3汇总与执行文档)
- [全局代码规范](#全局代码规范)
- [Examples](#examples)

---

## When to Use This Skill

- 用户上传截图或提供设计稿 URL，并要求「自动开发」「一键实现」
- 用户说「帮我从设计稿生成代码并实现」「全流程自动化」
- 用户已有设计文档（`.claude/design/xxx.md`），要求直接执行所有开发任务
- 用户明确说 `/auto-dev` 或「auto-dev」
- 用户希望跳过手动拆任务，直接端到端完成一个功能

**不适用场景**（请改用其他 skill）:
- 仅需生成需求文档 → 使用 `/img-to-docs`
- 仅修复某个 bug → 直接修复
- 仅做代码审查 → 使用 `/pr-review`

---

## How It Works

```
输入 (截图 / 设计稿URL / 文字描述 / 已有设计文档路径)
    ↓
Phase 1: 执行 img-to-docs → 生成结构化需求开发文档
    ↓  （若已有文档则跳过）
Phase 2: 解析文档 → 集中确认 AI-TODO → 依次执行所有 Task
    ↓
Phase 3: 汇总变更 → 输出执行文档 → 可选触发验收
```

---

## Phase 1：生成需求开发文档

**执行 `/img-to-docs` skill 的完整协议**，将结构化需求开发指南输出至：

```
.claude/design/<功能名>-design.md
```

> 若用户已提供设计文档路径（如 `.claude/design/xxx.md`），跳过 Phase 1，直接进入 Phase 2。

Phase 1 完成后，将文档路径记录为 `$DESIGN_DOC`，供 Phase 2 使用。

---

## Phase 2：自动执行开发任务

### 2.0 前置读取

读取 `$DESIGN_DOC`，提取：

- **Task 列表**：所有 `### Task-FE-xx` 和 `### Task-BE-xx` 节
- **AI-TODO 汇总表**：所有 `T-xx` 待确认项
- **涉及文件清单**：每个 Task 的"涉及文件"字段

### 2.1 AI-TODO 前置确认

在执行任何代码前，**先集中处理 AI-TODO 汇总表中所有状态未确认的项**：

```
逐条展示 AI-TODO：
  - 编号、不确定内容、建议确认方式
  - 询问用户确认或跳过
  - 将确认结果记录，在后续 Task 执行时使用
```

> 若用户选择「全部跳过，使用文档默认方案」，直接进入 2.2。

### 2.2 Task 执行协议

按文档中 Task 编号顺序依次执行，每个 Task 包含以下步骤：

#### Step A：读取当前文件

```
对 Task 中"涉及文件"列出的每个文件：
  1. 使用 Read 工具读取完整内容
  2. 理解现有代码结构和模式
  3. 确认修改点与现有代码无冲突
```

#### Step B：调用对应子 Skill

根据 Task 类型，修改前调用对应子 Skill：

| Task 类型 | 子 Skill | 时机 |
|-----------|----------|------|
| 涉及前端组件 | `/component-guide` | 执行前，确认组件映射 |
| 涉及新增 i18n key | `/i18n` | 执行前，确认命名规范 |
| 涉及新增 API | `/api-development` | 执行前，确认接口规范 |

#### Step C：执行代码修改

根据 Task 中的"实现要点"，使用 Edit 或 Write 工具完成代码修改：

```
- 优先使用 Edit（精确替换），避免全文件重写
- 保持文件现有代码风格和 import 顺序
- TypeScript 类型用 type，不用 interface（项目规范）
- 修改完成后，通过 Read 验证改动符合预期
```

#### Step D：i18n 同步

若 Task 涉及新增 i18n key，同步更新三个语种文件：

```
packages/web/i18n/zh-CN/<namespace>.json   ← 中文值
packages/web/i18n/en/<namespace>.json      ← 英文值
packages/web/i18n/zh-Hant/<namespace>.json ← 繁体中文值
```

> 命名空间以 `packages/web/i18n/constants.ts` 中的 `I18N_NAMESPACES` 为准。

#### Step E：记录变更

每个 Task 执行完后，追加到内部变更日志：

```
- Task-FE-xx | 文件路径 | 变更摘要（一句话）
```

### 2.3 Task 执行规则

**遇到以下情况时暂停，提示用户：**

1. AI-TODO 未在 2.1 中确认，且影响当前实现决策
2. 涉及文件不存在（路径可能有误）
3. 现有代码与 Task 描述的"当前状态"不符（文档可能已过期）
4. 修改范围超出文档描述（发现隐藏影响）

**遇到以下情况时自动处理并继续：**

1. 文件 import 需要新增 → 自动追加到 import 区域
2. i18n key 已存在且值相同 → 跳过，继续
3. Task 中有 `// AI-TODO` 但用户已在 2.1 选择跳过 → 使用文档默认方案

---

## Phase 3：汇总与执行文档

所有 Task 完成后，输出执行文档并保存至 `.claude/design/<功能名>-execution.md`：

### 3.1 变更文件清单

| 文件路径 | 变更类型 | Task 编号 | 变更说明 |
|---------|---------|----------|---------|
| `src/xxx.tsx` | 修改 | Task-FE-01 | 新增调试面板组件 |

### 3.2 AI-TODO 处理结果

| 编号 | 不确定内容 | 处理方式 | 最终决策 |
|------|-----------|---------|---------|
| T-01 | ... | 用户确认 / 默认方案 | ... |

### 3.3 遗留问题

列出未完成的 Task（若有）及原因。

### 3.4 验收入口（可选）

询问用户：**是否立即执行 agent-browser 验收脚本？**

- 选「是」→ 按以下「agent-browser 验收执行协议」逐步执行
- 选「否」→ 流程结束，提示用户手动验收路径

---

## 全局代码规范

执行所有 Task 时，始终遵守以下规范：

### TypeScript
- 类型声明用 `type`，不用 `interface`
- Props 类型定义放在组件文件顶部
- 避免 `any`，优先用 `unknown` + 类型守卫

### React 组件
- 函数式组件 + Hooks
- 样式使用 Chakra UI `sx` prop 或组件 props，避免内联 `style`
- 组件文件结构：`import → type → component → export default`

### 文件修改安全原则
- **修改前必须先 Read**，不凭记忆修改
- **不改动未涉及的代码**，即使发现可优化的地方
- **不添加文档中未要求的功能**（不过度实现）

### 组件使用优先级（执行前端 Task 时）

1. 项目公共组件（`component-guide` 中的 🔴 清单）
2. 项目业务组件（`component-guide` 中的 🟡 清单）
3. Chakra UI 原生组件
4. HTML 原生元素（兜底）

---

## Examples

### Example 1：从截图一键实现

**User Request**:
```
/auto-dev [粘贴截图]
帮我实现文档解析节点的调试界面改版
```

**执行流程**:
1. Phase 1 → 生成 `.claude/design/readfiles-debug-ui-design.md`
2. 展示 AI-TODO 汇总，逐条确认（如：调试数据来源、错误展示方式）
3. Phase 2 → 依次执行 `Task-FE-01 ~ Task-FE-05`
4. Phase 3 → 输出 `.claude/design/readfiles-debug-ui-execution.md`

**Output（执行文档片段）**:
```
变更文件清单：
- src/components/core/workflow/Debug/Panel.tsx | 新增 | Task-FE-01 | 新增调试面板主体
- packages/web/i18n/zh-CN/workflow.json       | 修改 | Task-FE-02 | 新增 3 个调试相关 key
```

---

### Example 2：已有设计文档，跳过 Phase 1

**User Request**:
```
/auto-dev .claude/design/readfiles-debug-ui-design.md
```

**执行流程**:
1. 跳过 Phase 1，直接读取指定文档
2. 展示 AI-TODO 汇总，逐条确认
3. Phase 2 → 依次执行所有 Task
4. Phase 3 → 汇总并询问是否触发验收

---

### Example 3：AI-TODO 暂停场景

**触发条件**: Task-FE-03 依赖 T-02（数据接口字段），但用户在 2.1 跳过了 T-02

**Claude 行为**:
```
⚠️ 暂停：Task-FE-03 需要确认 T-02（接口返回字段 `debugData` 的结构）。
当前未确认，无法继续实现。

请选择：
1. 现在确认 T-02 → 继续执行 Task-FE-03
2. 使用文档默认方案（`{ logs: string[] }`）→ 继续执行
3. 跳过 Task-FE-03 → 进入下一个 Task
```
