---
name: doc-i18n
description: 将 FastGPT 文档从中文翻译为面向北美用户的英文。当用户提到翻译文档、i18n、国际化、translate docs、新增/修改了中文文档需要同步英文版时，使用此 skill。也适用于用户要求检查文档翻译缺失、批量翻译、或对比中英文文档差异的场景。
---

## 概述

FastGPT 文档采用双文件 i18n 方案，中文为源语言，英文为目标语言。你的任务是将中文文档翻译为自然流畅的北美英文，而非逐字直译。

## 文件结构

文档位于 `document/content/docs/` 目录下：

- 内容文件：`{name}.mdx`（中文） → `{name}.en.mdx`（英文）
- 导航文件：`meta.json`（中文） → `meta.en.json`（英文）

## 工作流程

### 1. 确定翻译范围

两种方式确定需要翻译的文件：

**自动检测**（用户未指定具体文件时）：
- 运行 `git diff --name-only` 和 `git diff --cached --name-only` 检测 `document/` 下变更的中文文件
- 筛选出 `.mdx`（排除 `.en.mdx`）和 `meta.json`（排除 `meta.en.json`）
- 检查对应的英文文件是否存在或是否需要更新

**手动指定**：用户直接给出文件路径或目录。

### 2. 翻译内容文件（.mdx → .en.mdx）

对每个中文 `.mdx` 文件，生成或更新对应的 `.en.mdx` 文件。

**保持不变的部分**：
- MDX import 语句（如 `import { Alert } from '@/components/docs/Alert'`）
- 图片路径（如 `![](/imgs/intro/image1.png)`）
- 链接 URL（保持原始 URL 不变）
- HTML/JSX 组件结构和属性（如 `<Alert icon="🤖" context="success">`）
- 表格的 markdown 结构
- 代码块内容（除非是中文注释）
- emoji 符号

**需要翻译的部分**：
- frontmatter 的 `title` 和 `description`
- 所有正文文本内容
- 组件内的文本内容（如 Alert 内的文字）
- 表格中的文字内容
- 代码块中的中文注释

### 3. 翻译导航文件（meta.json → meta.en.json）

对每个中文 `meta.json`，生成或更新对应的 `meta.en.json`。

**需要翻译的字段**：`title`、`description`、分隔符字符串（如 `"---入门---"` → `"---Getting Started---"`）

**保持不变的字段**：`pages` 数组中的文件名引用、`icon`、`root`、`order`

### 4. 翻译完成后

- 列出所有已翻译的文件
- 如果发现中文文件有对应英文文件缺失的情况，提醒用户

## 翻译原则

这些原则的核心目标是让北美开发者读起来感觉像是原生英文文档，而不是翻译过来的。

### 语言风格

- 面向北美开发者，使用自然的美式英语技术写作风格
- 不要逐字翻译，要传达原文的意思和意图
- 技术文档倾向简洁直接，避免冗余修饰
- 中文文档常用的排比、铺陈手法，翻译时应精简为英文读者习惯的表达

**示例**：
```
中文：可轻松导入各式各样的文档及数据，能自动对其开展知识结构化处理工作。
  ✗：You can easily import various documents and data, which will be automatically processed for knowledge structuring.
  ✓：Import documents and data with automatic knowledge structuring.
```

### 中国特有平台和服务的本地化

直接使用国际版名称，不保留中文原名：

| 中文 | 英文 |
|------|------|
| 飞书 | Lark |
| 企业微信 | WeCom |
| 钉钉 | DingTalk |
| 公众号 | WeChat Official Account |
| 文心一言 | ERNIE Bot |
| 中国大陆版 | China Mainland |
| 国际版 | International |

### 技术术语

保持业界通用的英文术语，不要生造翻译：

| 中文 | 英文 |
|------|------|
| 知识库 | Knowledge Base |
| 工作流 | Workflow |
| 大语言模型 | LLM / Large Language Model |
| 向量存储 | Vector Store |
| 可视化编排 | Visual Orchestration |
| 低代码 | Low-code |
| 节点 | Node |
| 插件 | Plugin |

### 语气

- 保持专业但友好的语气，和原文档的风格一致
- 不要过度正式，也不要过于随意
- 面向开发者和技术用户，假设读者有基本的技术背景
