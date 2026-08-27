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
- anydoc 是 N-API 包。worker 构建复制 JS 包和当前平台实际安装的 optional dependency 原生二进制；
  Docker 构建阶段执行 `require`，提前发现 musl 二进制遗漏。
- S3 上传校验把旧 Office 的 OLE/CFB MIME 视为同族，并把 OOXML 宏、幻灯片与二进制变体映射到
  对应基础格式族。旧 Office 和 OOXML 变体使用 64 KiB 检查窗口，避免容器标记超出默认 8 KiB。

## 验证逻辑

- 单元测试证明原有与补充格式无交集，前后端格式集合一致。
- 适配器测试覆盖格式路由、别名映射、非白名单拒绝及依赖错误透传。
- 上传测试覆盖旧 Office CFB、OOXML 变体和扩展检查窗口。
- 真实 worker spawn 集成测试使用仓库内 fixture 解析 `.doc/.xls/.odt`，同时保留原格式回归用例。
- worker 构建验证当前平台原生包被复制；Docker 验证 Alpine/musl 加载。

## TODO

- [x] 抽取并扩展文档格式常量。
- [x] 实现 anydoc 解析适配器和 worker 回退路由。
- [x] 同步前端默认上传格式及服务端上传约束。
- [x] 添加单元测试与 `.doc/.xls/.odt` 真实 worker 集成测试。
- [x] 运行类型检查、相关完整测试和 Docker 验证。
- [x] 隔离本需求改动并创建 PR。
