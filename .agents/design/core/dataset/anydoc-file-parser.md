# Anydoc 补充文件解析设计

## 目标与边界

FastGPT 原有 `.txt/.md/.html/.pdf/.docx/.pptx/.xlsx/.csv` 继续使用现有解析器，保持 PDF、表格、
DOCX 图片上传等行为不变。`@firecrawl/anydoc` 只补充以下格式：

`.doc/.wps/.docm/.ppt/.pps/.pot/.pptm/.ppsx/.ppsm/.xls/.xlsm/.xlsb/.odt/.ods/.odp/.rtf/.epub`

上传白名单必须与后端可解析格式一致；未知扩展名继续拒绝。anydoc 输出的 GitHub-Flavored Markdown
写入 `ReadFileResponse.rawText`。依赖本身暂不输出嵌入图片链接，因此新增格式的图片只保留 alt 文本。

## 实现设计

- 全局常量分别维护原解析器格式、anydoc 格式及两者合集，由 `documentFileType` 和前端默认文件选择共同复用。
- `readFile` worker 保留所有原有显式分支；仅在默认分支命中 anydoc 白名单时调用新增适配器。
- 适配器用 `formatFromExtension` 归一化 `.xls/.docm` 等别名，再调用 `toMarkdownBytes`；`.wps` 在 anydoc 内置别名可用前默认映射到现有 `doc` 解析器。WPS 桌面端可能以 `.wps` 文件名写入 OOXML，因此检测到 ZIP 与 `word/document.xml` 时改用 `docx` 解析器。
- anydoc 是 N-API 包。FastGPT App 和 Admin 都会构建共享 worker，两份构建脚本均需复制 JS 包和
  当前平台实际安装的 optional dependency 原生二进制；Docker 构建阶段执行 `require`，
  提前发现 musl 二进制遗漏。
- S3 上传校验把旧 Office 的 OLE/CFB MIME 视为同族，并把 OOXML 宏、幻灯片与二进制变体映射到
  对应基础格式族。旧 Office 和 OOXML 变体使用 64 KiB 检查窗口，避免容器标记超出默认 8 KiB。

## 验证逻辑

- 单元测试证明原有与补充格式无交集，前后端格式集合一致。
- 适配器测试覆盖格式路由、别名映射、非白名单拒绝及依赖错误透传。
- 上传测试覆盖旧 Office CFB、OOXML 变体和扩展检查窗口。
- 真实 worker spawn 集成测试逐一解析 17 种新格式，同时保留原格式回归用例。
- 上传校验测试使用同一批真实文件内容，逐一验证 17 种扩展名能通过知识库上传策略。
- 可选的本地开发服务 E2E 通过预签名接口、上传代理、MinIO 下载和预览分块接口，
  对每种格式校验最终解析文本。命中每分钟上传限额时等待一个窗口后继续，不绕过业务限流。
- worker 构建验证当前平台原生包被复制；Docker 验证 Alpine/musl 加载。

## 文件解析资源调度

### 目标与边界

文件解析不再通过人工配置固定 worker 数量。单实例根据 Node.js 可见的 CPU 并行度计算线程硬上限：
`max(1, availableParallelism())`。`availableParallelism()` 已考虑容器 CPU 配额，不再叠加固定 worker 上限；
实际任务是否放行主要由容器剩余内存和文件解析内存估算共同决定。

CPU 与内存探测统一由 `packages/service/common/system/resource.ts` 提供，文件解析和 token worker 不再直接
读取 Node.js 系统 API。App 启动时输出一次相同的资源快照，便于确认容器 CPU/内存约束是否被正确识别。

本轮只约束 `readFile` worker 的解析阶段。XLSX 在解析前以任务预估内存作为解压总量上限；其他压缩文档
实际展开量与输入大小不一致的问题暂不处理，也暂不把内存预留延伸到解析结果的后续文本切块阶段。

### 内存估算

任务根据扩展名和输入 Buffer 大小估算解析内存：

- `.txt/.md/.csv`：`32 MiB + size * 1.5`
- `.html`：`32 MiB + size * 2`
- `.doc/.wps/.docm/.rtf/.odt`：`64 MiB + size * 5`
- `.docx/.ppt/.pps/.pot/.pptx/.pptm/.ppsx/.ppsm/.odp/.epub`：`64 MiB + size * 4`
- `.xls/.xlsx/.xlsm/.xlsb/.ods`：`128 MiB + size * 6`
- `.pdf`：`128 MiB + size * 4`
- 未识别类型按 `64 MiB + size * 4` 保守估算。

容器安全保留内存为 `min(1 GiB, max(256 MiB, constrainedMemory * 25%))`。当 Node.js 没有返回有效的
容器约束时，使用系统总内存计算安全值。单任务预估超过“容器约束 - 安全保留”时立即拒绝；其余任务只有在
CPU 槽位和“当前可用内存 - 安全保留 - 已预留内存”都足够时才能执行。

### 队列与 worker 生命周期

- 任务放行时先原子增加预留内存，结束、失败、超时或 worker 崩溃时统一释放。
- 资源暂时不足时排队，最长等待 30 分钟；排队时间不计入原有 10 分钟执行超时。
- 等待任务会持有完整输入 Buffer，因此排队任务的预估资源总量不得超过单任务安全预算；超过时立即 warn 并拒绝，避免队列自身导致主进程 OOM。
- 队列选择最早且当前能够容纳的任务，避免大任务阻塞所有小任务。
- Worker 按需创建并优先复用；最多保留 1 个空闲 warm worker，其余 worker 空闲 60 秒后回收。
- Worker 提前退出、返回未知消息类型或错误 task id 时立即按线程协议错误回收，不等待执行超时兜底。
- 原有单 worker 100 个任务回收和执行超时继续生效。`readFile` worker 不设置固定 V8 老生代上限，避免
  已通过动态内存准入的大任务仍被固定额度终止；进程总内存由容器约束兜底。
- `PARSE_FILE_WORKERS` 从服务端配置和当前版本环境变量文档移除；部署 YAML 按仓库约束保持不变，历史升级文档保留。

### 错误约定与可观测性

- 永远无法满足安全上限的任务立即返回明确的资源不足错误，并提示拆分文件或增加服务内存。
- 排队任务预估资源总量超过队列安全预算时立即返回资源繁忙错误。
- 排队超过 30 分钟返回解析资源繁忙错误。
- 所有日志使用稳定的 `eventName`。每个任务以 `taskId` 串联 submitted/queued/started/finished debug；
  worker 返回失败、线程异常、消息异常、协议异常、派发失败、执行超时和排队超时使用 error；单任务超过
  安全上限、队列资源拒绝和队列首次达到压力阈值使用 warn；队列开始、恢复、排空和 pool 初始化使用 info。
- 队列压力 warn 只在跨越阈值时产生一次，降到阈值以下后才允许再次告警，防止内存轮询刷屏。阈值默认等于
  pool 最大线程数，可按 pool 覆盖。
- 任务和队列日志携带统一快照：队列长度/最老任务等待时间/排队预估资源总量、运行/空闲/最大 worker 数、worker 利用率、
  任务预估内存、pool 已预留内存、调度前可用内存、扣除预留后的可用量，以及容器内存限制、系统可用内存、
  已用比例、安全保留量和可调度量。

#### 日志采集与建议告警

- 本轮不新增 OTel Meter。日志采集器按稳定的 `eventName` 聚合，按 `workerName/taskType/outcome/reason`
  建立低基数索引；`taskId/workerId` 仅用于单任务定位，不作为聚合维度。
- 建议立即告警：`worker.task.queue_timeout`、`worker.task.execution_timeout`、`worker.thread.error`、
  `worker.thread.message_error`、`worker.thread.protocol_error`、`worker.task.dispatch_error`、
  `worker.task.queue_rejected` 在 5 分钟窗口内大于 0。
- 建议趋势告警：从 `worker.task.finished` 计算失败率与执行耗时，从 `worker.task.started` 计算排队耗时；
  通过 `worker.queue.pressure/drained` 观察压力周期，并从日志快照聚合 worker 利用率、队列长度和内存使用率。

## 文件来源延迟物化

### 问题与目标

当前 `readFile` 调度入口接收完整 `Buffer`。当 CPU 或内存不足时，任务虽然尚未开始解析，上游已经把 S3、
本地文件或外部 URL 完整读入主进程；等待队列因此长期持有文件内容，并用“解析峰值估算”近似限制队列输入
内存。该模型混淆了两个不同资源：等待任务实际持有的输入内存，以及运行任务预计需要的解析内存。

目标是让解析链路统一传递 `FileSource`，调度前只保留文件来源；S3 额外保留可信 `sizeBytes`，外链保留业务
`maxSizeBytes`。任务获得 worker 与初始内存预留后，才在主线程物化为 `Buffer` 并 transfer 给 worker。S3 凭证、
本地路径访问和外部 URL 安全策略仍留在主线程，
不得把任意读取能力下放给 worker。解析器内部继续接收 `Buffer`，本轮不改写第三方解析库的数据接口。

完整类型、资源状态机、错误语义、测试和验收标准统一以
[文件解析 FileSource 延迟物化技术方案](./file-source-delayed-materialization.md) 为准；本节只保留 AnyDoc 主方案中的范围摘要。

### 当前生产调用链

1. 知识库 S3 文件：`readDatasetSourceRawText(fileLocal)` → `S3DatasetSource.getDatasetFileRawText()` →
   `downloadObject()` / `streamConsumer.buffer()` → `readFileContentByBuffer()` →
   `readRawContentFromBuffer()` → `readFile` worker。
2. 知识库外部/API 文件：`readDatasetSourceRawText(externalFile/apiFile)` → `readFileRawTextByUrl()` →
   HTTP stream / `Buffer.concat()` → `readFileContentByBuffer()` → worker。调用入口包含知识库解析队列、文件预览、
   API 数据集同步和自定义 API 数据集同步。
3. 知识库模板/备份导入：create template/backup API → multer 本地临时文件 →
   `readRawTextByLocalFile()` → `fs.promises.readFile()` → `readFileContentByBuffer()` → worker。
   这是当前唯一把本地路径送入生产解析链路的入口；普通 localFile Collection 已先上传 S3。
4. Chat/Workflow 文档上下文：AI Chat、`read_files` 节点和动态工具 → `getFileContentByUrl()` →
   `getFileInfoFromUrl()` → `FileReadContext.read()` 或 `readExternalFileBuffer()` →
   `readFileContentByBuffer()` → worker。内部文件由私有 S3 下载，外链由 SSRF-safe reader 下载。
5. Workflow 非解析消费者：沙箱文件准备和工具调用也复用 `FileReadContext.read()` /
   `readWorkflowFileBuffer()` 获取 `Buffer`。它们不是 `readFile` 上游，但会受 `FileReadContext` 类型调整影响；
   应显式调用统一物化方法，而不是继续要求 Context 直接返回 `Buffer`。

`readRawContentFromBuffer()` 没有其它生产调用方；其余直接调用均为 worker 单元或真实格式集成测试。

### 类型与职责设计

`FileSource` 是主进程内的能力对象，不作为 worker message 直接发送。生产解析来源只包含 S3 和外部 HTTP，
二者使用判别联合而不是共享同一个大小字段：

- S3 source：上传链路已经完成业务大小与格式校验；创建 source 时以 S3 HEAD Object 的 `contentLength` 作为可信
  `sizeBytes`，入队时计算并在启动前预留完整物化/解析峰值。它不携带 `maxSizeBytes`，解析阶段不重复校验上传大小。
- External HTTP source：只携带在已鉴权业务边界按“团队套餐值，否则系统值”计算的字节级 `maxSizeBytes`。入队时
  不依赖 Content-Length，只按解析器 base 参与初始调度；下载期间持续检查业务大小和单任务永久内存两个硬上限，
  并按实际字节单调增加软预留。软预留增长只压缩后续任务的可调度容量，不因当前空闲内存不足终止已启动任务。
- Buffer source：仅作为解析单元测试和兼容边界使用，生产上游不得用它排队。

`readFileContentBySource()` 负责解析策略选择。系统解析不提前物化，而是把 source 的初始预算交给调度器；worker 获得
槽位且初始内存已预留后，通过当前任务专属的主线程 handler 请求物化，主线程把独占 `ArrayBuffer` transfer
给 worker。自定义 PDF 服务没有 worker 队列，只能在真正调用外部解析服务前物化。

`FileReadContext.read()` 改为语义明确的 `getSource()`，返回文件元数据和 `FileSource`。聊天文档解析把 source 继续传给
`readFileContentBySource()`；Workflow 沙箱和工具上传通过 `materializeFileSource()` 显式取得 Buffer。这样 Context
不再以某一个消费者的数据形态作为公共接口。

### 外部 URL 读取复用

知识库 `readFileRawTextByUrl()` 当前自行实现 HEAD、GET、stream chunk、大小检查和超时，而 Chat/Workflow 已经
复用 `readExternalFileBuffer()`，两条链路存在重复。改造后不再保留知识库专用下载实现：

- `readExternalFileBuffer()` 继续作为唯一的外部文件物化实现，补充 `AbortSignal`、下载超时和同步
  `onReadBytes` 回调；它仍负责绝对 HTTP(S) 校验、SSRF-safe Axios、响应头大小检查和流式大小检查。
- External HTTP `FileSource.materialize()` 在任务获得资源后调用 `readExternalFileBuffer()`，通过
  `onReadBytes` 检查单任务永久内存并更新该任务软预留；更新不检查当前动态可用内存。
- Workflow 沙箱等立即需要 Buffer 的消费者也继续调用同一个方法，但不提供动态解析内存回调。
- 知识库原有总体 deadline、解析 retry、图片 prefix 和错误文案属于业务编排，保留在
  `readFileRawTextByUrl()` 上层，不再复制下载细节。

### 文件格式来源统一

`FileReadContext.read()` 本身只负责授权和读取，不直接限制扩展名；当前显式带新后缀的文件会被
`resolveReadFileExtension()` 原样透传给 worker，因此 AnyDoc 新格式通常能够解析。但
`fileContext.ts` 内的 `readableFileExtensions` 仍只列出旧 8 种格式，它参与别名和 MIME 推断，导致无文件名、
仅依赖 Content-Type 的新格式不能稳定识别，也形成第二份过期格式清单。

改造时删除该本地集合，统一从 `documentFileExtensions` 构造标准化集合；显式后缀、Content-Disposition 文件名、
Content-Type 推断和 worker 白名单都复用同一份格式来源。`FileReadContext` 返回的 `FileSource` 必须保留 Ref 文件名
和下载后的响应元数据，最终扩展名在物化完成后统一解析，避免 Context 层和解析层分别维护格式列表。

### Multipart 本地文件转最终 S3

生产代码中只有 Dataset template/backup 两个 API 会把 multer 磁盘路径交给解析器。localFile、template、backup
成功后都需要把同一份原文件保存为 Collection 的最终 `fileId`，因此不创建额外 temp key，也不做对象复制。
`template`、`backup` 对齐现有 `localFile` 流程：三个 API 都在完成鉴权、限额和扩展名校验后立即上传最终 Dataset key，并沿用现有 3 小时保护 TTL；上传完成后即可清理 multer 本地文件，
后续 `parseDatasetImportFile()` 只接收 S3 `FileSource`，不再接收 `filePath`。`readRawTextByLocalFile()` 删除生产调用。

最终 Dataset 对象在 Collection 创建成功前仍视为“待确认对象”，生命周期如下：

1. 复用现有 `S3DatasetSource.upload()`，先登记 3 小时保护 TTL，再直接上传 `dataset/{datasetId}/file/{opaqueId}.{ext}`。
2. 以该最终 key 构造 S3 `FileSource` 并等待解析；队列只保存 key 和 metadata。
3. template/backup 完成解析和 CSV/XLSX 结构校验；localFile 直接进入 Collection 创建流程。
4. 创建 Collection 成功时沿用 `createOneCollection()` 的现有事务逻辑移除该 key TTL，使其转为持久对象。
5. 解析、校验或 Collection 创建失败时，API 主动删除尚未提升的对象；对象删除成功后再移除 TTL 记录。
6. 若进程崩溃或主动删除失败，保留 TTL，让清理任务回收孤儿对象。

三个 API 统一复用现有 `S3DatasetSource.upload()` 上传待确认 Dataset 对象，并共用“清理未提升对象”方法，避免失败处理继续分叉。

TTL 的 3 小时表示对象在 3 小时后具备清理资格；当前清理 cron 每小时扫描一次，因此进程崩溃后的物理删除
最迟可能接近 4 小时。正常请求结束会主动删除，不依赖 cron 时延。

### 调度与校验

- S3 按可信 `sizeBytes` 和格式计算 `max(parseBytes, materializeBytes)`；超过单任务永久上限时静态拒绝，否则等待
  worker 和当前容量满足后一次性预留完整预算。任务启动后不再检查业务大小或当前空闲内存。
- 外链入队只声明解析器 base；无后缀时使用最重解析器 base。获得 worker 和 base 后才下载，每个 chunk 在进入
  chunks 前检查 `downloadedBytes <= maxSizeBytes` 与 `materializeBytes <= maximumSafeTaskMemoryBytes`。
- 外链通过硬检查后原子增加任务及池级软预留。即使池剩余容量归零，当前任务仍继续；后续任务停止启动。
- 外链下载完成后根据最终格式和实际大小计算解析预算，只在超过单任务永久上限时拒绝；未超过时更新最终软预留
  并继续解析，不再检查当前空闲内存。
- 等待队列不再持有输入 Buffer，也不设置解析资源总量或任务数量上限；本轮容量按无限处理，只保留 30 分钟排队超时。
- 未知外链因初始只声明 base，更容易越过暂时放不下的 S3 大任务；多个未知任务近同时增长可能透支 25% 安全预留，
  这是当前简化方案明确接受的调度偏置与 OOM 风险。
- 下载/物化时间属于任务执行时间，受同一个执行超时约束。每个运行任务持有独立 `AbortController`；失败、
  超时、worker 退出和协议错误均先终止未完成下载，再统一释放 worker 和资源预留，防止超时后后台继续吃内存。

### 已确认边界

- 外部 HTTP URL 接受排队后才下载的语义；链接过期、远端内容变化或流式检查超限均作为本次解析失败返回，
  不预先落临时对象存储。内部 FastGPT 短链优先还原成已授权 S3 source。
- 自定义 PDF 解析服务不纳入本轮 worker 调度与并发内存限制，后续单独设计。本轮只保证它在真正发起外部解析
  请求时才物化 `FileSource`。

### 逐格式测试矩阵

| 格式 | Fixture 类型 | 真实 worker | 上传校验 | 本地服务 E2E |
| --- | --- | --- | --- | --- |
| `.doc` | OLE/CFB 真实文件 | 通过 | 通过 | 通过 |
| `.wps` | 本机 WPS Office 生成的 OLE/DOC 与 OOXML 兼容文件 | 通过 | 通过 | 未运行 |
| `.docm` | macroEnabled OOXML | 通过 | 通过 | 通过 |
| `.ppt/.pps/.pot` | PowerPoint OLE/CFB 真实文件 | 通过 | 通过 | 通过 |
| `.pptm` | macroEnabled OOXML | 通过 | 通过 | 通过 |
| `.ppsx` | slideshow OOXML | 通过 | 通过 | 通过 |
| `.ppsm` | macroEnabled slideshow OOXML | 通过 | 通过 | 通过 |
| `.xls` | BIFF/OLE 真实文件 | 通过 | 通过 | 通过 |
| `.xlsm` | macroEnabled OOXML | 通过 | 通过 | 通过 |
| `.xlsb` | Excel Binary 真实文件 | 通过 | 通过 | 通过 |
| `.odt` | OpenDocument 真实文件 | 通过 | 通过 | 通过 |
| `.ods` | OpenDocument Spreadsheet | 通过 | 通过 | 通过 |
| `.odp` | OpenDocument Presentation | 通过 | 通过 | 通过 |
| `.rtf` | 合法 RTF 文本 | 通过 | 通过 | 通过 |
| `.epub` | OCF/OPF/XHTML EPUB | 通过 | 通过 | 通过 |

本地 E2E 用例默认跳过，仅在提供
`FASTGPT_ANYDOC_E2E_BASE_URL/FASTGPT_ANYDOC_E2E_API_KEY/FASTGPT_ANYDOC_E2E_DATASET_ID`
时运行，避免常规单测依赖本地服务。

## TODO

- [x] 抽取并扩展文档格式常量。
- [x] 实现 anydoc 解析适配器和 worker 回退路由。
- [x] 同步前端默认上传格式及服务端上传约束。
- [x] 为全部 17 种新格式添加真实 worker 与上传校验测试。
- [x] 通过本地 FastGPT 开发服务完成 16 种格式的真实上传与预览解析 E2E。
- [x] 同步 App/Admin worker 构建脚本，修复 Admin Alpine 镜像对 N-API 二进制的误打包。
- [x] 运行类型检查、相关完整测试和 Docker 验证。
- [x] 隔离本需求改动并创建 PR。
- [x] 实现 CPU 与内存双重准入、30 分钟等待超时和资源释放。
- [x] 实现 readFile worker 空闲回收与 warm worker 保留。
- [x] 移除 `PARSE_FILE_WORKERS` 当前配置并同步中英文环境变量文档；不修改部署 YAML。
- [x] 覆盖内存估算、拒绝、排队、唤醒、并发预留、超时及回收测试。
- [x] 等待队列不持有文件 Buffer、不设置任务数或估算资源总量上限，并覆盖 worker 提前退出与协议异常释放。
- [x] 完成类型检查、相关测试、完整测试和真实大文件并发验证。
- [x] 补充结构化 worker 生命周期日志、队列压力去重、内存快照和基于日志的监控字段。
- [x] 将 S3、External HTTP 和测试 Buffer 输入统一抽象为 `FileSource`，提供统一物化、可信 S3 size 和外链业务上限。
- [x] 将知识库 S3、外部/API 文件、模板/备份最终 S3 和 Chat/Workflow 文档解析链路改为传递 `FileSource`。
- [x] 将 template/backup 的最终 Dataset 对象上传对齐 localFile：沿用现有 3 小时保护 TTL 和成功移除 TTL 逻辑，补充失败主动删除及 TTL 兜底。
- [x] 将 `FileReadContext.read()` 改为返回 `FileSource`，非解析消费者在使用点显式物化。
- [x] 为 readFile worker 增加任务专属 source 读取桥接，在资源预留后才物化并 transfer Buffer。
- [x] 删除排队解析峰值总量限制且不新增任务数量上限，保留排队超时，并调整日志字段与错误语义。
- [x] 覆盖延迟物化时机、外链两个硬限制、软预留增长、下载失败/超时、资源释放、外链未知大小和非解析消费者回归测试。
