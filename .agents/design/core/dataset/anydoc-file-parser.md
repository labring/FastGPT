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

本轮只约束 `readFile` worker 的解析阶段，暂不处理压缩文档实际展开量与输入大小不一致的问题，也暂不把
内存预留延伸到解析结果的后续文本切块阶段。

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
- 原有单 worker 100 个任务回收、执行超时和 V8 老生代限制继续生效。
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
- [x] 限制排队任务预估资源总量，并覆盖 worker 提前退出与协议异常释放。
- [x] 完成类型检查、相关测试、完整测试和真实大文件并发验证。
- [x] 补充结构化 worker 生命周期日志、队列压力去重、内存快照和基于日志的监控字段。
