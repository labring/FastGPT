# 文件解析 FileSource 延迟物化技术方案

## 1. 背景

当前文件解析入口以完整 `Buffer` 作为任务参数。S3、外部 URL 和 Multipart 本地文件都会先在主进程中完成下载或读取，
然后才调用 `readRawContentFromBuffer()` 进入 `readFile` worker pool。

当 CPU 或内存不足时，任务虽然尚未开始解析，等待队列已经持有完整文件内容。现有实现因此使用“排队任务解析峰值估算总量”
限制队列，但这个值既不是队列实际占用内存，也不是正在执行任务的解析内存，混淆了以下两类资源：

- 等待任务实际保留的主进程内存；
- 运行任务在下载、Buffer 转换和解析阶段需要的内存。

本方案把“文件来源”与“文件内容”分离。上游统一传递轻量 `FileSource`，任务取得 worker 和运行内存预留后才物化
为 `Buffer`，随后通过 transferable `ArrayBuffer` 交给 worker。解析器内部仍使用 `Buffer`，不改写第三方解析库。

## 2. 目标

1. 等待队列不再持有完整文件 Buffer。
2. S3 文件根据可信 metadata 大小完成静态内存准入。
3. 外部 URL 入队时不依赖 HEAD、Content-Length 或文件大小估算；执行时流式检查业务文件大小和单任务永久内存两个硬上限，并持续更新软预留以压缩后续任务的可调度容量。
4. 知识库、Chat 和 Workflow 统一复用外部 URL 安全下载实现。
5. `FileReadContext` 返回 `FileSource`，非解析消费者在实际需要时显式物化。
6. `template`、`backup` API 对齐现有 `localFile` 流程，三个 API 都先上传最终 Dataset S3 对象，解析队列不持有本地路径。
7. 沿用现有 Dataset S3 上传的 3 小时保护 TTL 和 Collection 创建成功后移除 TTL 的逻辑；失败时主动删除，TTL 负责崩溃兜底。
8. 文件格式集合统一复用 `documentFileExtensions`，覆盖 built-in 和 AnyDoc 新格式。

## 3. 非目标

- 自定义 PDF 服务不进入 `readFile` worker pool，本轮不解决其并发和总内存限制。
- 不把 S3 凭证、本地文件系统权限或任意 URL 网络访问权限交给 worker。
- 不改造解析结果的文本切块阶段。
- XLSX 以任务预估内存作为解压总量上限；其他 ZIP/Office/EPUB 实际展开量与输入大小不一致的问题另行设计。
- 不修改部署 `.yml` 或 `.yaml`。

## 4. 当前调用链

### 4.1 知识库 S3 文件

```text
readDatasetSourceRawText(fileLocal)
  → S3DatasetSource.getDatasetFileRawText()
  → downloadObject()
  → streamConsumer.buffer()
  → readFileContentByBuffer()
  → readRawContentFromBuffer()
  → readFile worker
```

### 4.2 知识库外部/API 文件

```text
readDatasetSourceRawText(externalFile/apiFile)
  → readFileRawTextByUrl()
  → HEAD + GET + chunks + Buffer.concat()
  → readFileContentByBuffer()
  → readFile worker
```

入口包含 Dataset 解析队列、文件预览、API 数据集同步和自定义 API 数据集同步。

### 4.3 Dataset Multipart 文件

```text
template/backup API
  → multer 本地临时文件
  → parseDatasetImportFile(filePath)
  → readRawTextByLocalFile()
  → fs.promises.readFile()
  → readFile worker
  → 再上传最终 Dataset S3 对象
```

主仓库生产代码中，`template` 和 `backup` 会把本地路径送入解析器，`localFile` 已经先上传 S3；
Pro 管理端的应用评测 CSV 也会通过 `readRawTextByLocalFile()` 把 multipart 本地文件送入解析器。

### 4.4 Chat/Workflow 文档解析

```text
AI Chat / read_files / 动态工具
  → getFileContentByUrl()
  → FileReadContext.read() 或 readExternalFileBuffer()
  → Buffer
  → readFileContentByBuffer()
  → readFile worker
```

### 4.5 Workflow 非解析消费者

沙箱文件准备和工具调用也复用 `FileReadContext.read()` / `readWorkflowFileBuffer()` 获取 Buffer。它们不是
`readFile` 上游，但会受 Context 类型调整影响。

### 4.6 应用评测 CSV

```text
multipart 临时文件
  → readRawTextByLocalFile()
  → Buffer
  → readFile worker
```

评测只需要临时读取文件，不应把本地路径或 Buffer 留在解析等待队列。迁移后先写入 `temp/<teamId>/...`
临时 S3 对象并创建 TTL，再以可信 S3 source 解析；解析结束主动删除，进程中断由 TTL 兜底。

## 5. 核心设计原则

### 5.1 能力留在主线程

`FileSource` 是主线程能力对象。它可以封装已授权 S3 key 或经过安全策略校验的外部 URL，但不能直接作为 worker message。
worker 只通过当前任务专属协议请求物化结果。

### 5.2 排队与执行资源分离

- 排队阶段只保存 source、任务元数据、Promise 回调和超时器。
- 已知大小来源的解析预算可以在入队时计算，但只用于静态拒绝和执行选择，不代表队列实际内存。
- 未知大小外链只声明固定基础开销；开始下载后按实际字节数单调增加软预留，但当前空闲内存不足不会终止已经启动的任务。
- 等待队列既不预留运行内存，也不设置资源总量或任务数量上限；本轮只保留排队超时。

### 5.3 运行任务不退回等待队列

外链开始物化后属于运行任务，已下载 chunks 始终计入该任务软预留。只有业务文件大小、单任务永久内存、来源读取、取消或超时等硬失败才销毁响应流并丢弃 chunks；运行任务不会拿着部分 Buffer 退回普通等待队列。

### 5.4 硬限制与软预留分离

- 硬限制决定当前任务能否继续：外链业务 `maxSizeBytes` 和单任务永久内存上限。
- 软预留描述运行任务的估算占用：未知外链随下载量增长，即使更新后池剩余容量为 0，当前任务仍继续。
- 当前动态可用内存只决定任务能否从等待队列启动；任务启动后不再因其他任务暂时占用内存而失败。
- 软预留增长会阻止更多任务启动，但不提供操作系统级硬隔离；25% 安全预留用于吸收估算误差，仍接受多个未知任务并发增长带来的有限 OOM 风险。

## 6. 类型设计

建议在 `packages/service/common/file/read/source.ts` 定义：

```ts
type FileSourceMetadata = {
  filename?: string;
  contentType?: string;
  extension?: string;
  encoding?: string;
};

type MaterializedFileSource = {
  buffer: Buffer;
  metadata: FileSourceMetadata;
};

type MaterializeFileSourceOptions = {
  signal: AbortSignal;
  onReadBytes?: (readBytes: number) => void;
};

type FileSourceBase = {
  metadata: FileSourceMetadata;

  // 必须可重复调用；解析 retry 每次重新打开来源，不缓存 Buffer。
  materialize: (
    options: MaterializeFileSourceOptions
  ) => Promise<MaterializedFileSource>;
};

type S3FileSource = FileSourceBase & {
  kind: 's3';
  // S3 HEAD Object 返回的 Content-Length，作为可信输入大小参与静态准入。
  sizeBytes: number;
};

type ExternalHttpFileSource = FileSourceBase & {
  kind: 'externalHttp';
  // 在已鉴权业务边界计算的单文件业务上限，单位统一为字节。
  maxSizeBytes: number;
};

type FileSource = S3FileSource | ExternalHttpFileSource;
```

测试使用单独的 `createBufferFileSource()` helper。生产上游不得用 Buffer source 排队。

### 6.1 S3 FileSource

创建时完成：

1. 上层业务已经完成 key 权限验证。
2. 上层上传链路已经完成文件大小、扩展名和内容类型校验。
3. 查询 S3 HEAD Object metadata，把 `contentLength` 作为可信 `sizeBytes`。
4. 保存 `sizeBytes`、filename、Content-Type 和对象读取闭包。

物化时完成：

1. 使用主线程 S3 client 下载对象。
2. 返回独占 Buffer，调用方不得继续复用。

S3 source 不携带 `maxSizeBytes`，解析阶段不重复执行上传业务大小校验。本方案把内部 S3 key 视为不可替换对象，不处理 HEAD 与 GET 之间对象被覆盖的问题；下载失败仍按普通来源错误处理。

### 6.2 External HTTP FileSource

创建时只保存：

- 经过当前业务授权策略校验的绝对 HTTP(S) URL；
- `maxSizeBytes`；
- URL 或可信 Ref 中已有的 filename/extension。

它不发送 HEAD，不把 Content-Length 用于内存准入，也不在排队前下载。

物化时调用统一的 `readExternalFileBuffer()`，并通过 `onReadBytes` 上报流式进度。

### 6.3 External `maxSizeBytes` 来源

`maxSizeBytes` 是业务限制，不由机器内存、解析 `base` 或格式倍率推导。在完成团队鉴权的入口统一计算一次：

```text
effectiveMaxFileSizeMB =
  planStatus.standard?.maxUploadFileSize
  ?? global.feConfigs.uploadFileMaxSize

maxSizeBytes = max(0, effectiveMaxFileSizeMB) * 1024 * 1024
```

团队套餐配置存在时覆盖系统 `UPLOAD_FILE_MAX_SIZE`，不存在时回退系统值。Workflow、Chat、Dataset 外部/API 文件应统一从已鉴权上下文传递该字节值；底层 source 和下载器不再次查询套餐，也不使用含糊的 MB 参数。应用 `fileSelectConfig.maxFiles` 只限制文件数量，不参与单文件大小计算。

## 7. 统一解析入口

将 `readFileContentByBuffer()` 替换为：

```ts
readFileContentBySource({
  source,
  teamId,
  tmbId,
  extension,
  encoding,
  customPdfParse,
  usageId,
  getFormatText,
  imageKeyOptions,
  onPdfParseUsage
});
```

职责：

1. 归一化初始扩展名。
2. 选择系统解析或自定义 PDF 解析。
3. 系统解析直接把 source 交给 `readFile` 调度，不提前物化。
4. 自定义 PDF 仅在真正调用外部 Provider 前物化；其并发调度不在本方案范围内。
5. 返回解析文本、表格信息和最终确认的文件 metadata。

`readRawContentFromBuffer()` 对生产调用替换为 `readRawContentFromSource()`；Buffer 版本只保留在测试 helper 内。

## 8. Worker 调度状态机

```text
submitted
  → queued
  → reserved
  → materializing
  → running
  → finished
```

终止路径：

```text
queued → queue_timeout
submitted → static_resource_rejected
materializing → source_error / file_size_rejected / hard_resource_rejected
materializing → execution_timeout / worker_error
running → success / parse_error / execution_timeout / worker_error
```

文件解析资源仍使用现有两级内存边界：

```text
maximumSafeTaskMemoryBytes = constrainedMemoryBytes - safetyReserveBytes
currentlySchedulableMemoryBytes = availableMemoryBytes - safetyReserveBytes
```

其中 `safetyReserveBytes = clamp(constrainedMemoryBytes * 25%, 256 MiB, 1 GiB)`。前者是单任务永久硬上限，后者只参与任务启动调度；运行任务的软预留增长不会再次以 `currentlySchedulableMemoryBytes` 为拒绝条件。

### 8.1 已知大小 S3 任务

入队时计算：

```text
parseBytes = estimateFileParseMemoryBytes(extension, sizeBytes)
materializeBytes = parserBaseBytes + sizeBytes * 2
taskResourceBytes = max(parseBytes, materializeBytes)
```

`sizeBytes * 2` 覆盖 stream chunks 和 `Buffer.concat()` 短时同时存在的峰值。任务若永久超过单任务安全上限立即拒绝；
否则只有在 worker 槽位和当前可调度内存都满足时才开始物化。

任务启动时一次性原子增加 `reservedResourceBytes`。从开始下载到 worker 解析结束都保持完整预留，不再检查业务文件大小、当前空闲内存或动态扩容；成功、失败、超时和 worker 异常统一释放该预留。

### 8.2 未知大小外链任务

外链入队时：

```text
taskResourceBytes = parserBaseBytes
```

无后缀时使用当前最重解析器的固定基础开销。获得 worker 后开始下载，每个 chunk 到达时，在加入 chunks 前计算：

```text
nextDownloadedBytes = downloadedBytes + chunkBytes
materializeBytes = parserBaseBytes + nextDownloadedBytes * 2
```

先检查两个硬指标：

```text
nextDownloadedBytes <= source.maxSizeBytes
materializeBytes <= maximumSafeTaskMemoryBytes
```

业务大小超限返回文件过大；物化估算超过单任务永久上限返回资源超限。两个硬指标都满足后，同步调用当前任务资源控制器：

```ts
updateTaskResourceBytes(materializeBytes);
```

该更新是软预留记账，不是动态准入。更新必须在主线程同一同步调用栈中完成：

1. 计算 `delta = materializeBytes - task.resourceBytes`。
2. 将当前任务预留单调更新为 `materializeBytes`。
3. 原子增加池级 `reservedResourceBytes += delta`。
4. 后续调度把 `currentlySchedulableMemoryBytes - reservedResourceBytes` 截断到 0。

即使软更新后池级剩余容量为 0 或预留暂时超过当前动态可用内存，当前下载仍继续；这只会阻止更多任务从等待队列启动。任务不会因其他运行任务暂时占用内存而失败，也不会暂停或退回等待队列。

Content-Length 可以用于提前拒绝超过业务上限的响应，但不能作为任务输入大小估算；无论响应头是否存在或是否可信，仍按实际流字节执行 `maxSizeBytes` 检查。

### 8.3 最终格式与预算复核

下载完成后按以下优先级确认格式：

1. 可信 File Ref filename；
2. `Content-Disposition` filename；
3. URL filename；
4. `Content-Type`；
5. 仅用于文本的内容探测。

确认格式后计算：

```text
finalParseBytes = estimateFileParseMemoryBytes(finalExtension, actualSize)
finalTaskResourceBytes = max(currentReservation, finalParseBytes)
```

这里仍只检查永久硬上限：

```text
finalTaskResourceBytes <= maximumSafeTaskMemoryBytes
```

超过时在进入解析器前拒绝，防止 URL 声称 `.txt`、实际返回 XLSX 等重型格式绕过单任务上限；满足时无条件把软预留单调更新到 `finalTaskResourceBytes`，即使当前动态可用内存不足也继续 transfer 和解析。worker 解析期间保持最终预留，直到任务进入终态。

二进制文件如果没有可信后缀、Content-Disposition 或可映射 MIME，且只返回 `application/octet-stream`，明确拒绝，
不猜测 DOC/XLS/ODT 等格式。

### 8.4 两类来源检查汇总

| 阶段 | 可信 S3 | 不可信 External HTTP |
| --- | --- | --- |
| 入队估算 | 使用可信 size 和格式计算完整物化/解析峰值 | 只使用初始格式 base；无格式时使用最重解析器 base |
| 永久硬上限 | 入队时检查完整任务预算 | 入队检查 base，下载时检查物化预算，下载后检查最终格式预算 |
| 启动条件 | worker 槽位和当前容量都能容纳完整任务预算 | worker 槽位和当前容量都能容纳 base |
| 下载大小限制 | 上传阶段已经完成，解析阶段不重复检查 | Content-Length 可提前拒绝，实际流持续检查 `maxSizeBytes` |
| 运行资源更新 | 启动时一次性完整预留 | 随下载量和最终格式单调更新软预留 |
| 当前容量不足 | 启动前排队；启动后不再检查 | 启动前排队；启动后继续并把后续可调度容量压到 0 |
| 终态 | 释放完整预留 | 释放最终软预留并 abort 未完成流 |

## 9. Worker 主线程桥接

扩展 `WorkerRunHandlers`：

```ts
type WorkerTaskResourceController = {
  // 检查永久硬上限后更新软预留；不检查当前动态可用内存。
  updateResourceBytes: (requiredBytes: number) => void;
};

type WorkerRunHandlers = {
  uploadFile?: ...;
  loadFile?: (
    controller: WorkerTaskResourceController,
    signal: AbortSignal
  ) => Promise<{
    buffer: ArrayBuffer;
    bufferSize: number;
    metadata: FileSourceMetadata;
  }>;
};
```

协议：

```text
worker → main: loadFile(requestId)
main   → source.materialize(signal, onReadBytes)
main   → worker: loadFileResult(requestId, ArrayBuffer, metadata)
worker → parser
```

主线程优先 transfer 独占底层 `ArrayBuffer`；Buffer 不是完整底层 ArrayBuffer 时创建精确副本，物化预算必须覆盖该复制峰值。

每个运行任务创建独立 `AbortController`。以下情况先 abort 物化，再释放 worker 和资源预留：

- 执行超时；
- worker error/messageerror/提前退出；
- 协议错误；
- 主动终止 worker；
- source 读取、业务文件大小或单任务永久内存硬限制失败。

下载和物化计入现有 10 分钟执行超时。排队仍最多 30 分钟，排队时间不计入执行超时。

## 10. 队列模型调整

等待队列不再持有 Buffer，因此删除以下准入含义：

```text
sum(queued parse estimates) <= queue memory limit
```

保留解析估算总量作为观测字段时，必须命名为 `queuedExecutionResourceBytes`，不能称为队列实际内存。

本轮不设置 `maximumQueueLength`，等待队列容量按无限处理；任务只会因永久资源超限被静态拒绝，或因等待超过 30 分钟退出。Promise、闭包、授权 Context 和 timeout 无界积压的风险暂不在本方案处理。

调度仍选择最早且当前能够满足 worker 和内存的任务，避免大任务阻塞小任务。

已知大小 S3 使用完整任务预算参与调度，未知外链只使用 `parserBaseBytes`，因此内存紧张时未知外链更容易跳过较大的 S3 任务并先开始下载。这是当前简化方案接受的调度偏置；软预留增长后会及时压缩后续任务容量，但无法消除多个未知任务近同时启动并共同增长造成的 OOM 风险。

## 11. 外部 URL 读取统一

当前知识库 `readFileRawTextByUrl()` 自行实现 HEAD、GET、chunks、大小和超时；Chat/Workflow 已复用
`readExternalFileBuffer()`。改造后后者成为唯一外部文件物化实现。

扩展参数：

```ts
readExternalFileBuffer({
  url,
  maxSizeBytes,
  timeoutMs,
  signal,
  onReadBytes
});
```

公共职责：

- 绝对 HTTP(S) 校验；
- SSRF-safe Axios 和 redirect/DNS 安全策略；
- Content-Length 超业务单文件上限时提前拒绝，但不用于内存估算；
- 按实际下载字节执行流式 `maxSizeBytes` 检查；
- AbortSignal 和超时；
- 在保存 chunk 前同步调用读取进度回调，由解析任务检查单任务永久内存并更新软预留；
- Content-Type 与 Content-Disposition 返回。

知识库的总体 deadline、解析 retry、Dataset 图片 prefix 和业务错误文案继续保留在 `readFileRawTextByUrl()` 上层，
但不再复制下载实现。每次 retry 重新打开 source，不缓存或复用已 transfer 的 Buffer。

Workflow 沙箱等立即需要 Buffer 的消费者继续直接复用该函数，但不传解析资源回调。

## 12. FileReadContext 改造

`FileReadContext.read()` 当前返回 Buffer。改为语义明确的 `getSource()`：

```ts
type FileReadContext = {
  limits?: { maxBytesPerFile: number };
  resolve: ...;
  resolveChatFile: ...;
  getIdentity: ...;
  getSource: (url: string) => Promise<{
    source: FileSource;
    sourceKind: 'internal' | 'external';
    imageParsePrefix?: string;
  }>;
};
```

- 内部 Chat 对象查询 metadata 后返回 S3 source，不下载。
- FastGPT 已验证短链优先还原为已授权 S3 source，避免排队期间短链过期。
- 任意外链返回 External HTTP source，不下载。
- Derived Workflow Context 继承父级 source 能力，不能通过字符串构造未授权私有 key。

非解析消费者改为：

```text
FileReadContext.getSource()
  → materializeFileSource()
  → Buffer
```

涉及 `readWorkflowFileBuffer()`、沙箱输入文件和工具调用上传。它们不会进入解析 worker，但公共 Context 不再以 Buffer
作为统一数据形态。

当前 `WorkflowFileSource` 是授权定位描述符，为避免与通用 `FileSource` 混淆，改名为 `WorkflowFileLocator`。

## 13. 文件格式集合统一

`FileReadContext` 本身负责授权和来源，不应维护解析器白名单。目前 `fileContext.ts` 的
`readableFileExtensions` 只包含旧 8 种格式。显式 AnyDoc 后缀通常会原样透传，但 MIME-only 场景不能稳定识别。

改造要求：

1. 删除本地 `readableFileExtensions`。
2. 从 `documentFileExtensions` 构造去点、转小写的标准集合。
3. `.markdown → .md`、`.htm → .html` 作为显式 alias 保留。
4. 显式 filename、Content-Disposition、MIME 推断和 worker 白名单复用同一格式来源。
5. 显式不支持的扩展名在解析入口返回清晰错误，不依赖 worker 默认分支偶然拒绝。

## 14. Dataset Multipart API 生命周期

涉及：

- `projects/app/src/pages/api/core/dataset/collection/create/localFile.ts`
- `projects/app/src/pages/api/core/dataset/collection/create/template.ts`
- `projects/app/src/pages/api/core/dataset/collection/create/backup.ts`

三个 API 成功后都需要同一份原文件作为 Collection 最终 `fileId`，因此直接上传最终 Dataset key，不创建 temp key，
也不做 S3 对象复制。

### 14.1 正常流程

```text
multer 接收本地临时文件
  → API 鉴权
  → 文件数量/大小/扩展名校验
  → 调用现有 Dataset S3 upload（先登记 3 小时保护 TTL，再上传最终 Dataset S3 key）
  → 清理 multer 本地文件
  → 以最终 key 构造 S3 FileSource
  → template/backup 解析并校验 CSV/XLSX
  → createCollectionAndInsertData()
  → createOneCollection() 在同一 Mongo 事务内移除 TTL
  → 对象成为持久 Dataset 文件
```

`localFile` 不需要同步解析，上传后直接进入 Collection 创建流程。

### 14.2 失败流程

API 保存 `fileId` 和 `promoted` 状态。只有 `createCollectionAndInsertData()` 成功返回后才能标记 `promoted = true`。

```text
上传后任一步失败且 promoted=false
  → 主动删除 S3 对象
  → 对象删除成功或确认不存在
  → 删除 TTL 记录
```

清理失败不能覆盖原业务错误，并且不得提前删除 TTL；保留 TTL 才能让后台清理继续兜底。

Mongo 事务失败会回滚 `createOneCollection()` 中的 TTL 删除，因此不会把未创建 Collection 的对象误提升为永久对象。

### 14.3 TTL 语义

- 三个 API 统一复用现有 `S3DatasetSource.upload()` 的 3 小时保护 TTL，不新增或覆盖单独的 TTL 时长。
- 正常请求结束主动清理失败对象。
- TTL 表示 3 小时后具备清理资格。
- 当前清理 cron 每小时扫描一次，进程崩溃后的物理删除最迟可能接近 4 小时。
- 排队上限 30 分钟、执行上限 10 分钟，正常解析应在 TTL 窗口内结束。

上传待确认 Dataset 对象统一复用现有 `S3DatasetSource.upload()`；建议抽取统一的“清理未提升对象”方法，避免三个 API 的失败处理分叉。

## 15. 缓存与重试

- RawText S3 缓存仍在构造和物化 source 前查询，缓存命中不进入 worker 队列。
- 缓存 key/sourceId 语义保持不变。
- FileSource 不缓存 Buffer；每次解析 retry 重新下载。
- S3 retry 前重新读取 metadata，以本次 HEAD 返回的可信大小重新计算完整任务预算。
- 外链排队期间过期或内容变化作为本次解析失败，不预先落临时 S3。

## 16. 错误语义

| 场景 | 处理 |
| --- | --- |
| 已知 S3 单任务永久超限 | 入队时立即拒绝 |
| 当前 CPU/内存不足 | 排队 |
| 排队超过 30 分钟 | 返回 queue timeout |
| 外链实际字节超过业务 `maxSizeBytes` | 销毁流并返回文件过大 |
| 外链物化估算超过单任务永久内存上限 | 销毁流并返回任务资源超限 |
| 外链软预留增长后池剩余容量为 0 | 当前任务继续，停止启动更多等待任务 |
| 最终格式预算超过单任务永久内存上限 | 解析前返回任务资源超限 |
| 最终格式预算未超过永久上限、但当前空闲内存不足 | 更新软预留并继续解析 |
| 物化/解析超过 10 分钟 | abort source、终止 worker、释放资源 |
| 不支持或无法识别的格式 | 返回明确格式错误 |

错误中不得包含 S3 凭证、签名 URL query 或响应正文。

## 17. 可观测性

沿用 `taskId`、`workerId`、`workerName`、`taskType`，新增或调整：

- `worker.task.materialize_started`
- `worker.task.materialize_finished`
- `worker.task.resource_reservation_updated`
- `worker.task.hard_resource_rejected`
- `worker.task.source_failed`
- `worker.task.file_size_rejected`

`resource_reservation_updated` 仅在跨越有意义阈值时采样或输出 debug，不能每个 chunk 打日志。日志必须区分“软预留更新”和“永久硬上限拒绝”，不能把池级剩余容量归零记录成当前任务失败。

任务日志增加：

- `sourceKind`
- `sourceDeclaredBytes`
- `sourceActualBytes`
- `sourceMaxSizeBytes`
- `taskInitialResourceBytes`
- `taskFinalResourceBytes`
- `materializeDurationMs`

队列日志保留 queue length、oldest age、running/idle workers 和运行资源预留；删除把 queued estimate 描述成实际队列内存的字段。

## 18. 安全约束

- S3 source 必须由已鉴权业务入口构造，通用 parser 不接受客户端直接传入 bucket/key。
- worker 永远不接收 S3 凭证、URL、文件系统路径或下载回调实现。
- External HTTP source 延续绝对 HTTP(S)、域名策略、内部地址拒绝、redirect 和 DNS 安全检查。
- FastGPT 私有短链在主线程验证并还原成 S3 source。
- FileSource metadata 只能辅助格式选择，不能替代上传内容验证和解析器自身校验。
- 临时保护 TTL 必须先创建，再上传对象；避免上传后进程崩溃形成无 TTL 孤儿对象。

## 19. 代码迁移范围

| 模块 | 调整 |
| --- | --- |
| `packages/service/common/file/read/source.ts` | 新增 FileSource 类型、S3/External/测试 source 和统一物化 |
| `packages/service/common/file/read/external.ts` | 统一字节单位的 maxSizeBytes，增加 signal、timeout、onReadBytes，作为唯一外链物化实现 |
| `packages/service/common/file/read/utils.ts` | `readFileContentByBuffer` 改为 `readFileContentBySource` |
| `packages/service/worker/function.ts` | `readRawContentFromSource`、loadFile handler、可信静态预算和外链软预留计算 |
| `packages/service/worker/utils.ts` | 任务 AbortController、运行任务软预留更新、无限容量等待队列、loadFile 协议 |
| `packages/service/worker/readFile/index.ts` | worker 请求 loadFile、接收 transfer、最终格式/编码 |
| `packages/service/common/s3/sources/dataset/index.ts` | 返回 S3 source；沿用现有 3 小时待确认上传，并支持失败清理 |
| `packages/service/common/s3/sources/temp/index.ts` | 为评测等一次性 multipart 文件创建带 TTL 的临时 S3 source，并支持消费后主动清理 |
| `packages/service/core/dataset/read.ts` | 删除知识库重复外链下载，改传 External source |
| `packages/service/core/dataset/importFile.ts` | `filePath` 改为 S3 source |
| `packages/service/core/chat/fileContext.ts` | `FileReadContext.getSource`、共享格式集合、解析 source |
| `packages/service/core/workflow/utils/fileContext.ts` | 返回 source，`WorkflowFileSource` 改名 locator |
| `packages/service/core/workflow/utils/context.ts` | 非解析消费者显式物化 |
| 三个 Dataset collection API | `template`/`backup` 对齐 `localFile` 提前上传最终 key；沿用 3 小时 TTL、成功提升并补充失败清理 |
| Pro 应用评测创建 API | CSV 先上传临时 S3，提前释放 multipart 本地文件，再以可信 S3 source 解析并主动清理 |

删除生产 `readRawTextByLocalFile()`；测试若仍需本地 fixture，应先创建 Buffer test source 或测试 S3 source。

## 20. 测试方案

### 20.1 FileSource 单元测试

- S3 metadata 生成可信 size。
- S3 source 不携带或重复检查业务 `maxSizeBytes`。
- External source 入队前不发出网络请求。
- External source 不使用 Content-Length 做内存估算。
- External `maxSizeBytes` 使用团队套餐值，否则回退系统值，并统一转换为字节。
- AbortSignal 能销毁 S3/HTTP stream。
- Buffer test source 不进入生产调用链。

### 20.2 WorkerPool 单元测试

- 已知大小任务静态拒绝、排队和放行。
- 未知任务只预留基础值。
- 未知任务随下载量原子增加任务和池级软预留。
- 软预留增长可以把池剩余容量压到 0，但不会终止当前任务。
- 软预留增长后新的等待任务不会继续启动。
- 物化或最终格式预算超过单任务永久上限时立即 abort，不重新排队。
- 完成、解析失败、下载失败、超时、worker error/messageerror/协议错误全部释放最终预留。
- loadFile 回包 taskId/requestId 不匹配时回收 worker。
- 等待队列不执行数量或资源总量拒绝，并保留排队超时。

### 20.3 外部 URL 测试

- 知识库、Chat、Workflow 都调用同一下载实现。
- 无 Content-Length 的分块响应正常解析。
- Content-Length 超业务 `maxSizeBytes` 时提前拒绝。
- 实际流超过业务 `maxSizeBytes` 时中止。
- 物化估算超过单任务永久内存上限时中止。
- 当前动态可用内存不足时仍继续下载并更新软预留。
- redirect、私网、非 HTTP(S) 和超时策略回归。
- URL 后缀伪装与最终格式预算复核；最终预算只按永久硬上限拒绝。

### 20.4 格式测试

- built-in 与全部 AnyDoc 扩展名从共享集合识别。
- Content-Disposition filename 推断新格式。
- 可映射 MIME 推断新格式。
- 无信息二进制拒绝。
- `.markdown/.htm` alias 回归。

### 20.5 Multipart API 测试

分别覆盖 localFile/template/backup：

- 上传后本地临时文件被清理。
- 上传对象使用最终 Dataset key，并沿用现有 3 小时 TTL。
- template/backup 解析读取 S3，不读取本地路径。
- Collection 创建成功后 TTL 被事务删除，对象保留。
- 解析失败主动删除对象，删除成功后移除 TTL。
- Collection 事务失败时 TTL 删除回滚，对象被主动清理。
- 主动删除失败时保留 TTL，且不覆盖原业务错误。
- 进程中断场景由 TTL cleanup 测试验证最终提交删除任务。
- 应用评测 CSV 上传临时 S3 后才提交解析，本地文件提前释放；解析终态主动清理临时对象。

### 20.6 集成验证

- `readFile` 真实 worker 对 built-in 和 17 种 AnyDoc 文件回归。
- 多个大 S3 文件与未知长度 URL 并发，验证 RSS、预留和 worker 数量。
- App typecheck。
- Worker build 和 AnyDoc 原生包复制。
- 局部测试通过后，需求完成前运行全量测试。

### 20.7 本次实施验证结果

- FileSource、外链下载、资源调度、业务文件上限、Dataset/Chat/Workflow/应用评测迁移及 Multipart 生命周期局部测试通过。
- 真实 `readFile` worker 集成测试通过：31 个用例通过；4 个依赖外部大文件夹具的压力用例按原配置跳过。
- Worker build 通过，AnyDoc 原生依赖复制成功；App 和 Pro Admin TypeScript 类型检查通过。
- 本地 3000 端口集成测试通过：同一个本地 S3 对象分别覆盖可信 `s3` source 和经 HTTP 下载的不可信 `externalHttp` source；临时 Dataset 已清理。
- 最终代码运行了两轮全量 `pnpm test`。本次新增的 Dataset 生命周期测试 7 个和临时 S3 source 测试 3 个全部通过；全量并发期间，既有 Dataset 创建、App 创建用例分别触发 20 秒超时，既有 Admin 批处理性能用例触发耗时阈值。三者随后通过 `pnpm test:light` 隔离复跑，分别耗时约 2.2 秒、3.0 秒和 0.9 秒，确认属于跨 workspace 并发负载波动。
- 为避免全量命令在 App 失败后提前中止其他 workspace，最终分别完成低竞争完整测试：Service 355 个测试文件、4253 个测试通过，1 个文件中的 35 个 opt-in 集成测试跳过；Admin 125 个文件、688 个测试全部通过；App 225 个文件、1687 个测试通过，2 个文件中的 18 个 opt-in 集成测试跳过。
- 变更文件定向 ESLint、Prettier 和 `git diff --check` 通过。App 全量 lint 仍存在仓库既有告警和错误，本次变更文件没有新增 lint 错误。

## 21. 验收标准

1. 任何生产 `readFile` 等待任务都不持有 Buffer 或本地路径。
2. 外部 URL 在获得执行槽位前不下载。
3. S3 文件在获得执行槽位前不下载，但可使用可信 metadata 完成静态准入。
4. S3 任务按可信大小和格式一次性预留完整峰值，物化和解析阶段不重复检查业务大小或当前空闲内存。
5. 未知外链同时受业务 `maxSizeBytes` 和单任务永久内存两个硬上限约束，并随实际下载量单调更新软预留。
6. 未知外链软预留增长只压缩后续任务可调度容量，不因当前动态内存不足终止已启动任务。
7. 等待队列不设置任务数量或资源总量上限，只保留排队超时。
8. 所有任务终态都释放最终资源预留并终止未完成下载。
9. 知识库、Chat、Workflow 不再各自实现外链下载。
10. `FileReadContext` 覆盖共享文档格式集合及 AnyDoc 新格式。
11. localFile/template/backup 不把本地文件路径送入解析队列，只上传一次最终 S3 对象。
12. 三个 API 成功后对象持久化；失败对象主动删除，崩溃后由现有 3 小时 TTL 兜底。
13. 应用评测 CSV 不把 multipart 本地路径送入解析队列；临时 S3 对象在解析终态主动清理，失败由 TTL 兜底。
14. 不改变自定义 PDF Provider 的现有行为。

## 22. 实施 TODO

- [x] 新增 FileSource 类型、S3/External/test source 和统一物化方法。
- [x] 扩展 `readExternalFileBuffer()`，统一知识库、Chat、Workflow 外链读取。
- [x] 将 `readFileContentByBuffer()` / `readRawContentFromBuffer()` 生产入口迁移为 source。
- [x] 实现 worker loadFile 协议、AbortController 和 transferable ArrayBuffer。
- [x] 实现已知大小静态准入、未知外链两个硬限制、软预留更新和最终格式预算复核。
- [x] 删除队列资源总量准入且不新增队列数量上限，保留排队超时，并调整日志字段和错误语义。
- [x] 迁移 Dataset S3、外部/API 文件、Chat、Workflow 全部解析调用链。
- [x] 将 `FileReadContext.read()` 改为 `getSource()`，迁移非解析消费者显式物化。
- [x] 删除本地格式集合，统一复用 `documentFileExtensions`。
- [x] 将 template/backup 的最终 S3 上传对齐 localFile，沿用现有 3 小时 TTL 和成功提升逻辑，并补充失败清理。
- [x] 删除生产 `readRawTextByLocalFile()` 和知识库重复 HTTP 下载实现。
- [x] 按测试方案补齐单元、集成、类型检查和 worker build 验证。
- [x] 完成局部验证后运行全量测试。
