# 模型测试标识开关设计

## 需求描述

在 /account/model 页面的模型参数编辑模态框中，将以下5个功能开关合并为一个"测试标识"开关：
1. 用于知识库文件处理 (datasetProcess)
2. 用于问题分类 (usedInClassify)
3. 用于文本提取 (usedInExtractFields)
4. 用于工具调用节点 (usedInToolCall)
5. 用于应用评测 (useInEvaluation)

## 逻辑规则

- **测试标识开启** → 上述5项功能全部关闭
- **测试标识关闭** → 上述5项功能全部开启
- **默认状态**: 关闭（即功能全部开启）

## 实现方案

### 1. 数据模型层

在 `packages/global/core/ai/model.schema.ts` 中：
- 添加新的 `testMode` 字段到 `LLMModelItemSchema`
- 保留原有的5个字段，用于底层逻辑判断
- 新字段为可选，默认值为 `false`

### 2. UI 层

在 `projects/app/src/pageComponents/account/model/AddModelBox.tsx` 中：
- 隐藏原有的5个独立开关
- 添加新的"测试标识"开关
- 使用 `useWatch` 监听 `testMode` 变化
- 当 `testMode` 变化时，自动更新其他5个字段的值

### 3. 国际化

在以下文件中添加翻译：
- `packages/web/i18n/zh-CN/account.json`
- `packages/web/i18n/zh-CN/account_model.json`
- `packages/web/i18n/en/account.json`
- `packages/web/i18n/zh-Hant/account.json`

## 数据流

```
UI 层:
testMode = true  →  datasetProcess = false
                   usedInClassify = false
                   usedInExtractFields = false
                   usedInToolCall = false
                   useInEvaluation = false

testMode = false →  datasetProcess = true
                   usedInClassify = true
                   usedInExtractFields = true
                   usedInToolCall = true
                   useInEvaluation = true
```

## 兼容性

- 旧数据中没有 `testMode` 字段，默认为 `false`
- 保存时同时保存 `testMode` 和其他5个字段的值
