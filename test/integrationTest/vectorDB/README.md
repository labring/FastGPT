# 向量数据库集成测试

对 FastGPT 各向量库控制器（PGVector、后续 Oceanbase/Milvus）做真实环境下的集成测试，保证向量相关操作兼容和稳定。采用**工厂模式**：同一套数据集（fixtures）和同一套用例（factory）驱动 n 个向量库测试。

## 环境变量

测试环境变量由 **test/.env.test.local** 提供（不提交到 git）。请复制模板并填写：

```bash
cp test/.env.test.template test/.env.test.local
# 编辑 test/.env.test.local，填入 PG_URL 等
```

`setup.ts` 会在测试启动时读取 `test/.env.test.local` 并注入到 `process.env`。

| 变量 | 说明 | 适用驱动 |
|------|------|----------|
| `PG_URL` | PostgreSQL + pgvector 连接串 | PgVectorCtrl |
| `OCEANBASE_URL` | Oceanbase 连接串（后续） | ObVectorCtrl |
| `MILVUS_ADDRESS` | Milvus 地址（后续） | MilvusCtrl |

未设置对应环境变量时，该驱动的集成测试会**整体跳过**，不会报错。

## 运行方式

在项目根目录执行：

```bash
# 仅运行单元测试（未配置 .env.test.local 或未设 PG_URL 时，vectorDB 集成测试会跳过）
pnpm test

# 运行所有向量库测试（包含 vectorDB 集成测试与相关单元测试）
pnpm test:vector
```

## 结构说明

- **fixtures.ts**：统一测试数据（`TEST_TEAM_ID`、`TEST_DATASET_ID`、`TEST_COLLECTION_ID`、1536 维 `TEST_VECTORS`），所有向量库共用。
- **factory.ts**：工厂函数 `runVectorDBTests(driver)`，同一套用例（init、insert、getVectorCount、embRecall、getVectorDataByTime、delete）供各驱动复用。
- **integration.test.ts**：注册各驱动（PG、后续 Oceanbase/Milvus），按 `driver.envKey` 决定是否跳过；每个驱动执行同一套 `runVectorDBTests(driver)`。

新增向量库时：在 `integration.test.ts` 的 `drivers` 数组中增加一项（`name`、`envKey`、`createCtrl`），无需改 fixtures 或 factory。
