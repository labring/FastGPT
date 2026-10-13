# 文件解析延迟物化与资源控制最终设计

## 1. 设计目标

文件解析链路统一传递轻量 `FileSource`，等待任务只保存来源和任务元数据。任务获得 worker 槽位与初始资源预留后，
主线程才把来源物化为 `Buffer`，再通过 transferable `ArrayBuffer` 交给 worker。

该设计保证：

- 等待队列不持有文件 Buffer 或本地文件路径；
- 可信 S3 文件可以依据 metadata 提前完成静态资源准入；
- 不可信外链延迟到任务开始执行后下载，并在下载过程中执行业务大小与单任务内存硬限制；
- 运行任务按实际输入单调更新资源预留，避免调度器始终把未知外链视为只占固定基础内存；
- 知识库、Chat 和 Workflow 共用同一套文件来源、格式识别和外链下载能力；
- worker 不获得 S3 凭证、本地文件权限或任意网络访问能力。

自定义 PDF Provider 不进入 `readFile` worker pool；解析结果的后续文本切块也不纳入本设计的内存调度。

## 2. 文件格式与解析器路由

原有解析器继续处理以下格式，保持既有 PDF、表格和 DOCX 图片行为：

```text
.txt .md .html .pdf .docx .pptx .xlsx .csv
```

AnyDoc 只补充以下格式：

```text
.doc .wps .docm .ppt .pps .pot .pptm .ppsx .ppsm
.xls .xlsm .xlsb .odt .ods .odp .rtf .epub
```

最终规则如下：

- 全局常量分别维护原解析器格式、AnyDoc 格式及两者合集；上传白名单、文件选择器、MIME 推断和 worker 路由复用同一来源。
- `.markdown` 归一化为 `.md`，`.htm` 归一化为 `.html`。
- 原有格式始终进入原解析器，只有补充格式进入 AnyDoc。
- `.wps` 默认按二进制 DOC 处理；如果内容是包含 `word/document.xml` 的 OOXML ZIP，则按 DOCX 处理。
- 显式不支持的扩展名直接报错。没有文件名、可映射 MIME 或文本特征的二进制内容不猜测格式。
- 旧 Office OLE/CFB、宏格式、幻灯片格式和二进制表格格式按对应 Office 格式族执行上传内容校验。

## 3. FileSource 模型

生产解析来源只包含可信 S3 和不可信 External HTTP：

```ts
type FileSourceMetadata = {
  filename?: string;
  contentType?: string;
  extension?: string;
  encoding?: string;
};

type S3FileSource = {
  kind: 's3';
  sizeBytes: number;
  metadata: FileSourceMetadata;
  materialize: (options: MaterializeOptions) => Promise<MaterializedFile>;
};

type ExternalHttpFileSource = {
  kind: 'externalHttp';
  maxSizeBytes: number;
  metadata: FileSourceMetadata;
  materialize: (options: MaterializeOptions) => Promise<MaterializedFile>;
};
```

两类大小字段语义不同：

- `S3FileSource.sizeBytes` 是 HEAD Object 返回的可信 `Content-Length`，用于计算初始完整资源预算。
- `ExternalHttpFileSource.maxSizeBytes` 是业务允许的单文件上限，不是文件实际大小，也不参与初始内存估算。

Buffer source 只用于单元测试和兼容边界，生产上游不得用它排队。`FileSource` 每次物化都重新打开来源，不能缓存已经
transfer 的 Buffer。

## 4. 业务文件大小上限

不可信外链的 `maxSizeBytes` 在已完成团队鉴权的业务入口计算：

```text
effectiveMaxFileSizeMB =
  planStatus.standard?.maxUploadFileSize
  ?? global.feConfigs.uploadFileMaxSize

maxSizeBytes = max(0, effectiveMaxFileSizeMB) * 1024 * 1024
```

团队套餐值存在时覆盖系统 `UPLOAD_FILE_MAX_SIZE`，否则使用系统值。底层 source 和下载器只接收字节值，不再查询套餐。

可信 S3 对象已经在上传阶段完成业务文件大小与格式校验，因此解析阶段不重复检查业务上传上限。本设计不考虑 HEAD 与 GET
之间 S3 key 被替换的情况。

## 5. 资源模型

### 5.1 Worker 数量

`readFile` worker 的线程硬上限为：

```text
maxWorkers = max(1, availableParallelism())
```

`availableParallelism()` 已反映容器 CPU 配额。实际并发还要同时满足内存调度条件，因此不再使用固定 worker 数量配置。

### 5.2 内存估算

解析内存采用 `base + fileSize * multiplier`：

| 格式 | 估算规则 |
| --- | --- |
| `.txt/.md/.csv` | `32 MiB + size * 1.5` |
| `.html` | `32 MiB + size * 2` |
| `.doc/.wps/.docm/.rtf/.odt` | `64 MiB + size * 5` |
| `.docx/.ppt/.pps/.pot/.pptx/.pptm/.ppsx/.ppsm/.odp/.epub` | `64 MiB + size * 4` |
| `.xls/.xlsx/.xlsm/.xlsb/.ods` | `128 MiB + size * 6` |
| `.pdf` | `128 MiB + size * 4` |
| 未识别类型 | `64 MiB + size * 4` |

物化峰值按以下方式估算：

```text
materializeBytes = parserBaseBytes + fileSize * 2
```

`size * 2` 覆盖 stream chunks 与 `Buffer.concat()` 结果短时共存。未知外链没有可用格式时，初始基础内存使用所有解析器中
最大的 base，即 `128 MiB`。

### 5.3 系统安全边界

```text
safetyReserveBytes = min(1 GiB, max(256 MiB, constrainedMemoryBytes * 25%))
maximumSafeTaskMemoryBytes = constrainedMemoryBytes - safetyReserveBytes
currentlySchedulableMemoryBytes = availableMemoryBytes - safetyReserveBytes
```

- `maximumSafeTaskMemoryBytes` 是单任务永久硬上限。
- `currentlySchedulableMemoryBytes` 只决定等待任务当前能否启动。
- 调度时还要扣除所有运行任务已经登记的 `reservedResourceBytes`。
- 如果 Node.js 没有返回有效容器内存约束，则以系统总内存作为约束值。

## 6. 调度流程

任务状态为：

```text
submitted → queued → reserved → materializing → running → finished
```

调度器从等待队列中选择最早且当前能够同时满足 worker 与内存条件的任务，避免一个大任务阻塞所有小任务。任务一旦开始
物化就属于运行任务，不会携带部分下载内容退回等待队列。

### 6.1 可信 S3

入队时使用可信大小计算：

```text
parseBytes = estimateFileParseMemoryBytes(extension, sizeBytes)
materializeBytes = parserBaseBytes + sizeBytes * 2
taskResourceBytes = max(parseBytes, materializeBytes)
```

处理规则：

1. `taskResourceBytes` 超过单任务永久硬上限时立即拒绝。
2. 永久上限允许、但 worker 或当前可调度内存不足时进入等待队列。
3. 获得执行资格后一次性原子预留完整 `taskResourceBytes`，再下载 S3 对象。
4. 物化和解析阶段不重复检查业务文件大小，也不因当前空闲内存变化而中止。
5. 成功、失败、超时或 worker 异常时释放完整预留。

### 6.2 不可信 External HTTP

入队时只按已知格式的 parser base 估算；格式未知时使用 `128 MiB`。获得 worker 和初始 base 预留后才发起下载。

每个 chunk 在加入 chunks 前依次检查：

```text
nextDownloadedBytes <= source.maxSizeBytes
parserBaseBytes + nextDownloadedBytes * 2 <= maximumSafeTaskMemoryBytes
```

第一个条件是业务单文件大小硬限制，第二个条件是单任务永久内存硬限制。二者任一失败都立即销毁下载流并清理任务。

硬检查通过后，将当前任务与池级软预留单调更新到新的物化估算。软预留增长只减少后续任务的可调度容量；即使池的剩余
容量变为 0，已经启动的任务仍继续下载，不会因为其他任务刚好占用内存而失败。

下载完成后根据最终确认的格式和实际大小计算：

```text
finalTaskResourceBytes = max(currentReservation, finalParseBytes)
```

最终预算只与单任务永久硬上限比较。未超限时继续增加软预留并解析，即使此时动态空闲内存不足也不中止当前任务。

`Content-Length` 只可用于提前拒绝超过业务 `maxSizeBytes` 的响应，不能作为可信实际大小参与初始内存估算；实际流始终执行
逐 chunk 大小检查。

### 6.3 两类来源对照

| 阶段 | 可信 S3 | 不可信 External HTTP |
| --- | --- | --- |
| 等待队列内容 | S3 key、metadata、可信 size | URL 能力、metadata、业务 max size |
| 入队预算 | 完整物化/解析峰值 | parser base |
| 启动条件 | worker 和当前容量容纳完整预算 | worker 和当前容量容纳 base |
| 业务大小检查 | 上传阶段已完成 | 响应头可提前拒绝，实际流持续检查 |
| 永久内存检查 | 入队时检查完整预算 | 入队、下载和最终格式确认后分阶段检查 |
| 运行期资源 | 一次性完整预留 | 随下载量和最终格式单调增长 |
| 动态空闲内存不足 | 启动前排队，启动后继续 | 启动前排队，启动后继续并阻止更多任务启动 |

## 7. 等待队列与 Worker 生命周期

- 等待队列不持有 Buffer，因此不设置任务数量上限，也不设置等待任务估算资源总量上限；本设计把队列容量视为无限。
- 每个等待任务最多排队 30 分钟。排队时间不计入 10 分钟执行超时。
- 文件下载和物化属于执行阶段，计入 10 分钟执行超时。
- Worker 按需创建并优先复用；最多保留 1 个空闲 warm worker，其余空闲 worker 在 60 秒后回收。
- 单个 worker 完成 100 个任务后回收，降低第三方解析库缓存或泄漏的长期影响。
- `readFile` worker 不设置固定 V8 old-space 上限，进程总内存由资源准入和容器限制共同约束。

无限队列仍会持有 Promise、闭包、授权上下文和定时器，这部分无界积压风险不属于本设计的内存控制范围。未知外链只以 base
参与初始调度，因此在内存紧张时可能比已知大 S3 文件更早运行；多个未知任务同时增长也可能消耗 25% 安全预留。本方案接受
该调度偏置和有限 OOM 风险，以避免因瞬时动态空闲内存不足误杀已经开始下载的合法大文件。

## 8. 主线程与 Worker 协议

worker 不直接接收 `FileSource`。任务获得槽位和初始资源后，通过任务专属 handler 请求主线程物化：

```text
worker → main: loadFile(requestId)
main   → FileSource.materialize(signal, onReadBytes)
main   → worker: loadFileResult(requestId, ArrayBuffer, metadata)
worker → parser
```

主线程优先 transfer Buffer 独占的底层 `ArrayBuffer`；如果 Buffer 只是共享底层存储的切片，则创建精确副本。

每个运行任务拥有独立 `AbortController`。执行超时、worker error/messageerror/提前退出、协议错误、来源读取失败和硬限制失败
都会先 abort 未完成物化，再回收 worker、释放最终资源预留并拒绝任务。task id 或 request id 不匹配按线程协议错误处理。

## 9. 外链与业务调用链统一

`readExternalFileBuffer()` 是唯一的外部文件物化实现，统一负责：

- 绝对 HTTP(S) 校验；
- SSRF-safe 请求、重定向和 DNS 安全策略；
- 下载超时与 `AbortSignal`；
- 响应头和实际流的业务大小检查；
- 在保存 chunk 前同步上报累计字节数；
- 返回 `Content-Type` 与 `Content-Disposition`。

知识库保留总体 deadline、解析 retry、图片 prefix 和业务错误文案，但不再复制下载逻辑。Chat、Workflow 和 Dataset 解析都先
取得 `FileSource`，再把 source 传入统一解析入口。Workflow 沙箱等非解析消费者在实际需要 Buffer 时显式调用
`materializeFileSource()`，不进入解析 worker 调度。

内部 FastGPT 文件短链优先在主线程完成授权并还原为 S3 source，避免排队期间短链过期。外链每次 retry 都重新下载，不缓存
或复用已 transfer 的 Buffer。

## 10. Multipart 文件生命周期

Dataset 的 `localFile`、`template` 和 `backup` 在鉴权、限额和扩展名校验后直接上传最终 Dataset S3 key，不创建额外临时 key，
也不复制对象：

1. 先登记现有 3 小时保护 TTL，再上传最终对象。
2. 上传完成后立即清理 multer 本地文件。
3. `template` 和 `backup` 使用该 S3 source 完成解析与 CSV/XLSX 结构校验；`localFile` 直接创建 Collection。
4. Collection 创建成功后，在现有事务中移除 TTL，使对象转为持久文件。
5. 解析、校验或 Collection 创建失败时主动删除未提升对象；确认对象删除后再移除 TTL。
6. 主动删除失败或进程崩溃时保留 TTL，由后台清理兜底。

应用评测 CSV 只需要临时解析，因此先上传带 TTL 的临时 S3 对象，释放 multipart 本地文件后提交解析；解析终态主动删除，
进程中断仍由 TTL 回收。

## 11. AnyDoc 图片处理

AnyDoc 使用 `embeddedImageMode: 'reference'` 返回 Markdown 中的 `asset:<id>` 和对应图片资产。FastGPT 通过现有 worker
`uploadFile` 桥接上传资产，并用对象存储 key 替换所有临时引用：

- 单张图片最大 10 MiB；
- 单个文档图片累计最大 200 MiB；
- 最多并发上传 5 张；
- 只接受 `image/*`；
- 任一资产缺失或上传失败时整次解析失败，不返回包含临时引用的半成品；
- N-API 返回的 external Buffer 在上传槽位开始执行时复制为可 transfer 的独占 `ArrayBuffer`，随后立即释放原引用。

图片能力的准确边界是“处理 AnyDoc 实际返回的内嵌图片资产”，不是保证所有格式中的所有图片都可提取。当前 AnyDoc 版本不会
返回 XLS/XLSX Drawing 层的浮动图片，因此这类表格图片不会进入上传流程；原有 XLSX 解析器也继续只解析单元格数据。

AnyDoc 是 N-API 依赖。App 和 Admin 的 worker 构建必须同时复制 JS 包与当前平台 optional dependency 原生二进制，并在
Docker 构建阶段执行加载检查。`jschardet@3.1.1` 需要作为 external 依赖复制，不能被 esbuild 合入严格模式 worker。

## 12. XLSX 安全限制

XLSX 继续执行行数、列数、单元格数、合并单元格数和 ZIP 展开量预检。`maxUncompressedBytes` 不再来自固定 worker 内存配置，
而是直接使用同一输入的 XLSX 解析内存估算：

```text
maxUncompressedBytes = 128 MiB + fileSize * 6
```

该限制保留 ZIP 炸弹防护，同时避免已经通过动态资源准入的任务再次被固定 worker 内存额度误杀。其他压缩文档的实际展开量
与输入大小不一致问题不在本设计范围内。

## 13. 配置变更

以下环境变量已移除，升级时应从 `.env` 或 Docker Compose `environment` 中删除，不需要替代配置：

```text
PARSE_FILE_WORKERS
PARSE_FILE_WORKER_MEMORY_LIMIT_MB
HTML_TO_MARKDOWN_WORKERS
TEXT_TO_CHUNKS_WORKERS
```

文件解析执行超时仍由 `PARSE_FILE_TIMEOUT_SECONDS` 配置。历史版本部署示例和历史升级文档不回写。

## 14. 错误与可观测性

| 场景 | 结果 |
| --- | --- |
| S3 完整预算永久超限 | 入队时立即返回资源超限 |
| worker 或当前内存暂时不足 | 进入等待队列 |
| 等待超过 30 分钟 | 返回资源繁忙/排队超时 |
| 外链实际字节超过 `maxSizeBytes` | 终止下载并返回文件过大 |
| 外链物化或最终解析预算永久超限 | 终止任务并返回资源超限 |
| 外链软预留增长后剩余容量为 0 | 当前任务继续，停止启动更多任务 |
| 物化或解析超过执行超时 | abort 来源、终止 worker、释放资源 |
| 格式无法识别或不受支持 | 返回明确格式错误 |

日志以 `taskId` 串联 submitted、queued、started、materializing 和 finished，记录来源类型、声明/实际字节、初始/最终预留、
队列长度、最老等待时间、运行/空闲 worker、池级预留和内存快照。资源预留更新只在有意义的阈值变化时采样，不能逐 chunk
刷日志。错误信息不得包含 S3 凭证、签名 URL query 或响应正文。

## 15. 最终约束

1. 生产 `readFile` 等待任务不得持有 Buffer 或本地路径。
2. S3 与外链都只能在任务获得 worker 和初始资源预留后物化。
3. S3 使用可信 metadata 计算完整预算，解析阶段不重复校验业务上传大小。
4. 外链同时受业务 `maxSizeBytes` 和单任务永久内存两个硬限制，并随实际下载量单调更新软预留。
5. 运行中的外链不因动态空闲内存不足而中止；软预留增长只影响后续任务。
6. 等待队列不设置任务数量或估算资源总量上限，只保留排队超时。
7. 所有终态都必须 abort 未完成来源读取并释放最终资源预留。
8. 知识库、Chat、Workflow 和 Dataset 共用文件来源、格式识别及外链下载实现。
9. Multipart 生产入口不得把本地路径交给解析队列，失败对象必须主动清理并保留 TTL 兜底。
10. AnyDoc 只补充既定格式，且只处理 SDK 实际返回的内嵌图片资产。
