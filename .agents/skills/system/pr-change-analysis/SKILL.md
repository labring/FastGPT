---
name: pr-change-analysis
description: 手动触发的 FastGPT PR 或本地分支变更梳理技能。仅当用户显式调用 $pr-change-analysis 时使用；用于 reviewer 分析一个 GitHub PR 或当前本地分支相对 upstream/main 的需求变更、影响范围、代码质量与代码风格，不用于自动审查触发。
---

# PR / 分支变更梳理

面向代码 reviewer，先从真实 diff 还原需求与实现边界，再判断是否有超出需求的改动、过度复杂的整理、测试与模块化风险、以及与相近代码不一致的风格。

## 基本原则

- 默认输出中文。
- 以 checked-out 代码和 diff 为准，不只复述 PR 标题或描述。
- 优先回答“这次到底改了什么、为什么有用、影响到哪里、哪里不像同一个需求应该带上的改动”。
- 不默认提交 review、批准、请求修改或推送代码；用户明确要求后才执行 GitHub 写操作。
- 不修改工作区代码；如为了 review 需要切分实验或临时命令，只做只读检查。
- 保留用户已有改动。切换 PR 前必须检查 `git status --short`，遇到未提交改动时先说明风险并让用户决定，不要自行 stash、reset 或 checkout 覆盖。

## 入口判断

1. 如果用户给了 PR URL 或编号：
   - 用 `gh pr view <pr>` 获取 `number,title,body,author,headRefName,baseRefName,files,additions,deletions,commits`。
   - 按用户要求用 `gh pr checkout <pr>` 切到该 PR 分支。
   - `git fetch upstream main`，默认用 `upstream/main...HEAD` 做审查基准。
   - 如果 PR 的 `baseRefName` 不是 `main`，在报告里明确说明，并根据上下文决定是否同时补充 `upstream/<baseRefName>...HEAD` 的对比。
2. 如果用户没有给 PR，只说当前分支：
   - 确认当前分支名：`git branch --show-current`。
   - `git fetch upstream main`。
   - 使用 `git diff upstream/main...HEAD` 和相关统计作为审查基准。
3. 如果当前分支就是 `main` 或 diff 为空：
   - 明确说明没有可分析的分支差异，必要时检查是否需要比较其他 base。

## 信息收集

优先用这些命令建立全局视角：

```bash
git status --short
git branch --show-current
git fetch upstream main
git diff --stat upstream/main...HEAD
git diff --name-status upstream/main...HEAD
git log --oneline --decorate upstream/main..HEAD
```

再按文件类型深入：

```bash
git diff upstream/main...HEAD -- <path>
git diff --word-diff=color upstream/main...HEAD -- <path>
rg -n "关键函数|关键类型|关键字段" <相关目录>
```

检查需求来源时优先读取：

- PR 标题、正文、commit message。
- 新增或修改的 API schema、数据库 schema、工作流节点定义、配置默认值、权限判断。
- 与变更文件相邻的旧实现或同类功能实现。
- 测试文件与缺失测试的高风险路径。

## 审查维度

### 1. 需求变更说明

需要用 reviewer 能快速理解的方式说明：

- 本次变更解决什么问题，给用户、管理员、开发者或系统运行带来什么作用。
- 核心行为从什么变成什么。
- 对外接口、数据结构、配置、权限、计费、工作流运行时、前端交互是否变化。
- 关键实现路径：入口在哪里，主要处理逻辑在哪里，最终落到哪些模块。

不要只列文件名。每个关键文件都要说明它承担的行为变化。

### 2. 是否超出需求影响范围

重点找这些信号：

- 与需求无关的格式化、重命名、移动文件、依赖升级、批量整理。
- 修改共享类型、全局工具、公共组件、运行时核心逻辑，但需求只需要局部修复。
- 同一个分支混入多个独立需求或历史清理。
- 行为改动被伪装成重构，导致旧路径兼容性、默认值、继承语义或保存边界改变。
- 删除兼容逻辑、改变错误处理、日志、权限、缓存、并发策略，但 PR 描述未解释。

结论要区分：

- `合理扩散`：为了实现需求必须改的上下游。
- `可疑越界`：看起来和需求无关，需要作者拆分或解释。
- `高风险越界`：可能导致回归，应要求拆出或补测试。

### 3. 代码质量

检查是否：

- 存在重复逻辑、临时硬编码、过长函数、混合多层职责。
- 可以被独立模块化测试，但实际写在 UI、API route 或分支逻辑里导致难测。
- 缺少边界条件、异常路径、空值、旧数据兼容、并发或幂等处理。
- 没有把契约放在正确边界，例如 FastGPT API 入参应使用 `parseApiInput`，共享 schema 应放在 `packages/global/openapi` 或相应共享层。
- 测试只覆盖 happy path，或者新增核心逻辑没有对应单测。

评价质量时给出具体文件和函数，不要泛泛说“需要优化”。

### 4. 代码风格与相近功能一致性

对比相邻实现，而不是只按个人偏好判断：

- API route、service、schema、hook、组件、i18n、错误处理、日志、权限判断是否沿用附近模式。
- i18n 调用必须使用可被清理脚本静态识别的 key：不要写 ``t(`ns:key_${value}`)``、`t(prefix + value)`、`t(variableKey)` 或 `t(condition ? 'ns:a' : 'ns:b')` 这类动态/表达式 key；有限枚举应拆成显式分支或静态映射，并在最终调用处保留 `t('ns:literal_key')` 形式。改动后要检查对应语言包 key 是否齐全，避免清理脚本误删或运行时裸显 key。
- 前端交互、Chakra UI 组件组织、状态命名、弹窗/表单/列表布局是否与同模块一致。
- 后端命名、目录分层、模型访问、事务/队列/缓存写法是否与同类代码一致。
- 注释是否解释设计原因，尤其是导出函数、核心业务函数、复杂 helper；避免无意义逐行注释。
- 是否引入与项目习惯不一致的新抽象、新工具或新依赖。

## 深挖方法

对每个核心改动至少做一次“调用链闭环”：

1. 从入口找触发点：页面、API route、worker、workflow dispatcher、service 方法或配置加载。
2. 追到状态/数据落点：数据库、缓存、请求体、响应体、运行时变量、前端 store。
3. 找相近功能：同目录同类 route、同类组件、同类工作流节点、同类模型配置。
4. 对比旧行为：用 `git show upstream/main:<path>` 或 `git diff` 确认不是误读。
5. 判断测试：现有测试是否覆盖这条路径；没有测试时说明缺口与风险。

如果发现大规模重构，先识别“纯移动/纯重命名/格式化”和“真实行为改动”，避免把噪音当成需求。

## 输出格式

最终报告优先用以下结构，按风险高低组织，不要写冗长总结报告：

```markdown
## 需求变更

- ...

## 关键实现路径

- `path/to/file.ts`: ...

## 影响范围与越界判断

- 合理扩散: ...
- 可疑越界: ...
- 高风险越界: ...

## 代码质量

- [风险等级] `path/to/file.ts`: 问题、原因、建议。

## 代码风格一致性

- ...

## 测试与验证缺口

- ...

## 需要作者确认的问题

- ...
```

问题项必须尽量带文件路径和行号。没有发现问题时也要明确写“未发现明显越界/质量/风格问题”，并列出仍未覆盖的验证盲区。
