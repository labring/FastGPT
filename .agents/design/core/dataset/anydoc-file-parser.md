# Anydoc 补充文件解析设计

## 目标与边界

FastGPT 原有 `.txt/.md/.html/.pdf/.docx/.pptx/.xlsx/.csv` 继续使用现有解析器，保持 PDF、表格、
DOCX 图片上传等行为不变。`@firecrawl/anydoc` 只补充以下格式：

`.doc/.docm/.ppt/.pps/.pot/.pptm/.ppsx/.ppsm/.xls/.xlsm/.xlsb/.odt/.ods/.odp/.rtf/.epub`

上传白名单必须与后端可解析格式一致；未知扩展名继续拒绝。anydoc 输出的 GitHub-Flavored Markdown
写入 `ReadFileResponse.rawText`。依赖本身暂不输出嵌入图片链接，因此新增格式的图片只保留 alt 文本。

## 实现设计

- 全局常量分别维护原解析器格式、anydoc 格式及两者合集，由 `documentFileType` 和前端默认文件选择共同复用。
- `readFile` worker 保留所有原有显式分支；仅在默认分支命中 anydoc 白名单时调用新增适配器。
- 适配器用 `formatFromExtension` 归一化 `.xls/.docm` 等别名，再调用 `toMarkdownBytes`。
- anydoc 是 N-API 包。FastGPT App 和 Admin 都会构建共享 worker，两份构建脚本均需复制 JS 包和
  当前平台实际安装的 optional dependency 原生二进制；Docker 构建阶段执行 `require`，
  提前发现 musl 二进制遗漏。
- S3 上传校验把旧 Office 的 OLE/CFB MIME 视为同族，并把 OOXML 宏、幻灯片与二进制变体映射到
  对应基础格式族。旧 Office 和 OOXML 变体使用 64 KiB 检查窗口，避免容器标记超出默认 8 KiB。

## 验证逻辑

- 单元测试证明原有与补充格式无交集，前后端格式集合一致。
- 适配器测试覆盖格式路由、别名映射、非白名单拒绝及依赖错误透传。
- 上传测试覆盖旧 Office CFB、OOXML 变体和扩展检查窗口。
- 真实 worker spawn 集成测试逐一解析 16 种新格式，同时保留原格式回归用例。
- 上传校验测试使用同一批真实文件内容，逐一验证 16 种扩展名能通过知识库上传策略。
- 可选的本地开发服务 E2E 通过预签名接口、上传代理、MinIO 下载和预览分块接口，
  对每种格式校验最终解析文本。命中每分钟上传限额时等待一个窗口后继续，不绕过业务限流。
- worker 构建验证当前平台原生包被复制；Docker 验证 Alpine/musl 加载。

### 逐格式测试矩阵

| 格式 | Fixture 类型 | 真实 worker | 上传校验 | 本地服务 E2E |
| --- | --- | --- | --- | --- |
| `.doc` | OLE/CFB 真实文件 | 通过 | 通过 | 通过 |
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
- [x] 为全部 16 种新格式添加真实 worker 与上传校验测试。
- [x] 通过本地 FastGPT 开发服务完成 16 种格式的真实上传与预览解析 E2E。
- [x] 同步 App/Admin worker 构建脚本，修复 Admin Alpine 镜像对 N-API 二进制的误打包。
- [x] 运行类型检查、相关完整测试和 Docker 验证。
- [x] 隔离本需求改动并创建 PR。
