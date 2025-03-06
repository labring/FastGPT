### FastGPT V4.9.0 更新说明

#### 弃用 & 兼容

1. 弃用 - 之前私有化部署的自定义文件解析方案，请同步更新到最新的配置方案。[点击查看 PDF 增强解析配置](/docs/development/configuration/#使用-doc2x-解析-pdf-文件)
2. 弃用 - 弃用旧版本地文件上传 API：/api/core/dataset/collection/create/file（以前仅商业版可用的 API，该接口已放切换成：/api/core/dataset/collection/create/localFile）
3. 停止维护，即将弃用 - 外部文件库相关 API，可通过 API 文件库替代。
4. API更新 - 上传文件至知识库、创建连接集合、API 文件库、推送分块数据等带有 `trainingType` 字段的接口，`trainingType`字段未来仅支持`chunk`和`QA`两种模式。增强索引模式将设置单独字段：`autoIndexes`，目前仍有适配旧版`trainingType=auto`代码，但请尽快变更成新接口类型。具体可见：[知识库 OpenAPI 文档](/docs/development/openapi/dataset.md)

#### 功能更新

1. 新增 - PDF 增强解析，可以识别图片、公式、扫描件，并将内容转化成 Markdown 格式。
2. 新增 - 支持对文档中的图片链接，进行图片索引，提高图片内容的检索精度。
3. 新增 - 语义检索增加迭代搜索，减少漏检。
4. 优化 - 知识库数据不再限制索引数量，可无限自定义。同时可自动更新输入文本的索引，不影响自定义索引。
5. 优化 - Markdown 解析，增加链接后中文标点符号检测，增加空格。
6. 优化 - Prompt 模式工具调用，支持思考模型。同时优化其格式检测，减少空输出的概率。
7. 优化 - 优化文件读取代码，极大提高大文件读取速度。50M PDF 读取时间提高 3 倍。
8. 优化 - HTTP Body 适配，增加对字符串对象的适配。
9. 修复 - 批量运行时，全局变量未进一步传递到下一次运行中，导致最终变量更新错误。

