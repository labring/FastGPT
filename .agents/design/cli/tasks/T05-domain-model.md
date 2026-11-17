# T05：`model` AI 模型目录与连通性测试域

- **所属需求包**：`PKG-04` 对话与模型（Chat & Model）（Record: `reczz28YGuG6RMRm`）
- **对应 PRD**：`PRD-04.3` 模型目录查询与连通性探测（Record: `reczz28YDq8uVwHs` · [飞书任务看板](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)）
- **覆盖 FR**：`FR-405` `model list/detail/catalog` 目录筛选、`FR-406` `model test` 连通性探测
- **阶段 / 优先级**：Phase 1 · P1（高频基础查询域，支撑 `dataset create`、`workflow`、`app` 选模型）
- **状态**：待前置 T00
- **前置依赖**：T00（基础渲染与管线即可，工作量较轻）
- **开发红线**：必读 [engineering-standards.md](../engineering-standards.md) · 总览 [design.md](../design.md) · 索引 [index.md](../index.md)
- **可并行性**：T00 合入后与 T01 ~ T10 完全并行

---

## 1. 目标

提供团队可用 AI 模型列表查询（按 LLM / Embedding / Rerank / TTS / STT 分类过滤）、模型能力参数查看以及模型连通性探测命令，让人工和 Agent 在创建应用或知识库前不必手猜 `model` 字符串。

---

## 2. 命令设计与接口映射

> 注意：`projects/app/src/pages/api/core/ai/model/**` 中有普通用户查询接口与管理员配置接口之分；`T05` 只覆盖普通团队级查询与测试，系统级模型渠道增删改归 `T10`（`admin` 域）。实现前务必核对各路由权限！

| 命令 | 对应服务端接口 | 风险 | 默认 `authModes` | 说明 |
|---|---|---|---|---|
| `model list` | `/core/ai/model/list` | `read` | 核对路由（通常 `['token', 'personalKey']` 或仅 `token`） | 支持 `--type <llm\|embedding\|rerank\|tts\|stt>` 过滤与关键字段精简展示（`model`/`name`/`type`/`maxContext`） |
| `model detail <model>` | `/core/ai/model/detail` | `read` | 核对路由 | 查看单个模型完整配置与定价/能力参数 |
| `model catalog` | `/core/ai/model/catalog` | `read` | 核对路由 | 查看可用模型目录与默认模型设置 |
| `model test <model>` | `/core/ai/model/test` | `read`（只读探活） | 核对路由（可能仅管理员/root） | 向服务端发起模型连通性测试并返回耗时与可用性（注意检查 `admin`/root 权限要求，若仅限管理员需调整 `risk: 'admin'`） |

---

## 3. 核心实现要点与限制

- **过滤与裁剪**：服务端 `/core/ai/model/list` 返回的字段较多，text 模式下应默认输出精简列表（`model`, `name`, `type`, `provider`, `isActive`），传入 `--verbose` 或 `--format json` 时保留完整数据结构。
- **权限核对**：特别是 `/core/ai/model/test` 与 `/core/ai/model/config`，若服务端限制 root/系统管理员，必须在 `CliCommandSpec` 标明 `risk: 'admin'` 或清晰报错提示，不要让普通用户误以为可用。
- **目录落点**：
  - `src/domain/model/model-service.ts`
  - `src/cli/commands/model.ts`

---

## 4. 验收标准与测试清单

- [ ] 单测覆盖：`model list` 按 `--type` 客户端筛选逻辑正确、空列表输出优雅。
- [ ] 单测覆盖：各子命令 `authModes` 与真实后端路由鉴权逻辑一致（附核对记录）。
- [ ] 全套本地门禁（`test:ci` / `lint` / `build:bun` / `compile` / `app typecheck`）通过。
