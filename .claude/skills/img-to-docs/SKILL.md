---
name: img-to-docs
description: Generates structured requirement development guides from UI screenshots or design files. TRIGGER when user asks to「生成开发文档」「写需求文档」「拆解开发任务」「输出技术方案」「分析功能需求」「写设计文档」, uploads screenshots for UI analysis, or provides a MasterGo design link. DO NOT TRIGGER when user is only discussing code implementation details, fixing bugs, doing code review, or asking technical questions without document output intent.
---

# UI 需求分析 — 结构化需求开发指南生成

## 目录

- [When to Use This Skill](#when-to-use-this-skill)
- [How It Works](#how-it-works)
- [AI-TODO 约定](#ai-todo-约定)
- [步骤 0：获取设计稿 DSL](#步骤-0获取设计稿-dsl可选)
- [分析维度一：原子组件识别](#分析维度一原子组件识别)
- [分析维度二：布局结构分析](#分析维度二布局结构分析)
- [分析维度三：交互行为清单](#分析维度三交互行为清单)
- [分析维度四：边界条件与异常状态](#分析维度四边界条件与异常状态)
- [分析维度五：需求开发任务拆解](#分析维度五需求开发任务拆解)
- [分析维度六：验收检查清单](#分析维度六验收检查清单)
- [分析维度七：执行文档](#分析维度七执行文档)
- [输出格式要求](#输出格式要求)

---

## When to Use This Skill

- 用户要求「生成开发文档」「写需求文档」「写设计文档」「输出技术方案」
- 用户要求「拆解开发任务」「需求拆解」「任务拆分」「分析功能需求」「输出开发指南」
- 用户上传截图并要求「分析 UI」「生成需求」「写文档」
- 用户提供 MasterGo 设计链接要求生成需求文档

**DO NOT TRIGGER when**：用户仅讨论代码实现细节、修复 bug、代码审查、技术问答（无明确文档输出意图）。

---

## How It Works

1. **（可选）获取设计稿 DSL** — 若用户提供 MasterGo 链接，调用 `mcp_getDsl` 获取精确布局数值
2. **原子组件识别** — 调用 `/component-guide` skill，将 UI 元素映射到项目已有组件
3. **布局结构分析** — 从宏观到微观描述页面布局、间距、响应式规律
4. **交互行为清单** — 逐一列出"做了 XX → 出现 XX"的可观察行为，标记 AI-TODO
5. **边界条件** — 识别禁用态、异常态、空态等边界场景
6. **任务拆解** — 区分前端/后端，输出带实现要点的可独立开发子任务
7. **验收脚本** — 输出 `agent-browser` 可执行命令，覆盖每条交互行为的验收点
8. **执行文档** — 验收通过后汇总变更文件清单、验收结果、遗留问题

---

## Examples

### Example 1：截图分析

**User Request**: 上传了一张「新增知识库弹窗」截图，要求「分析这个 UI，生成开发文档」

**Action**:
1. 识别弹窗中的原子组件（Modal、Input、Button）
2. 映射到项目组件（`MyModal`、`MyInput`、Chakra `Button`）
3. 分析布局（Column 布局，gap=4，底部操作区 justify=flex-end）
4. 输出交互行为清单（IB-01 点击确认 → 弹窗关闭 + Toast 成功）
5. 拆解前端任务 Task-FE-01 和后端任务 Task-BE-01
6. 输出 AC-001 agent-browser 验收脚本

**Output 片段**:
```markdown
### 一、原子组件识别
| 通用组件名 | 项目映射组件 | 导入路径 |
|-----------|------------|---------|
| Modal | `MyModal` | `@fastgpt/web/components/common/MyModal` |
| Input | `MyInput` | `@fastgpt/web/components/common/MyInput` |
```

### Example 2：MasterGo 设计稿链接

**User Request**: 提供 MasterGo 链接 `https://seerdesignmg.sangfor.com/...`，要求「按设计稿生成需求开发文档」

**Action**:
1. 调用 `mcp_getDsl` 获取组件层级树和精确间距数值
2. 优先使用 DSL 数值（如 padding=16px → Chakra `p=4`）而非截图目测
3. 后续分析流程与 Example 1 相同，但数值更精确

**Output**: 同 Example 1，但布局数值来自 DSL，精确度更高。

### Example 3：纯文字需求

**User Request**: 「我需要在知识库列表页新增一个批量删除功能，请拆解开发任务」

**Action**:
1. 跳过步骤 0（无设计稿）和一、二（无 UI 截图）
2. 直接输出三（交互行为清单）、四（边界条件）、五（任务拆解）
3. 对 UI 细节打 AI-TODO 标记（截图未提供，不猜测）

---

## AI-TODO 约定

**凡是无法从截图、DSL 或用户描述中确定的业务逻辑，必须用 `AI-TODO` 标记，而不是猜测或留空。**

### 格式规范

```
// AI-TODO[T-01]: <不确定的内容> | 建议确认方式: <如何澄清>
```

- `<编号>` 格式为 `T-01`、`T-02`……，全文唯一递增
- 不确定内容须具体（行为未知 / 文案未知 / 接口字段未知 / 权限逻辑未知）

### 必须打 AI-TODO 的场景

| 场景 | 示例 |
|------|------|
| 截图未展示的失败/空/加载态 | 提交失败时的错误提示文案 |
| 操作权限条件不明确 | 哪些角色可以编辑/删除 |
| 数据排序/分页规则不明 | 新增后排在列表头部还是尾部 |
| 接口字段名称/类型不确定 | 后端返回字段含义未知 |
| 业务规则存在多种可能 | 删除时是软删除还是硬删除 |

### 文档末尾汇总

每份文档末尾必须输出 **AI-TODO 汇总表**：

```markdown
## AI-TODO 汇总（待人工确认）

| 编号 | 所在章节 | 不确定内容 | 建议确认方式 |
|------|---------|-----------|------------|
| T-01 | 三、交互行为 | 提交失败时的 Toast 文案 | 询问产品/设计 |
| T-02 | 五、后端任务 | /api/xxx 接口的 Response 字段结构 | 查阅后端接口文档 |
```

> 若所有内容均已明确，输出「无 AI-TODO 待处理」。

---

## 步骤 0：获取设计稿 DSL（可选）

**判断条件**：用户消息中是否包含 MasterGo 设计稿链接（`https://seerdesignmg.sangfor.com/...`）。

- ✅ **有链接** → 调用 `mcp_getDsl`，提取组件层级树、布局数值、文本内容
- ⏩ **无链接** → 跳过，仅依赖截图

**DSL 数据优先级**：DSL 数值 > 截图目测值（间距、字号、颜色 token 以 DSL 为准）。

---

## 分析维度一：原子组件识别

**第一步**：调用 `/component-guide` skill 获取项目组件快照。

**第二步**：填写组件识别表格：

| 通用组件名 | 项目映射组件 | 导入路径 | 位置描述 | 视觉状态 | 文案/占位符 |
|-----------|------------|---------|---------|---------|------------|
| Modal | `MyModal` | `@fastgpt/web/components/common/MyModal` | 页面中央 | 打开态 | 标题"新增分块" |
| Button | Chakra `Button` | `@chakra-ui/react` | 头部右上角 | 正常态 | 新增 |

**组件优先级**（从高到低，严格按此顺序）：

1. **项目公共组件**（`component-guide` 🔴必须优先）：`MyModal`、`MyTooltip`、`MyMenu`、`MySelect`、`MyPopover`、`EmptyTip`、`MyBox` 等 → 禁止重复实现
2. **项目业务组件**（`component-guide` 🟡业务组件）：`PromptEditor`、`CodeEditor` 等
3. **Chakra UI 原生组件**：`Button`、`IconButton`、`Badge` 等
4. **HTML 原生元素**（兜底）：`div`、`span` 等

---

## 分析维度二：布局结构分析

#### 2.1 整体布局

| 维度 | 描述 |
|------|------|
| 布局方向 | 横向（Row）/ 纵向（Column）/ 网格（Grid） |
| 主要区域划分 | 头部 / 左侧边栏 / 内容区 / 右侧面板 / 底部工具栏 |
| 内容区滚动方向 | 纵向滚动 / 横向滚动 / 无滚动 |
| 固定/粘性元素 | 哪些区域固定在视口（sticky/fixed） |

#### 2.2 间距与对齐规律

- **间距规律**：主要间距值（如 `gap: 4`、`p: 3` 等 Chakra token）
  > 若已获取 DSL，直接从 `padding`/`gap` 字段读取精确数值并转换为 Chakra token
- **对齐方式**：`justify`（主轴对齐）/ `align`（交叉轴对齐）
- **层叠关系**：弹窗、Tooltip、下拉菜单的层级顺序

#### 2.3 响应式断点（如有）

列出不同屏幕宽度下布局的变化规律（侧边栏折叠、列数变化等）。

---

## 分析维度三：交互行为清单

> 格式：每条用 "**做了 XX → 出现 XX**" 描述，验收点（AC-xxx）直接基于此生成。
> AI-TODO 规则：若无法判断某交互响应，在「页面响应」列填写 `// AI-TODO[T-xx]`。

| 编号 | 触发操作（做了 XX） | 页面响应（出现 XX） | 对应验收点 |
|------|------------------|------------------|-----------|
| IB-01 | 点击"新增"按钮 | 弹出新增弹窗，标题为"新增分块" | AC-001 |
| IB-02 | 弹窗内输入内容后点击"确认" | 弹窗关闭，列表顶部新增一条记录 | AC-002 |

重点关注：状态变化（按钮禁用/启用）、数据流向（新增排列位置）、编号/序号规则。

---

## 分析维度四：边界条件与异常状态

- 哪些操作在特定条件下被禁用？原因是什么？
- 禁用状态下的 Tooltip 提示文案？
- 操作成功/失败时的反馈形式（Toast / 错误提示等）

> AI-TODO 规则：截图中未展示的异常态（网络错误、无权限、数据为空、超出限制等）均须打标记，不得猜测业务规则。

---

## 分析维度五：需求开发任务拆解

每个任务包含：任务编号（标注 `[前端]`/`[后端]`）、涉及文件、前置依赖、实现要点。

#### 前端任务格式

```
### Task-FE-01：[前端] 新增分块按钮与弹窗
所属端：前端
涉及文件：
  - projects/app/src/pageComponents/xxx/index.tsx
实现要点：
  1. 在头部区域新增"新增分块"Button（variant="primary"）
  2. 点击后打开弹窗，复用 MyModal
  3. 提交成功后调用 onSuccess，Toast 显示成功文案
  // AI-TODO[T-xx]: 提交失败时的错误处理方式 | 建议确认方式: 询问产品
代码规范：
  - props 用 type 而非 interface
  - 样式使用 Chakra UI sx prop
```

#### 后端任务格式

```
### Task-BE-01：[后端] 新增分块接口
所属端：后端
涉及文件：
  - projects/app/src/pages/api/core/dataset/data/insert.ts
接口设计：
  - Method: POST / Path: /api/core/dataset/data/insert
  - Request: { datasetId, collectionId, q, a? }
  - Response: { chunkIndex: number, rebuilding: boolean }
  // AI-TODO[T-xx]: Response 是否返回新记录的 _id | 查阅后端接口文档
实现要点：
  1. 校验写权限
  2. 写入 MongoDB，触发向量索引重建
```

---

## 分析维度六：验收检查清单

> 输出可由 `agent-browser` 执行的命令序列。详细命令参数见 [references/commands.md](references/commands.md)。

#### 快照驱动协议

每次 `agent-browser snapshot -i` 后必须：读取元素列表 → 判断页面状态 → 选择分支继续执行。最多重试 2 次，仍失败则输出诊断信息并标记 ❌。

**参数组合推荐**（优先顺序）：
1. `agent-browser snapshot -i -c` — 通用交互场景（90% 场景，Token 最小化）
2. `agent-browser snapshot -i -s "#selector"` — 局部操作场景
3. `agent-browser snapshot -i -c -d 4` — 长页面/复杂页面
4. `agent-browser snapshot` — 最后考虑

#### 通用登录流程

```bash
agent-browser open <目标URL> --headed
agent-browser wait --load networkidle
agent-browser snapshot -i
# [条件 A] 含登录表单 → 执行登录子流程
agent-browser fill <email-selector> "<账号>"
agent-browser fill <password-selector> "<密码>"
agent-browser find role button click --name "登录"
agent-browser wait --load networkidle
# [条件 B] 已登录 → 直接跳过
agent-browser open <目标功能URL>
agent-browser wait --load networkidle
```

#### 验收点格式（与 IB-xx 一一对应）

```bash
# AC-001：<从 IB-xx 提取的验收点名称>
# 前置条件：<页面状态描述>

agent-browser snapshot -i -c
# ▼ 找到文案为"<真实按钮文案>"的 Button，记为 @btn-<语义名称>
# [条件] 未找到 → 输出诊断信息，标记 ❌

agent-browser click @btn-<语义名称>
agent-browser wait --load networkidle
agent-browser snapshot -i -c
# ▼ [✅] 期望元素出现 / [❌] 重试 2 次后仍未出现
```

**期望结果**（每条可观察）：
- [ ] `<UI 变化描述，如：弹窗标题为"新增分块">`

#### 诊断输出规范（失败时）

```
验收失败：<AC-编号> <验收点名称>
失败原因：<期望 XX 出现，但未找到>
当前页面快照摘要：<主要元素类型和文案>
重试次数：<N>/2
建议排查：<可能原因>
```

---

## 分析维度七：执行文档

> 验收通过后，保存至 `.claude/design/<功能名称>-execution.md`。

#### 7.1 变更文件清单

| 文件路径 | 变更类型 | 变更说明 |
|---------|---------|---------|
| `projects/app/src/pageComponents/xxx/index.tsx` | 修改 | 新增按钮及弹窗逻辑 |

#### 7.2 验收结果汇总

| 验收点 | 状态 | 快照对比结论 | 备注 |
|--------|------|------------|------|
| AC-001：点击新增打开弹窗 | ✅ 通过 | 操作后出现弹窗 | — |
| AC-002：提交后列表更新 | ❌ 未通过 | 列表无变化 | 待排查 onSuccess |

#### 7.3 遗留问题与后续跟进

- 验收未通过的问题及原因分析
- 未覆盖的边界场景
- 后端依赖项跟进状态

---

## 输出格式要求

- Markdown 输出，结构清晰，组件识别用表格，交互逻辑用有序列表
- 验收点输出为可执行的 `agent-browser` shell 命令块
- 执行文档在验收完成后单独输出，保存至 `.claude/design/` 目录
- 最后附【开发注意事项】：潜在坑点、状态管理建议、接口时序等
- **文档末尾必须输出「AI-TODO 汇总表」**；若无不确定项，写「无 AI-TODO 待处理」
