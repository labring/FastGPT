---
name: fastgpt-knowledge
description: Manage FastGPT knowledge base datasets, collections, chunks, and unified multi-dataset recall search using the 21 dataset CLI commands.
---

# FastGPT Knowledge Base (`dataset`)

All 21 `dataset` commands accept `token` or `personalKey` (`appKey` is blocked at exit code `3`). Destructive commands require `--yes` in non-TTY / `--format json` mode; all write commands support `--dry-run`.

## 1. Datasets (`dataset`) — 8 Commands

- List and inspect:
  - `fastgpt dataset list --format json` (supports `--search <keyword>`, `--parent-id <id|null>`, `--type <type>`, `--dataset-ids <ids>`, `--with-app-count`, `--with-file-count`, `--page <n>`, `--page-size <n>`, `--offset <n>`)
  - `fastgpt dataset get <datasetId> --format json` (or `--id <datasetId>`)
- Create, update, move, and delete:
  - `fastgpt dataset create --name "Product Docs" --intro "Technical specs" --format json` (supports `--type`, `--vector-model`, `--agent-model`, `--vlm-model`, `--parent-id`, `--file <path>`, `--stdin`, `--dry-run`)
  - `fastgpt dataset update <datasetId> --name "New Name" --format json` (supports `--id`, `--intro`, `--avatar`, `--agent-model`, `--vlm-model`, `--parent-id`, `--auto-sync` / `--no-auto-sync`, `--file`, `--stdin`, `--dry-run`)
  - `fastgpt dataset batch-move --ids <id1,id2> --parent-id <folderId|null> --format json` (supports `--dry-run`)
  - `fastgpt dataset delete <datasetId> --yes --format json` (supports `--id`, `--dry-run`)
  - `fastgpt dataset batch-delete --ids <id1,id2> --yes --format json` (supports `--dry-run`)
- Unified recall search across 1 to 100 datasets:
  - `fastgpt dataset search <id1,id2> "What is FastGPT?" --topk 10 --format json`
  - Key flags: `--id <datasetIds>`, `--text <query>`, `--topk <n>`, `--maxTokens <n>`, `--similarity <score>`, `--mode <embedding|fullTextRecall|mixedRecall>`, `--embeddingWeight <w>`, `--usageScene <search|searchTest>`, `--collectionIds <ids>`, `--createTimeGte <iso>`, `--createTimeLte <iso>`, `--tagsAnd <json>`, `--tagsOr <json>`, `--rerank` / `--no-rerank`, `--rerankModelId <id>`, `--rerankCandidateNum <n>`, `--rerankWeight <w>`, `--queryExtension` / `--no-queryExtension`, `--queryExtensionModelId <id>`, `--queryExtensionBackground <text>`, `--file <path>`, `--stdin`.

## 2. Collections (`dataset collection`) — 8 Commands

- List and inspect:
  - `fastgpt dataset collection list <datasetId> --format json` (supports `--dataset-id`, `--parent-id`, `--search`, `--select-folder`, `--sort-by <name|createTime|updateTime>`, `--sort-order <asc|desc>`, `--simple`, `--page`, `--page-size`, `--offset`)
  - `fastgpt dataset collection get <collectionId> --format json` (or `--id <collectionId>`)
- Create and import:
  - `fastgpt dataset collection create <datasetId> --name "Manual FAQ" --type virtual --format json` (`--type` accepts `virtual` or `folder`; supports `--dataset-id`, `--parent-id`, `--dry-run`)
  - `fastgpt dataset collection create-text <datasetId> --name "Notes" --file ./notes.md --format json` (supports `--text`, `--file`, `--stdin`, `--parent-id`, `--training-type`, `--chunk-size`, `--config-file`, `--dry-run`)
  - `fastgpt dataset collection create-link <datasetId> https://doc.fastgpt.cn --format json` (supports `--dataset-id`, `--link`, `--parent-id`, `--training-type`, `--chunk-size`, `--dry-run`)
  - `fastgpt dataset collection create-file <datasetId> ./manual.pdf --format json` (multipart upload; supports `--dataset-id`, `--file`, `--parent-id`, `--training-type`, `--chunk-size`, `--custom-pdf-parse`, `--config-file`, `--dry-run`)
- Update and delete:
  - `fastgpt dataset collection update <collectionId> --name "Updated Title" --format json` (supports `--id`, `--parent-id`, `--forbid` / `--no-forbid`, `--file`, `--dry-run`)
  - `fastgpt dataset collection delete <collectionId> --yes --format json` (supports `--id`, `--ids <id1,id2>`, `--dry-run`)

## 3. Data Chunks (`dataset data`) — 5 Commands

- List and inspect:
  - `fastgpt dataset data list <collectionId> --format json` (supports `--collection-id`, `--search`, `--page`, `--page-size`, `--offset`)
  - `fastgpt dataset data get <dataId> --format json` (or `--id <dataId>`)
- Push, update, and delete:
  - `fastgpt dataset data push <collectionId> --file ./chunks.json --format json` (up to 200 chunks per batch; accepts JSON array or `PushData` object via `--file` or `--stdin`, plus `--collection-id`, `--training-type`, `--dry-run`)
  - `fastgpt dataset data update <dataId> --q "Updated question" --a "Updated answer" --format json` (supports `--id`, `--file`, `--dry-run`)
  - `fastgpt dataset data delete <dataId> --yes --format json` (supports `--id`, `--dry-run`)

## 4. Recommended Ingestion & Recall Loop

1. Create or locate a dataset with `fastgpt dataset list --format json` or `fastgpt dataset create --name "..." --format json`.
2. Preview imports with `--dry-run`, then ingest via `fastgpt dataset collection create-file`, `fastgpt dataset collection create-text`, `fastgpt dataset collection create-link`, or `fastgpt dataset data push`.
3. Verify chunk indexing with `fastgpt dataset collection get <collectionId> --format json` and `fastgpt dataset data list <collectionId> --format json`.
4. Tune retrieval quality with `fastgpt dataset search <datasetId> "<query>" --mode mixedRecall --rerank --format json`.
