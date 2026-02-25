---
name: create-skill-file
description: Guides Claude in creating well-structured SKILL.md files following best practices. Provides clear guidelines for naming, structure, and content organization to make skills easy to discover and execute.
---

# Claude Agent Skill 编写规范

> 如何创建高质量的 SKILL.md 文件

## 目录

- [快速开始](#快速开始)
- [核心原则](#核心原则)
- [文件结构规范](#文件结构规范)
- [命名和描述规范](#命名和描述规范)
- [内容编写指南](#内容编写指南)
- [质量检查清单](#质量检查清单)

---

## 快速开始

### 3步创建 Skill

**第1步: 创建目录**

```bash
mkdir -p .claude/skill/your-skill-name
cd .claude/skill/your-skill-name
```

**第2步: 创建 SKILL.md**

```markdown
---
name: your-skill-name
description: Brief description with trigger keywords and scenarios
---

# Your Skill Title

## When to Use This Skill

- User asks to [specific scenario]
- User mentions "[keyword]"

## How It Works

1. Step 1: [Action]
2. Step 2: [Action]

## Examples

**Input**: User request
**Output**: Expected result
```

**第3步: 测试**
- 在对话中使用 description 中的关键词触发
- 观察 Claude 是否正确执行
- 根据效果调整

---

## 核心原则

### 1. 保持简洁

只添加 Claude **不知道**的新知识:
- ✅ 项目特定的工作流程
- ✅ 特殊的命名规范或格式要求
- ✅ 自定义工具和脚本的使用方法
- ❌ 通用编程知识
- ❌ 显而易见的步骤

**示例对比**:

```markdown
# ❌ 过度详细
1. 创建 Python 文件
2. 导入必要的库
3. 定义函数
4. 编写主程序逻辑

# ✅ 简洁有效
使用 `scripts/api_client.py` 调用内部 API。
请求头必须包含 `X-Internal-Token`(从环境变量 `INTERNAL_API_KEY` 获取)。
```

### 2. 设定合适的自由度

| 自由度 | 适用场景 | 编写方式 |
|--------|---------|---------|
| **高** | 需要创造性、多种解决方案 | 提供指导原则,不限定具体步骤 |
| **中** | 有推荐模式但允许变化 | 提供参数化示例和默认流程 |
| **低** | 容易出错、需严格执行 | 提供详细的分步指令或脚本 |

**判断标准**:
- 任务是否有明确的"正确答案"? → 低自由度
- 是否需要适应不同场景? → 高自由度
- 错误的代价有多大? → 代价高则用低自由度

### 3. 渐进式披露

将复杂内容分层组织:

```
SKILL.md (主文档, 200-500行)
├── reference.md (详细文档)
├── examples.md (完整示例)
└── scripts/ (可执行脚本)
```

**规则**:
- SKILL.md 超过 500行 → 拆分子文件
- 子文件超过 100行 → 添加目录
- 引用深度 ≤ 1层

---

## 文件结构规范

### YAML Frontmatter

```yaml
---
name: skill-name-here
description: Clear description of what this skill does and when to activate it
---
```

**字段规范**:

| 字段 | 要求 | 说明 |
|------|------|------|
| `name` | 小写字母、数字、短横线,≤64字符 | 必须与目录名一致 |
| `description` | 纯文本,≤1024字符 | 用于检索和激活 |

**命名禁忌**:
- ❌ XML 标签、保留字(`anthropic`, `claude`)
- ❌ 模糊词汇(`helper`, `utility`, `manager`)
- ❌ 空格或下划线(用短横线 `-`)

**Description 技巧**:

```yaml
# ❌ 过于泛化
description: Helps with code tasks

# ✅ 具体且包含关键词
description: Processes CSV files and generates Excel reports with charts. Use when user asks to convert data formats or create visual reports.

# ✅ 说明触发场景
description: Analyzes Python code for security vulnerabilities using bandit. Activates when user mentions "security audit" or "vulnerability scan".
```

### 目录组织

**基础结构**(简单 Skill):
```
skill-name/
└── SKILL.md
```

**标准结构**(推荐):
```
skill-name/
├── SKILL.md
├── templates/
│   └── template.md
└── scripts/
    └── script.py
```

---

## 命名和描述规范

### Skill 命名

**推荐格式**: 动名词形式 (verb-ing + noun)

```
✅ 好的命名:
- processing-csv-files
- generating-api-docs
- managing-database-migrations

❌ 不好的命名:
- csv (过于简短)
- data_processor (使用下划线)
- helper (过于模糊)
```

### Description 编写

**必须使用第三人称**:

```yaml
# ❌ 错误
description: I help you process PDFs

# ✅ 正确
description: Processes PDF documents and extracts structured data
```

**4C 原则**:
- **Clear** (清晰): 避免术语和模糊词汇
- **Concise** (简洁): 1-2句话说明核心功能
- **Contextual** (上下文): 说明适用场景
- **Complete** (完整): 功能 + 触发条件

---

## 内容编写指南

### "When to Use" 章节

明确说明触发场景:

```markdown
## When to Use This Skill

- User asks to analyze Python code for type errors
- User mentions "mypy" or "type checking"
- User is working in a Python project with type hints
- User needs to add type annotations
```

**模式**:
- 直接请求: "User asks to X"
- 关键词: "User mentions 'keyword'"
- 上下文: "User is working with X"
- 任务类型: "User needs to X"

### 工作流设计

**简单线性流程**:

```markdown
## How It Works

1. Scan the project for all `.py` files
2. Run `mypy --strict` on each file
3. Parse error output and categorize by severity
4. Generate summary report with fix suggestions
```

**条件分支流程**:

```markdown
## Workflow

1. **Check project type**
   - If Django → Use `django-stubs` config
   - If Flask → Use `flask-stubs` config
   - Otherwise → Use default mypy config

2. **Run type checking**
   - If errors found → Proceed to step 3
   - If no errors → Report success and exit
```

**Checklist 模式**(验证型任务):

```markdown
## Pre-deployment Checklist

Execute in order. Stop if any step fails.

- [ ] Run tests: `npm test` (must pass)
- [ ] Build: `npm run build` (no errors)
- [ ] Check deps: `npm audit` (no critical vulnerabilities)
```

### 示例和模板

**输入-输出示例**:

```markdown
## Examples

### Example 1: Basic Check

**User Request**: "Check my code for type errors"

**Action**:
1. Scan for `.py` files
2. Run `mypy` on all files

**Output**:
   
   Found 3 type errors in 2 files:
   src/main.py:15: error: Missing return type
   src/utils.py:42: error: Incompatible types
   
```

### 脚本集成

**何时使用脚本**:
- 简单命令 → 直接在 SKILL.md 中说明
- 复杂流程 → 提供独立脚本

**脚本编写规范**:

```python
#!/usr/bin/env python3
"""
Brief description of what this script does.

Usage:
    python script.py <arg> [--option value]
"""

import argparse

DEFAULT_VALUE = 80  # Use constants, not magic numbers

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", help="Directory to process")
    parser.add_argument("--threshold", type=int, default=DEFAULT_VALUE)

    args = parser.parse_args()

    # Validate inputs
    if not Path(args.directory).is_dir():
        print(f"Error: {args.directory} not found")
        return 1

    # Execute
    result = process(args.directory, args.threshold)

    # Report
    print(f"Processed {result['count']} files")
    return 0

if __name__ == "__main__":
    exit(main())
```

**关键规范**:
- ✅ Shebang 行和 docstring
- ✅ 类型注解和常量
- ✅ 参数验证和错误处理
- ✅ 清晰的返回值(0=成功, 1=失败)

### 最佳实践

**Do**:
- ✅ 提供可执行的命令和脚本
- ✅ 包含输入-输出示例
- ✅ 说明验证标准和成功条件
- ✅ 包含 Do/Don't 清单

**Don't**:
- ❌ 包含 Claude 已知的通用知识
- ❌ 使用抽象描述而非具体步骤
- ❌ 遗漏错误处理指导
- ❌ 示例使用伪代码而非真实代码

---

## 质量检查清单

### 核心质量

- [ ] `name` 符合命名规范(小写、短横线、≤64字符)
- [ ] `description` 包含触发关键词和场景(≤1024字符)
- [ ] 名称与目录名一致
- [ ] 只包含 Claude 不知道的信息
- [ ] 没有冗余或重复内容

### 功能完整性

- [ ] 有"When to Use"章节,列出 3-5 个触发场景
- [ ] 有清晰的执行流程或步骤
- [ ] 至少 2-3 个完整示例
- [ ] 包含输入和预期输出
- [ ] 错误处理有指导

### 结构规范

- [ ] 章节组织清晰
- [ ] 超过 200行有目录导航
- [ ] 引用层级 ≤ 1层
- [ ] 所有路径使用正斜杠 `/`
- [ ] 术语使用一致

### 脚本和模板

- [ ] 脚本包含使用说明和参数文档
- [ ] 脚本有错误处理
- [ ] 避免魔法数字,使用配置
- [ ] 模板格式清晰易用

### 最终检查

- [ ] 通读全文,确保流畅易读
- [ ] 使用实际场景测试触发
- [ ] 长度适中(200-500行,或已拆分)

---

## 常见问题

**Q: Skill 多长才合适?**
- 最小: 50-100行
- 理想: 200-500行
- 最大: 500行(超过则拆分)

**Q: 如何让 Skill 更容易激活?**
- 在 `description` 中使用用户会说的关键词
- 说明具体场景("when user asks to X")
- 提及相关工具名称

**Q: 多个 Skill 功能重叠怎么办?**
- 使用更具体的 `description` 区分
- 在"When to Use"中说明关系
- 考虑合并为一个 Skill

**Q: Skill 需要维护吗?**
- 每季度审查一次,更新过时信息
- 根据使用反馈迭代
- 工具或 API 变更时及时更新

---

## 快速参考

### Frontmatter 模板

```yaml
---
name: skill-name
description: Brief description with trigger keywords
---
```

### 基础结构模板

```markdown
# Skill Title

## When to Use This Skill
- Scenario 1
- Scenario 2

## How It Works
1. Step 1
2. Step 2

## Examples
### Example 1
...

## References
- [Link](url)
```

---

## 相关资源

- [Claude Agent Skills 官方文档](https://docs.claude.com/en/docs/agents-and-tools/agent-skills)
- [Best Practices Checklist](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices)
- [模板文件](templates/) - 开箱即用的模板 
  - [基础 skill 的模板](templates/basic-skill-template.md)
  - [工作流 skill 的模板](templates/workflow-skill-template.md)
- [示例库](examples/) - 完整的 Skill 示例
  - [优秀示例](examples/good-example.md)
  - [常见错误示例](examples/bad-example.md)

---
