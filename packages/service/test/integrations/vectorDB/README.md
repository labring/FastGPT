# 向量数据库集成测试

对 FastGPT 各向量库控制器（PGVector、后续 Oceanbase/Milvus）做真实环境下的集成测试，保证向量相关操作兼容和稳定。采用**工厂模式**：同一套数据集和同一套用例驱动多个向量库测试。

## 环境变量

测试环境变量由 **test/.env.test.local** 提供（不提交到 git）。请复制模板并填写：

```bash
cp test/.env.example test/.env.test.local
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
# 仅运行 workspace 默认测试（不包含 integration）
pnpm test

# 运行 service integration tests
pnpm test:service:integration

# 运行当前这组 vectorDB 集成测试
pnpm test:vector
```

## 结构说明

- `testData.ts`：统一测试数据（1536 维 `TEST_VECTORS` 等），所有向量库共用。
- `testSuites.ts`：工厂函数 `createVectorDBTestSuite(vectorCtrl)`，同一套用例供各驱动复用。
- `*/index.integration.test.ts`：各向量库入口，按环境变量决定是否跳过。

新增向量库时：新增一个 `*/index.integration.test.ts`，复用 `testData.ts` 和 `testSuites.ts` 即可。
