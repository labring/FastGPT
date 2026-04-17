# 功能开发文档

## 文档标识

- 任务前缀：`md-encoding-repair`
- 文档文件名：`md-encoding-repair-功能开发文档.md`
- 文档状态：已补全（实施完成版）
- 最后更新：2026-04-15

## 0. 开发目标与约束

- 功能目标：修复“Markdown 文件前部英文导致编码误判为 `ascii`，从而中文乱码”的问题。
- 核心策略：`UTF-8 严格校验优先（BOM + 字节级合法性校验）`，失败后再进入探测回退。
- 代码范围：
  - `FastGPT/packages/global/common/file/tools.ts`
  - `FastGPT/packages/service/worker/readFile/extension/rawText.ts`
  - `FastGPT/test/cases/global/common/file/tool.test.ts`
  - `FastGPT/test/cases/service/common/file/read/encoding.regression.test.ts`
- 非目标（明确不做）：API 协议、DB schema、前端交互改造。
- 必须遵循规范：`/Users/xxyyh/.codex/skills/fastgpt-requirement-design/references/style-standards-entry.md`
- 适用维度（从需求分析继承）：API[ ] DB[ ] Front[ ] Logger[ ] Package[x]

## 1. 实施任务拆解（执行结果）

| 任务ID | 任务名称 | 责任层 | 执行结果 | 完成定义（DoD） | 状态 |
|---|---|---|---|---|---|
| T1 | 重构编码检测策略 | Service（global utils） | `detectFileEncoding` 改为 BOM + UTF-8 严格校验优先；失败再 fallback 探测 | 不再依赖“仅前 200 字节” | ✅ 已完成 |
| T2 | 增加 `ascii` 误判兜底 | Service（global + worker） | 检测层与解码层都对 `ascii` + 非 ASCII 字节做兜底 | 不再按错误 `ascii` 解码中文 | ✅ 已完成 |
| T3 | 补充/修正单测 | Test | 增加 BOM、长英文前缀+中文正文等用例 | 新场景稳定通过 | ✅ 已完成 |
| T4 | 解码层轻量保护落地 | Service（worker） | `readFileRawText` 增加 `ascii` 误判兜底，并复用全局 `hasNonAsciiByte` | 上游误判时仍输出可读文本 | ✅ 已完成 |
| T5 | 编码回归矩阵补齐 | Test | 新增 `encoding.regression.test.ts` 覆盖 4 类编码回归场景 | 回归矩阵全通过 | ✅ 已完成 |

## 2. 文件级改动清单

| 文件路径 | 改动类型 | 变更摘要 | 关联任务ID |
|---|---|---|---|
| `FastGPT/packages/global/common/file/tools.ts` | 修改 | 新增 `hasUtf8Bom`、`isValidUtf8`、`getDetectSample`、导出 `hasNonAsciiByte`；`detectFileEncoding` 改为验证优先策略 | T1,T2 |
| `FastGPT/packages/service/worker/readFile/extension/rawText.ts` | 修改 | 删除本地重复 `hasNonAsciiByte`，改为复用全局工具；`ascii` + 非 ASCII 字节时改走 UTF-8 解码 | T2,T4 |
| `FastGPT/test/cases/global/common/file/tool.test.ts` | 修改 | 新增 UTF-8 BOM 测试；新增“长英文前缀 + 中文正文”测试；替换旧弱断言用例语义 | T3 |
| `FastGPT/test/cases/service/common/file/read/encoding.regression.test.ts` | 新增 | 新增编码回归矩阵（UTF-8 混排、ASCII、ascii 误传、非法 UTF-8） | T5 |

## 3. 后端实施说明

### 3.1 API 改动

| 路由 | 方法 | 请求参数 | 响应结构 | 鉴权 | 错误处理 |
|---|---|---|---|---|---|
| N/A | N/A | N/A | N/A | N/A | N/A |

说明：本需求仅涉及文件编码判定与解码策略，不改 API 合约。

### 3.2 Service/Core 改动

| 模块 | 函数/类型 | 具体改动 | 依赖关系 |
|---|---|---|---|
| `packages/global/common/file/tools.ts` | `detectFileEncoding` | 判定顺序改为：`BOM -> strict UTF-8 validate -> jschardet fallback`；对 `ascii` + 非 ASCII 字节做兜底 | 仅使用现有 `jschardet`，未新增依赖 |
| `packages/global/common/file/tools.ts` | `hasNonAsciiByte` | 由私有函数改为导出，供多处复用 | 复用方为 service worker 解码逻辑 |
| `packages/service/worker/readFile/extension/rawText.ts` | `readFileRawText` | 新增 `normalizedEncoding`，在 `encoding='ascii'` 且检测到非 ASCII 字节时强制按 UTF-8 解码 | 复用 `@fastgpt/global/common/file/tools` |

### 3.3 数据层改动

| 集合/表 | 字段 | 类型 | 必填 | 默认值 | 索引 | 迁移策略 |
|---|---|---|---|---|---|---|
| N/A | N/A | N/A | N/A | N/A | N/A | 无需迁移 |

## 4. 前端实施说明

| 页面/组件 | 文件路径 | 交互变化 | i18n 改动 | 状态覆盖 |
|---|---|---|---|---|
| N/A | N/A | 无 | 无 | N/A |

## 5. 日志与可观测性

| 触发点 | 日志级别 | category | 字段 | 备注 |
|---|---|---|---|---|
| 本期无新增日志点 | N/A | N/A | N/A | 为最小改动未加新日志，后续可按需要加 debug 观测 |

## 6. 测试与验证

### 6.1 自动化测试清单（已执行）

| 测试文件 | 覆盖重点 | 结果 |
|---|---|---|
| `test/cases/global/common/file/tool.test.ts` | 编码检测基础能力（UTF-8、ASCII、BOM、混排场景） | ✅ 通过 |
| `test/cases/service/common/file/read/utils.test.ts` | 文件读取主链路（readFileContentByBuffer） | ✅ 通过 |
| `test/cases/service/common/file/gridfs/utils.test.ts` | 预览流编码链路（stream2Encoding） | ✅ 通过 |
| `test/cases/service/common/file/read/encoding.regression.test.ts` | 编码回归矩阵（4 场景） | ✅ 通过 |

### 6.2 回归矩阵（新增）

| 场景 | 输入 | 预期 | 结果 |
|---|---|---|---|
| UTF-8 混排正文 | 长英文前缀 + 中文正文（UTF-8） | 检测 `utf-8`，中文可读 | ✅ |
| 纯 ASCII 文本 | `Hello ASCII 123` | 行为不变 | ✅ |
| `ascii` 误传 | UTF-8 中文 buffer + `encoding='ascii'` | 触发兜底，中文可读 | ✅ |
| 非法 UTF-8 序列 | 非 UTF-8 合法字节序列 | 不应判为 `utf-8` | ✅ |

### 6.3 执行命令与结果

执行命令：

```bash
pnpm -C FastGPT exec vitest run \
  test/cases/global/common/file/tool.test.ts \
  test/cases/service/common/file/read/utils.test.ts \
  test/cases/service/common/file/gridfs/utils.test.ts \
  test/cases/service/common/file/read/encoding.regression.test.ts
```

结果摘要：
- Test Files: `4 passed (4)`
- Tests: `45 passed (45)`

### 6.4 UTF-8 严格校验性能检测报告（新增）

#### 6.4.1 检测背景
- 目标：评估 `isValidUtf8(buffer)` 全量线性扫描在大文件场景下的 CPU 开销，确认是否需要阈值门控。
- 方法：在本地通过 Node.js 基准脚本，复用当前实现逻辑，分别对 ASCII 缓冲区与中英混排 UTF-8 缓冲区做多轮扫描取平均值。

#### 6.4.2 检测结果（平均单次扫描耗时）

| 文件大小 | ASCII only | UTF-8 中英混排 |
|---|---:|---:|
| 10MB | 16.20ms | 32.21ms |
| 50MB | 84.04ms | 87.52ms |
| 100MB | 160.06ms | 169.08ms |
| 200MB | 327.01ms | 345.51ms |
| 500MB | 894.27ms | 880.22ms |

补充：实测吞吐约 `560~620 MB/s`，整体符合线性增长特征（O(n)）。

#### 6.4.3 结论与策略
- 20MB 以下：开销较小，通常无体感影响。
- 50~100MB：开始出现可感知延迟。
- 200MB 以上：单次扫描约 300ms+，并发场景下会放大 CPU 压力。
- 500MB：接近 1 秒/次，不建议默认全量严格校验。

建议落地策略：
1. 交互链路默认仅对 `<=32MB`（或 `<=64MB`）执行全量 UTF-8 严格校验。  
2. 超过阈值时跳过全量校验，改走采样探测 fallback。  
3. 后续可按线上机器规格和峰值并发再微调阈值。

## 7. 质量自检清单

- [x] 输入与权限流程未被破坏（未改 API/权限逻辑）
- [x] 无新增 `any` 滥用、无未处理 Promise
- [x] 包依赖方向符合 monorepo 约束（`service` 复用 `global`）
- [x] 覆盖关键回归场景（UTF-8 混排、ascii 误判兜底）
- [x] 无新增敏感日志输出

## 8. 发布与回滚

### 8.1 发布步骤
1. 合并代码后在测试环境执行上述 4 组回归测试。  
2. 手工上传 UTF-8 中英混排 Markdown，确认预览与入库内容正常。  
3. 观察线上相关解析失败反馈。

### 8.2 回滚触发条件
- 发布后出现明显新增的非 UTF-8 文本解析失败反馈。

### 8.3 回滚步骤
1. 回滚 `FastGPT/packages/global/common/file/tools.ts` 与 `FastGPT/packages/service/worker/readFile/extension/rawText.ts`。  
2. 重新发布并复测上传链路。

## 9. AI 实施提示（给执行模型）

- 编码检测必须坚持“验证优先”，禁止回退到“仅前缀猜测优先”。
- 若后续扩展多候选编码评分，单独开需求，不在本任务内扩大范围。
- 每次改动编码策略后，必须至少跑本文件第 6.3 节的回归命令。
