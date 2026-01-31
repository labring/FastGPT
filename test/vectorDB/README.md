# 向量数据库集成测试

对 FastGPT 各向量库控制器（PGVector、后续 Oceanbase/Milvus）做真实环境下的集成测试，保证向量相关操作兼容和稳定。

## 环境变量

| 变量 | 说明 | 适用测试 |
|------|------|----------|
| `PG_URL` | PostgreSQL + pgvector 连接串 | `pg.integration.test.ts` |
| `OCEANBASE_URL` | Oceanbase 连接串（后续） | Oceanbase 集成测试 |
| `MILVUS_ADDRESS` | Milvus 地址（后续） | Milvus 集成测试 |

未设置对应环境变量时，该组集成测试会**整体跳过**，不会报错。

## 运行方式

在项目根目录执行：

```bash
# 仅运行单元测试（不设 PG_URL 时，vectorDB 集成测试会跳过）
pnpm test

# 运行 PG 集成测试（需先启动带 pgvector 的 PostgreSQL 并设置 PG_URL）
PG_URL=postgresql://user:pass@localhost:5432/dbname pnpm test test/vectorDB
```

## 测试数据

所有向量库使用**同一份测试数据**，定义在 `fixtures.ts`：

- `TEST_TEAM_ID` / `TEST_DATASET_ID` / `TEST_COLLECTION_ID`：隔离测试数据
- `TEST_VECTORS`：1536 维固定向量，用于 insert 与 embRecall

后续为 Oceanbase、Milvus 增加集成测试时，复用同一份 fixtures，仅替换控制器实现（`ObVectorCtrl`、`MilvusCtrl`）与对应 `skipIf` 条件即可。
