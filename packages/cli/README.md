# FastGPT CLI

`@fastgpt/cli` 是 `@fastgpt-sdk/client` 的命令行封装，支持 Node.js ≥ 22.23.2。CLI 的 23 个知识库 Open API 操作与 SDK 使用同一份契约。范围以正式 `/apidoc/systemopenapi` 文档为准。

联合搜索命令依赖独立的服务端 [PR #8194](https://github.com/labring/FastGPT/pull/8194)，本 PR 仅包含 SDK/CLI。构建使用已提交契约；合并依赖和契约重新生成方式见 [SDK 说明](../../sdk/client/README.md)。

## 运行

```sh
pnpm build:cli
export FASTGPT_BASE_URL=http://localhost:3000
export FASTGPT_API_KEY=your-api-key
pnpm fastgpt --help
pnpm fastgpt dataset list --page-size 20
```

发布包提供 `fastgpt` 可执行文件；当前改动没有执行发布。CLI 已打包 SDK 和参数校验依赖，可独立安装。也可用 `--base-url`、`--api-key` 覆盖环境变量。认证与权限遵循 [SDK 说明](../../sdk/client/README.md)。

## 常见操作

```sh
fastgpt dataset create --name '产品文档'
fastgpt dataset get --id DATASET_ID
fastgpt dataset collection list --dataset-id DATASET_ID
fastgpt dataset collection import-text --dataset-id DATASET_ID \
  --name 入门 --text 'FastGPT 是一个 AI Agent 构建平台。' --wait
fastgpt dataset collection upload --dataset-id DATASET_ID --file './手册.pdf' --wait
fastgpt dataset collection wait --collection-id COLLECTION_ID --wait-timeout 300000
fastgpt dataset chunk list --collection-id COLLECTION_ID
fastgpt dataset search --dataset-id DATASET_A --dataset-id DATASET_B \
  --text '如何退款？' --mode mixedRecall --rerank
fastgpt dataset collection download-ticket --dataset-id DATASET_ID \
  --collection-ids '["COLLECTION_ID"]'
fastgpt dataset collection download --ticket TICKET --output './backup.zip'
```

资源名为单数，方法名使用 kebab-case，例如 `dataset collection import-text`、`dataset chunk push`、`dataset batch move`。`--help` 列出完整命令，也可在命令后添加 `--help` 查看 SDK 操作映射。

`--wait` 仅支持返回单个新集合的文本、网址或文件导入操作。`--wait=false` 或 `--no-wait` 可关闭等待。`--timeout` 控制单次 HTTP 请求，`--wait-timeout` 控制整体等待，`--poll-interval` 控制轮询间隔，单位均为毫秒。

## 结构化输入

字段使用 `--kebab-case`，嵌套字段使用点分路径；数组可重复传入或传 JSON。复杂参数建议保存为 JSON：

```json
{
  "scope": { "datasetIds": ["507f1f77bcf86cd799439011"] },
  "query": { "text": "如何退款？" },
  "retrieval": { "mode": "mixedRecall", "embeddingWeight": 0.5 },
  "rerank": { "enabled": false },
  "result": { "maxTokens": 5000, "similarity": 0 }
}
```

```sh
fastgpt dataset search --input search.json
cat search.json | fastgpt dataset search --input -
fastgpt dataset search --params '{"scope":{"datasetIds":["507f1f77bcf86cd799439011"]},"query":{"text":"退款"}}'
```

`--input` 与 `--params` 互斥；字段 flags 可以覆盖 JSON 中同一路径的值。命令会在请求前拒绝未知字段及可用 Schema 能表达的无效输入，服务端继续执行完整业务校验。上传使用 `--file`，当前仅封装公开的单文件上传接口，每次指定一个文件。

## 输出和退出码

默认将单个 JSON 结果写入 stdout，错误 JSON 写入 stderr；`--format text` 提供缩进 JSON 和简短错误。`--json` 显式选择 JSON 模式。

集合下载先申请 `download-ticket`，再将返回的 `ticket` 交给 `download`。下载必须指定 `--output PATH`，文件已存在时拒绝覆盖，失败时清理本次产生的部分文件。`--output -` 将原始字节写入 stdout，便于管道操作。

| 退出码 | 含义 |
| --- | --- |
| 0 | 成功 |
| 1 | 请求、权限、训练或文件操作失败 |
| 2 | 参数、JSON 或本地配置错误 |

## 开发

```sh
pnpm --dir packages/cli typecheck
pnpm --dir packages/cli test --coverage
pnpm build:cli
```

服务端契约变更先执行 `pnpm --dir sdk/client generate`。真实 API Key 测试位于 SDK 的 `test/live`，同时运行构建后的 CLI，覆盖上传、等待、联合搜索与集合归档下载。
