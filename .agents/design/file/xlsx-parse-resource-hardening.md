# XLSX 解析资源预算加固

## 背景

XLSX 是 ZIP 容器。工作表解析至少存在三类相互独立的膨胀路径：

1. worksheet 的 `dimension`、实际单元格坐标或合并范围过大，导致二维数组和合并回填膨胀；
2. `dimension` 低报、缺失或与实际 `<row>` / `<c>` 坐标不一致，绕过基于 `!ref` 的事后校验；
3. worksheet、shared strings、styles 等 XML 具有高压缩比，即使单元格范围合法，也可能在 ZIP 解压阶段消耗大量内存。

`worker_threads.resourceLimits.maxOldGenerationSizeMb` 只限制 V8 old generation，不能完整限制
`Buffer` 等 external/native memory。因此 worker 内存限制只能作为最后一道故障隔离，不能代替 XLSX
内容预检。

## 目标

- 在调用 `XLSX.read()` 前完成 ZIP/XML 膨胀预算和真实 worksheet 坐标校验。
- 不信任 worksheet `dimension`；以实际 `<row>`、`<c>` 和 `<mergeCell>` 坐标为准。
- 在生成二维数组前限制单表行列、工作簿累计范围单元格数和累计合并回填量。
- 限制 XLSX 中所有普通文件 entry 的累计真实解压字节数，阻断伪造 ZIP 元数据以及 XML、图片等任意高压缩比内容。
- 所有业务预算均可通过环境变量调整；XLSX 格式自身无法表达的坐标仍按格式上限拒绝。
- 不保留 SheetJS `bookFiles`，避免源 ZIP 内容和 worksheet 对象同时驻留。

## 非目标

- 不改变 XLSX 转 CSV、Markdown、空行空列过滤和合并单元格回填的业务语义。
- 不在本次改动中重写 SheetJS，也不为所有 Office 格式建立统一 OOXML 解析框架。
- 不以 Node worker old-generation 上限宣称限制进程总 RSS；容器内存限制仍是最终边界。

## 方案

### 1. 流式 ZIP 预检

使用项目已有的 `yauzl`：

- `lazyEntries: true`，逐个处理 entry；
- `validateEntrySizes: true`，校验 ZIP 声明大小和实际解压大小；
- `strictFileNames: true`，拒绝危险路径；
- 限制 ZIP entry 总数，避免大量空 entry 消耗 CPU/对象内存；
- 对所有普通文件 entry 逐流读取，按实际 data chunk 累计解压字节数；
- 达到累计归档解压预算后立即 destroy stream、关闭 ZIP 并拒绝解析；
- entry 内容以 XML 开始时才启用 tag 扫描，因此 worksheet 不依赖固定路径或扩展名。

预检只保留当前 XML tag 的有限长度尾部，不拼接完整 XML，也不保留 entry 内容。

### 2. worksheet 识别与增量 tag 扫描

不依赖固定 `xl/worksheets/*.xml` 路径。XML entry 的第一个业务根元素 local name 为
`worksheet` 时，将该 entry 作为 worksheet 扫描。这样可以覆盖通过 OPC relationship 放在非标准路径的工作表。

增量扫描器只识别开始 tag，并正确处理：

- 单/双引号内的 `>`；
- processing instruction、comment、CDATA 和 closing tag；
- namespace prefix；
- 跨 chunk tag；
- 超长 tag，达到固定 tag 长度上限后直接拒绝。

worksheet 中关注：

- `<dimension ref="...">`：仅用于一致性检查，不作为资源计数权威来源；
- `<row r="...">`：校验绝对行坐标；
- `<c r="...">`：校验实际单元格坐标并扩展真实使用范围；
- `<mergeCell ref="...">`：校验 merge 坐标、累计回填量，并扩展有效范围。

除范围面积外，还分别限制 `<row>` 和 `<c>` 元素数量，避免攻击者重复声明同一坐标，
在不扩大范围的情况下消耗 XML 解析 CPU。

### 3. 范围和累计预算

单工作表有效范围为实际单元格范围与 merge 范围的并集。空工作表不计范围单元格。

- 行限制使用最大绝对行坐标加一；
- 列限制使用最大绝对列坐标加一；
- 工作表范围单元格数使用并集包围盒面积；
- 工作簿单元格和 merge 预算使用减法式比较，避免乘法或累计加法溢出；
- `dimension` 未包含实际单元格或 merge 时拒绝，避免 SheetJS 隐式丢数据；
- `dimension` 高报时按高报范围计入预算，因为 SheetJS 的 `sheet_to_json` 会按该范围物化；
- merge 必须位于最终 worksheet 范围内。

可配置坐标同时受 XLSX 格式上限约束：1,048,576 行、16,384 列。

### 4. SheetJS 解析

预检通过后再执行 `XLSX.read()`：

- 保留 `sheetRows` 作为纵深保护；
- 移除 `bookFiles: true` 和对 SheetJS 内部 `files/keys` 结构的依赖；
- 在 `sheet_to_json` 前保留轻量防御性校验，防止预检器与 SheetJS 解释不一致；
- 合并单元格回填仍按预检预算执行。

## 配置

保留：

- `PARSE_FILE_WORKER_MEMORY_LIMIT_MB`
- `XLSX_PARSE_MAX_ROWS`
- `XLSX_PARSE_MAX_COLUMNS`
- `XLSX_PARSE_MAX_CELLS`
- `XLSX_PARSE_MAX_MERGED_CELLS`

新增：

- `XLSX_PARSE_MAX_UNCOMPRESSED_BYTES`：XLSX ZIP 普通文件 entry 允许的累计真实解压字节数。

所有配置可调整，但必须是 safe integer。行列额外受 XLSX 格式坐标上限约束。

## 错误与兼容策略

- 损坏 ZIP、伪造 entry size、危险路径、无法闭合的 XML tag、无效坐标和超预算均拒绝文件。
- 不要求 `dimension` 存在；缺失时使用实际 cell/merge 范围。
- 合法但 `dimension` 低报的文件拒绝而不是静默截断，避免解析结果与用户文件不一致。
- 没有 worksheet 的 XLSX 拒绝，避免把非 XLSX ZIP 当作空工作簿接受。

## 验证逻辑

- 正常单表、多表、非 A1 起始范围和合并单元格行为保持不变。
- 伪造小 dimension、缺失 dimension、非标准 worksheet 路径均按实际坐标校验。
- 行、列、累计范围、merge 和归档解压预算覆盖等于上限及刚超过上限。
- ZIP 声明 uncompressed size 被伪造时，仍按流中真实字节拒绝。
- worker 环境变量透传和 old-generation 限制继续生效。

## TODO

- [x] 为预检器补充正常、边界、dimension 欺骗、非标准路径和 ZIP 膨胀失败测试。
- [x] 实现有界 XML tag 扫描和 worksheet 坐标预算纯函数。
- [x] 实现 `yauzl` 流式 XLSX 预检并接入 `readXlsxRawText`。
- [x] 移除 `bookFiles` 和对 SheetJS 内部结构的依赖。
- [x] 新增归档解压预算环境变量、worker 透传、中英文文档和测试。
- [x] 清理 `doc-last-modified.json` 的无关时间戳变化。
- [x] 运行局部单测、格式/类型检查和最终全量测试。
