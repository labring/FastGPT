# 需求设计文档

## 0. 文档标识

- 任务前缀：`md-encoding-repair`
- 文档文件名：`md-encoding-repair-需求设计文档.md`
- 文档状态：已补全（实施回填版）
- 最后更新：2026-04-15

## 1. 需求背景与目标

### 1.1 背景
- 问题现状：知识库上传 `.md` 文件时，若文件开头英文占比高，系统可能将编码误判为 `ascii`，随后按 `ascii` 解码整篇文本，导致中文出现乱码。
- 触发场景：`md/txt/csv/html` 等文本文件，文件前部主要为英文，中文内容出现在较后位置。

### 1.2 目标
- 业务目标：保证知识库文档上传后中文内容可被正确解析并进入分段/训练链路。
- 技术目标：避免“前部英文导致整篇 `ascii` 误判”的编码检测缺陷。
- 成功指标（可量化）：
  - 构造“前 500+ 字节英文、后续中文”的 UTF-8 Markdown 文件，解析结果中文不乱码。
  - 纯英文 ASCII 文件解析结果保持不变。
  - 编码相关回归测试全量通过。

## 2. 当前项目事实基线（基于代码）

| 能力项 | 现有实现位置（文件路径） | 现状说明 | 结论（复用/修改/新增） |
|---|---|---|---|
| API | `FastGPT/projects/app/src/pages/api/core/dataset/collection/create/fileId.ts` | 上传后创建文件型 collection 的入口；本身不处理编码，只触发后续解析流程 | 复用 |
| Core Service | `FastGPT/packages/service/core/dataset/read.ts` -> `FastGPT/packages/service/common/s3/sources/dataset/index.ts` | 读取 S3 文件后调用 `detectFileEncoding(buffer)`，再把 encoding 传给解析器 | 复用调用链，修改编码策略实现 |
| Worker Decode | `FastGPT/packages/service/worker/readFile/extension/rawText.ts` | 根据上游 encoding 对文本 buffer 解码 | 新增解码兜底保护 |
| DB Schema | `FastGPT/packages/service/core/dataset/collection/schema.ts` | 当前问题与 DB 结构无关 | 不改 |
| Frontend | `FastGPT/projects/app/src/pageComponents/dataset/detail/Import/diffSource/FileLocal.tsx` | 前端只负责上传到 S3，不决定后端解析编码 | 不改 |
| Logger | `FastGPT/packages/service/common/s3/sources/dataset/index.ts` | 当前已有下载日志；编码误判场景无专门日志 | 本期不改 |

关键代码锚点（实施后）：
- 编码判定入口：`FastGPT/packages/global/common/file/tools.ts` 中 `detectFileEncoding`（已改为验证优先）
- 解码兜底：`FastGPT/packages/service/worker/readFile/extension/rawText.ts` 中 `readFileRawText`

## 3. 需求澄清记录

| 维度 | 已确认内容 | 待确认内容 | 备注 |
|---|---|---|---|
| 业务目标 | 修复 Markdown 上传中文乱码 | 是否覆盖更多小众本地编码（如 Shift_JIS） | 后续二期可评估 |
| 范围边界 | 聚焦知识库/读文件链路的编码判定与解码保护 | 是否新增线上编码判定日志点 | 本期不做 |
| 权限模型 | 无权限模型变化 | 无 | N/A |
| 数据模型 | 不新增字段 | 无 | N/A |
| API 行为 | 不改 API 入参/出参 | 无 | N/A |
| 前端交互 | 不改页面交互 | 无 | N/A |

## 3.1 影响域判定（先判定，再核对规范）

| 维度 | 是否命中 | 证据（需求/代码锚点） | 核对规范 | 结论 |
|---|---|---|---|---|
| API | No | 编码问题发生在服务端文件解析，现有路由仅透传 fileId | `style/api.md` | Not Applicable（不改接口） |
| DB | No | 不涉及 schema/索引/数据迁移 | `style/db.md` | Not Applicable |
| Front | No | 上传流程不参与后端解码决策 | `style/front.md` | Not Applicable |
| Logger | No（本期） | 本期目标为最小可控修复，未新增观测点 | `style/logger.md` | Not Applicable |
| Package | Yes | 修改位置在 `packages/global` 与 `packages/service`，涉及跨包复用 | `style/package.md` | 已遵守依赖方向（service 依赖 global） |

## 4. 范围定义

### 4.1 In Scope（本期必须）
- 将 `detectFileEncoding` 从“猜测优先”调整为“验证优先”。
- 增加 `ascii` 误判保护（检测层+解码层双保险）。
- 补充编码回归测试矩阵，覆盖核心场景。

### 4.2 Out of Scope（本期不做）
- 不改知识库 API 协议。
- 不改数据库结构。
- 不做前端上传流程改造。
- 不引入多候选编码评分引擎（后续可独立需求）。

## 5. 方案对比

| 方案 | 核心思路 | 优点 | 风险 | 实施成本 | 结论 |
|---|---|---|---|---|---|
| 方案A（最小改动） | `UTF-8 验证优先（BOM + 严格字节校验）` + fallback 探测 + `ascii` 兜底 | 改动集中、确定性高、能直接修复现网主问题 | 对极端小众编码仍依赖 fallback | 低 | 推荐并已落地 |
| 方案B（可扩展） | 多候选编码试解 + 文本质量打分 | 覆盖更多边缘编码场景 | 复杂度与误判调参成本高 | 中-高 | 本期不选 |

推荐方案：方案A（已实施）。

## 6. 推荐方案详细设计（实施回填）

### 6.1 API 设计

| 路由 | 方法 | 鉴权 | 请求 | 响应 | 错误分支 | 相关文件 |
|---|---|---|---|---|---|---|
| N/A | N/A | N/A | N/A | N/A | N/A | 不涉及 |

### 6.2 数据设计

| 实体/集合 | 字段 | 类型 | 必填 | 默认值 | 索引/约束 | 兼容策略 |
|---|---|---|---|---|---|---|
| N/A | N/A | N/A | N/A | N/A | N/A | N/A |

### 6.3 核心代码设计

| 模块 | 关键函数/类型 | 实际变更 | 上下游影响 |
|---|---|---|---|
| `FastGPT/packages/global/common/file/tools.ts` | `detectFileEncoding(buffer)` | 判定顺序调整为：`hasUtf8Bom -> isValidUtf8 -> detect(getDetectSample)`；并增加 `ascii + 非 ASCII 字节` 兜底 | 所有调用方收益（知识库、工作流读文件、预览编码头） |
| `FastGPT/packages/global/common/file/tools.ts` | `hasNonAsciiByte(buffer)` | 从私有函数提升为导出工具函数，供多处复用 | 减少重复实现，维护单一事实源 |
| `FastGPT/packages/service/worker/readFile/extension/rawText.ts` | `readFileRawText` | 新增 `encoding='ascii'` 且存在非 ASCII 字节时强制 UTF-8 解码保护 | 防止上游误判导致中文乱码 |
| `FastGPT/test/cases/global/common/file/tool.test.ts` | `detectFileEncoding` tests | 新增 BOM 场景、长英文前缀+中文正文场景 | 防回归 |
| `FastGPT/test/cases/service/common/file/read/encoding.regression.test.ts` | 编码回归矩阵 | 新增 4 场景覆盖：UTF-8 混排、ASCII、ascii 误传、非法 UTF-8 | 回归覆盖补齐 |

### 6.4 前端设计

| 页面/组件 | 入口文件 | 交互状态（加载/空/错/成功） | i18n key | 变更说明 |
|---|---|---|---|---|
| N/A | N/A | N/A | N/A | 本期不涉及 |

### 6.5 日志与观测设计

| 场景 | 日志级别 | category | 结构化字段 | 脱敏策略 |
|---|---|---|---|---|
| 本期无新增日志 | N/A | N/A | N/A | N/A |

## 7. 风险、迁移与回滚

### 7.1 风险清单
- 风险1：严格 UTF-8 校验为 O(n) 线性扫描，超大文本文件会增加少量 CPU。
- 风险2：小众非 UTF-8 编码仍可能依赖 fallback 的稳定性。

### 7.2 迁移策略
- 无 DB 迁移。
- 通过新增回归矩阵 + 现有测试集进行功能验证。

### 7.3 回滚策略
- 回滚目标文件：
  - `FastGPT/packages/global/common/file/tools.ts`
  - `FastGPT/packages/service/worker/readFile/extension/rawText.ts`
- 回滚触发条件：发布后出现显著新增的“非 UTF-8 文本解析异常”反馈。

## 8. 验收标准（执行结果）

| 验收项 | 验收方式 | 通过标准 | 结果 |
|---|---|---|---|
| UTF-8 混合文档不乱码 | 自动化测试 + 手测路径定义 | 中文片段解析正常 | ✅ 通过 |
| 纯 ASCII 文档兼容 | 自动化测试 | 行为不回归 | ✅ 通过 |
| `ascii` 误传防护 | 自动化测试 | 解码结果中文可读 | ✅ 通过 |
| 回归安全 | 编码相关测试集合 | 全部通过 | ✅ 45/45 |

已执行测试命令：

```bash
pnpm -C FastGPT exec vitest run \
  test/cases/global/common/file/tool.test.ts \
  test/cases/service/common/file/read/utils.test.ts \
  test/cases/service/common/file/gridfs/utils.test.ts \
  test/cases/service/common/file/read/encoding.regression.test.ts
```

测试结果摘要：
- Test Files: `4 passed (4)`
- Tests: `45 passed (45)`

## 9. MECE 核查结论（实施后）

### 9.1 相互独立检查结果
- 发现问题：编码检测与解码保护存在重复判断风险。
- 影响范围：后续维护可能出现策略漂移。
- 修订动作：统一由 `tools.ts` 提供通用工具（`hasNonAsciiByte`），`rawText.ts` 仅做末端防护。
- 修订后结果：职责清晰，复用一致。

### 9.2 完全穷尽检查结果
- 发现问题：仅修检测层不足以防止历史调用链误传 `ascii`。
- 影响范围：部分链路仍可能乱码。
- 修订动作：增加解码层二次兜底 + 回归矩阵覆盖误传场景。
- 修订后结果：正常/异常链路覆盖完整。

### 9.3 修订动作与最终边界
- 本期聚焦编码检测与解码兜底，不扩展 API/DB/前端。
- 后续若要支持更广泛本地编码智能识别，建议单开“多候选评分”二期需求。
