---
name: i18n
description: 项目 i18n 国际化词条规范检查，确保生成代码中的翻译词条格式正确、三语种同步、命名空间使用规范。
---

# i18n 词条规范

## 概述

本项目使用 `next-i18next` 进行国际化，词条文件位于 `packages/web/i18n/` 下，支持三个语种：

| 语种 | 目录 | 说明 |
|------|------|------|
| 简体中文 | `packages/web/i18n/zh-CN/` | 主语种 |
| 英文 | `packages/web/i18n/en/` | 与中文值保持一致即可 |
| 繁体中文 | `packages/web/i18n/zh-Hant/` | 需要单独翻译为繁体 |

命名空间定义在 `packages/web/i18n/constants.ts` 的 `I18N_NAMESPACES` 数组中。

## 规则

### 1. t() 调用必须使用 `namespace:key` 格式

代码中所有 `t()` 调用必须带命名空间前缀，格式为 `t('namespace:key')`。

### 2. key 命名规范

- 使用英文单词，采用 `PascalCase` 或 `snake_case` 风格（与所在文件已有风格保持一致）
- 支持点号分隔的层级 key，如 `core.app.Name`
- key 应语义化，能反映词条含义
- 禁止直接使用中文作为 key

### 3. 三语种同步

新增词条时，必须同时在三个语种文件中添加对应 key：
- `zh-CN/{namespace}.json` — 简体中文值
- `en/{namespace}.json` — 英文值（与中文值保持一致即可）
- `zh-Hant/{namespace}.json` — 繁体中文值（需正确转换）

### 4. 命名空间选择

根据词条所属业务模块选择对应的命名空间文件。常用命名空间：
- `common` — 通用词条（操作、状态等）
- `app` — 应用相关
- `dataset` — 知识库相关
- `workflow` — 工作流相关
- `chat` — 聊天相关
- 其他参见 `packages/web/i18n/constants.ts`

### 5. 变量插值

使用 `{{variable}}` 语法进行变量插值：
```
"tool_count": "工具列表: {{total}}"
```
调用时传入参数：`t('app:tool_count', { total: 5 })`

## 正确用例

### 示例 1：新增简单词条

需求：页面中需要显示"学习"文案。

代码中使用：
```tsx
t('app:learn')
```

三语种词条文件同步新增：

`packages/web/i18n/zh-CN/app.json`:
```json
"learn": "学习"
```

`packages/web/i18n/en/app.json`:
```json
"learn": "学习"
```

`packages/web/i18n/zh-Hant/app.json`:
```json
"learn": "學習"
```

### 示例 2：新增带变量的词条

需求：显示"已选择 N 个文件"。

代码中使用：
```tsx
t('file:selected_file_count', { count: selectedFiles.length })
```

`packages/web/i18n/zh-CN/file.json`:
```json
"selected_file_count": "已选择 {{count}} 个文件"
```

`packages/web/i18n/en/file.json`:
```json
"selected_file_count": "已选择 {{count}} 个文件"
```

`packages/web/i18n/zh-Hant/file.json`:
```json
"selected_file_count": "已選擇 {{count}} 個檔案"
```

### 示例 3：新增层级 key

需求：应用设置中的"基础配置"。

代码中使用：
```tsx
t('app:setting.basic_config')
```

`packages/web/i18n/zh-CN/app.json`:
```json
"setting.basic_config": "基础配置"
```

`packages/web/i18n/en/app.json`:
```json
"setting.basic_config": "基础配置"
```

`packages/web/i18n/zh-Hant/app.json`:
```json
"setting.basic_config": "基礎配置"
```

## 错误用例

### 错误 1：直接使用中文字符串，未走 i18n

```tsx
// ❌ 错误：硬编码中文
<Button>学习</Button>

// ✅ 正确：使用 t() 函数
<Button>{t('app:learn')}</Button>
```

### 错误 2：t() 调用缺少命名空间

```tsx
// ❌ 错误：缺少命名空间前缀
t('learn')

// ✅ 正确：带命名空间
t('app:learn')
```

### 错误 3：使用中文作为 key

```tsx
// ❌ 错误：中文 key
t('app:学习')

// ✅ 正确：英文 key
t('app:learn')
```

### 错误 4：只添加了部分语种

```
// ❌ 错误：只在 zh-CN 中添加了词条，en 和 zh-Hant 缺失

// ✅ 正确：三个语种文件必须同步添加
```

### 错误 5：繁体中文直接复制简体

```json
// ❌ 错误：zh-Hant 中使用简体
"learn": "学习"

// ✅ 正确：zh-Hant 使用繁体
"learn": "學習"
```

### 错误 6：英文值自行翻译为英语

```json
// ❌ 错误：en 中翻译为英语（本项目英文值与中文保持一致）
"learn": "Learn"

// ✅ 正确：en 中与中文值一致
"learn": "学习"
```

## 检查清单

生成或修改含 i18n 词条的代码时，按以下清单逐项检查：

- [ ] `t()` 调用是否使用了 `namespace:key` 格式
- [ ] key 是否为英文，且命名语义化
- [ ] key 命名风格是否与所在 JSON 文件已有风格一致
- [ ] 是否在 `zh-CN`、`en`、`zh-Hant` 三个语种文件中同步添加
- [ ] `zh-CN` 和 `en` 的值是否一致
- [ ] `zh-Hant` 的值是否为正确的繁体中文
- [ ] 命名空间是否选择了正确的业务模块
- [ ] 变量插值是否使用 `{{variable}}` 语法
- [ ] 新增词条是否与已有词条重复（优先复用已有词条）
