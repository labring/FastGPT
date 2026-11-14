# 已退役编号

以下编号不再分配，也不作为业务集成用例执行：

- `FG-ADMIN-MAINTENANCE-001`：publishSource 系统迁移，改由迁移代码旁专项测试验证。
- `FG-ADMIN-MAINTENANCE-002`：API Key 类型系统迁移，改由迁移代码旁专项测试验证。

编号冲突消解：PR #8205 原路径 `dataset/ingestion/FG-DATASET-INGESTION-001-index-model-availability.md` 改用 `FG-DATASET-INGESTION-002`；合入 main 时发现 `001` 已被 `FG-DATASET-INGESTION-001-website-sync-lifecycle.md` 使用，后者保持有效，不退役该编号。按旧路径查找索引模型可用性用例时转到 `002`。
