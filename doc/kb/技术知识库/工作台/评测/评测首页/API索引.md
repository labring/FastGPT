---
capability_label: 评测首页
doc_type: "12"
doc_label: "API索引"
generated_at: 2026-06-18T10:30:56Z
parent_module: 评测
roles: ["所有登录用户"]
router_paths: ["/dashboard/evaluation"]
---

# 评测首页 — API索引

## 说明

本模块（评测首页）为 Tab 容器页面，本身不直接发起 HTTP 请求。页面仅负责：
- 权限校验（检查 feConfigs.show_evaluation 系统配置）
- Tab 路由切换（URL query 参数 evaluationTab）

所有实际的 API 调用分布在3个子 Tab 中：

| Tab | API 文件位置 | 详细文档 |
|-----|-------------|---------|
| 评测任务 | projects/app/src/web/core/evaluation/task.ts | [评测任务 API索引](../../../../技术知识库/工作台/评测/评测首页/评测任务/API索引.md) |
| 评测数据集 | projects/app/src/web/core/evaluation/dataset.ts | [评测数据集 API索引](../../../../技术知识库/工作台/评测/评测首页/评测数据集/API索引.md) |
| 评测维度 | projects/app/src/web/core/evaluation/dimension.ts | [评测维度 API索引](../../../../技术知识库/工作台/评测/评测首页/评测维度/API索引.md) |
