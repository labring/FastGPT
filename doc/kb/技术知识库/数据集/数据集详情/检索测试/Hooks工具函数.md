---
capability_label: 检索测试
doc_type: "16"
doc_label: Hooks工具函数
generated_at: "2026-06-18T00:00:00.000Z"
parent_module: 数据集详情
roles: []
router_paths:
  - /dataset/detail?currentTab=test
---

## 说明

本模块未检测到 Hooks/Composables/Utils/Constants 目录或目录中无导出函数。本模块使用的工具函数均来自外部模块引用：

- `isDatabaseDataset`：来自 `@/pageComponents/dataset/utils/index`，用于判断数据集是否为数据库类型
- `useRequest`：来自 `@fastgpt/web/hooks/useRequest`，通用的异步请求管理 Hook
- `useToast`：来自 `@fastgpt/web/hooks/useToast`，消息提示 Hook

- 如果需要了解组件的状态管理逻辑，参见 [Store数据流](../../技术知识库/数据集/数据集详情/检索测试/Store数据流.md)
- 组件信息参见 [组件列表](../../技术知识库/数据集/数据集详情/检索测试/组件列表.md)
