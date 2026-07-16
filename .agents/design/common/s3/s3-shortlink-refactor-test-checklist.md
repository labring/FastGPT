S3 短链重构提测清单

提测说明
- 主线变化：
  - 下载短链：/api/system/file/d/<aliasId>.<expMinute36>.<sig>
  - 上传短链：/api/system/file/u/<shortToken>
  - 旧 JWT 路由继续兼容：/api/system/file/download/<jwt>、/api/system/file/upload/<jwt>、/api/system/file/<jwt>
  - createPresignedPutUrl 名字没变，但现在返回的是 app proxy 上传短链，不是对象存储直传 URL。

P0 测试用例

1. 下载短链基础可用

- 触发一个会生成 proxy 下载链接的场景，比如 chat 文件预览、dataset markdown 图片预览。
- 拿到 URL，格式应类似：
  - /api/system/file/d/<aliasId>.<expMinute36>.<sig>
- 预期：
  - URL 不包含真实 objectKey。
  - URL 不包含旧 JWT 长 token。
  - GET 能正常预览/下载。
  - HEAD 返回 200，并带上核心响应头。
  - 响应头包含合理的 Content-Type、Content-Disposition、必要时包含 Content-Length。

2. 下载短链签发去重

- 对同一个 bucketName + objectKey + filename + responseContentType 连续签发多次下载短链。
- 查 Mongo s3_download_aliases。
- 预期：
  - 只创建 1 条 alias 文档。
  - 多次签发返回同一个 aliasId。
  - 只有进入 lease 刷新安全窗口时，lastIssuedAt 才会随低频续租更新。
  - purgeAt 只会往后延，不会被更短过期时间缩短。

3. 下载短链变体隔离

- 对同一个 objectKey，用不同 responseContentType 或不同 filename 签发下载链接。
- 预期：
  - 生成不同 alias。
  - 下载时响应的 Content-Type 或文件名符合签发参数。
  - 不会错误复用另一个变体的响应参数。

4. 下载短链安全校验

- 构造以下请求：
  - 改 expMinute36
  - 改 sig
  - 使用过期 expMinute36
  - 使用不存在的 aliasId
  - 使用被 revoke 的 aliasId
- 预期：
  - 都返回 403。
  - 对外错误统一是无权访问文件，不暴露 alias 是否存在。
  - 过期或签名错误应在查 Mongo 前拦截。

5. 下载对象不存在

- 创建一个合法 alias，但让它指向不存在的 S3 object。
- 预期：
  - 返回 404。
  - 错误是文件不存在。
  - 不返回 500。

6. 上传短链基础可用

- 走 ChatBox 文件上传，或调用任意返回 createPresignedPutUrl 的接口。
- 拿到上传 URL，格式应类似：
  - /api/system/file/u/<shortToken>
- 用返回的 headers 上传文件。
- 预期：
  - PUT 成功。
  - 文件实际写入目标 bucket/key。
  - 返回的 previewUrl 可预览。
  - shortToken 不出现在 Mongo 明文里，只存 tokenHash。

7. 上传 session 状态

- 创建上传链接后查 Mongo s3_upload_sessions。
- 预期：
  - 有 1 条 session 文档。
  - tokenHash 是 64 位 hex。
  - tokenHash 不等于 URL 里的 shortToken。
  - expiresAt 有 TTL 索引。
  - PUT 成功后 usedAt 被标记。

8. 上传 session 过期、撤销、缺失

- 分别用：
  - 不存在的 shortToken
  - 过期 session token
  - revoked session token
- 预期：
  - 都返回 403。
  - 前端能识别为上传授权失败。
  - 不写入 S3。

9. 上传大小限制

- 创建 maxSize 很小的上传 session。
- 上传超过限制的文件。
- 预期：
  - 返回 413。
  - 前端提示文件过大。
  - S3 不写入对象。
  - 服务端不会继续消费到无限大。

10. 上传文件类型校验

- 分别测试：
  - 允许 .png，上传真实 png。
  - 允许 .png，上传 txt 内容但文件名是 .png。
  - 允许 .txt，上传普通文本。
  - 允许 .docx/.xlsx/.pptx，上传真实 Office 文件。
  - 文件名无后缀，但策略没有 allowedExtensions。
  - 文件名无后缀，但策略要求 allowedExtensions。
- 预期：
  - 合法文件成功。
  - 后缀和内容不匹配返回 400。
  - 前端提示“不支持的文件内容或后缀不匹配”。
  - 没有 allowedExtensions 的通用上传不应被误杀。
  - 有 allowedExtensions 时，无后缀文件应按策略拒绝。

11. SKIP_FILE_TYPE_CHECK 兼容

- 配置 SKIP_FILE_TYPE_CHECK=true。
- 上传内容和后缀不匹配的文件。
- 预期：
  - 跳过内容魔数校验。
  - 仍保留基础大小限制。
  - 如果上层在签发阶段已经因为 allowedExtensions 拒绝，仍应拒绝。

12. 旧 JWT 下载兼容

- 用旧路由：
  - /api/system/file/download/<jwt>
  - /api/system/file/<jwt>
- 预期：
  - 旧链接在 JWT 未过期前仍能访问。
  - 文件名 query 仍生效。
  - text/json/svg 等文本类型仍带 charset。
  - 对象不存在返回 404。
  - 无效 JWT 返回 403。

13. 旧 JWT 上传兼容

- 用旧路由：
  - /api/system/file/upload/<jwt>
- 预期：
  - 旧上传 token 未过期时仍能上传。
  - 上传大小限制、文件类型校验、metadata 写入都和新短上传一致。
  - 无效/过期 JWT 返回 403。

14. ChatBox 上传

- 在 ChatBox 上传图片、文档、音频/视频、普通文件。
- 预期：
  - 预签接口返回 /api/system/file/u/<token>。
  - 上传进度正常。
  - 上传成功后文件条目使用 previewUrl。
  - 发送消息后文件能被模型/工作流读取。
  - 刷新会话后文件能重新预览。
  - 上传错误时条目能移除或标记失败。

15. App FileSelector 上传

- 在应用变量文件选择器里上传文件。
- 预期：
  - 上传 URL 是短上传。
  - previewUrl 能用于展示。
  - 保存配置后重新进入，文件 URL 能重新签发并预览。

16. Dataset 文件上传

- 上传 dataset 文件。
- 预期：
  - 上传 URL 是短上传。
  - dataset 允许的文档类型能成功。
  - 不允许的扩展名/内容不匹配被拒绝。
  - 上传后的文件解析流程不受影响。

17. Dataset markdown 图片和引用替换

- 数据集 chunk 里包含 dataset/...、chat/...、temp/... 的 markdown 图片。
- 触发：
  - 数据列表
  - 搜索测试
  - 引用返回
  - 数据导出
- 预期：
  - markdown 里的 S3 key 被替换成 /api/system/file/d/... 短链。
  - 非 S3 key、不支持前缀、已有 http(s) URL 不被替换。
  - 90 天/1 天/1 小时等不同签发过期策略按调用场景生效。

18. Dataset 图片预览组件

- 打开包含图片的 dataset 数据详情。
- 预期：
  - 初始 previewUrl 可显示。
  - 预览失败后能通过 key 重新获取 previewUrl。
  - 新获取的链接也是短下载链接。

19. 头像上传

- 上传团队/应用头像。
- 预期：
  - 上传 URL 是短上传。
  - 只允许 jpg/jpeg/png。
  - 上传成功后 refreshAvatar 会移除新头像 TTL。
  - 删除旧头像时对象删除成功，并 best-effort 清理 download alias。

20. 临时文件上传

- 走 /api/common/file/presignTempFilePostUrl 上传临时文件。
- 预期：
  - 上传 URL 是短上传。
  - previewUrl 可访问。
  - TTL 仍按临时文件语义存在。

21. Sandbox/HTML 预览文件

- 触发生成 HTML preview 的接口。
- 预期：
  - 返回的访问 URL 是短下载，或在 external endpoint 模式下是 presigned URL。
  - 文件 TTL/清理策略符合原逻辑。

22. Invoke 工具生成文件

- 插件工具调用 ctx.invoke.uploadFile() 上传文件。
- 预期：
  - 返回主 app 的文件访问 URL。
  - 返回结构包含 url/key/filename/contentType/type。
  - 新上传的工具文件不会在 s3_ttls 里残留 1 小时 TTL。
  - 1 小时后仍能预览。
  - 旧 SDK 只读取 url 仍兼容。

23. Pro/Admin 管理端文件链路

- 当前口径：
  - admin 不新增 /api/system/file/u/* 和 /api/system/file/d/* 新短链 route。
  - admin 的 FE_DOMAIN 指向主 app。
  - 如配置 FILE_DOMAIN，也应指向主 app 或独立文件域名，并由主 app 承接 /api/system/file/*。
  - 如果测试环境生成了 admin host 的短链，按环境变量配置问题处理，不在 admin 侧补 route。
- 上传签发用例：
  - 调用 pro/admin/src/pages/api/common/file/getAvatarPresign.ts。
  - 上传系统 favicon。
  - 上传 navbar item avatar。
  - 上传应用模板头像。
  - 上传运营广告图。
  - 上传活动广告图。
  - 上传 Chat 首页 wide logo / square logo。
  - 上传组织头像。
  - 上传成员组头像。
- 预期：
  - 返回 url/key/headers/previewUrl/maxSize。
  - url 是主 app 或文件域名下的 /api/system/file/u/<token>。
  - url 不应是 admin host。
  - 用返回 headers PUT 后，S3 对象写入成功。
  - previewUrl 能在 admin 和前台页面预览。
- 系统配置保存用例：
  - 保存 updateConfig。
  - 预期新 favicon/navbar item avatar 的 s3_ttls 被移除。
  - 预期老 favicon/navbar item avatar 被删除时，对应 alias best-effort 清理。
- 应用模板用例：
  - 创建应用模板并上传头像。
  - 更新普通应用模板头像。
  - 更新 plugin system template。
  - 预期普通模板头像保存后移除 TTL。
  - plugin system template 按现有逻辑处理，不误删、不误移除。
- 通知/广告用例：
  - 更新运营广告图。
  - 更新活动广告图。
  - 预期新图保存后移除 TTL。
  - 替换旧图时旧图被删除。
  - 前端获取广告配置后图片可预览。
- Chat 设置用例：
  - 更新 Chat 首页 wide logo。
  - 更新 Chat 首页 square logo。
  - 预期新图保存后移除 TTL。
  - 替换旧图时旧图被删除。
- 组织/成员组头像用例：
  - 创建组织时上传头像。
  - 更新组织头像。
  - 创建成员组时上传头像。
  - 更新成员组头像。
  - 预期新头像保存后移除 TTL。
  - 替换旧头像时旧头像被删除。
- 公开图片访问用例：
  - 访问 pro/admin/src/pages/api/system/img/[...id].ts。
  - 预期 public avatar 能正常显示。
  - 如果走 public bucket URL，确认不依赖 admin 新短链 route。
- 旧 route 兼容用例：
  - 访问 pro/admin/src/pages/api/system/file/upload/[token].ts。
  - 访问 pro/admin/src/pages/api/system/file/download/[token].ts。
  - 访问 pro/admin/src/pages/api/common/file/read/[filename].ts。
  - 预期旧 JWT upload/download/read 继续工作。
  - 旧 route 不要求返回 /api/system/file/d 短链。
- ChatAgentHelper 用例：
  - 带 fileSelect 输入触发辅助生成。
  - 客户端传入的 file url 不可信。
  - 服务端通过 key 重新生成 previewUrl。
  - 默认 STORAGE_DOWNLOAD_URL_MODE=short-proxy 时，previewUrl 是主 app/file domain 短链。
  - STORAGE_DOWNLOAD_URL_MODE=short-redirect 且配置外部 S3/CDN 时，previewUrl 仍是短链，访问时 302 到短 TTL presigned。
  - STORAGE_DOWNLOAD_URL_MODE=presigned 时，previewUrl 可以是对象存储 presigned。
- 外部联系人消息文件用例：
  - 公众号图片消息下载后写入 chat S3。
  - 企微 image/file/mixed 消息下载解密后写入 chat S3。
  - 预期 uploadChatFile 写入成功。
  - 临时 TTL 语义保持原逻辑。
  - 后续预览 URL 由主 app/file domain 承接，不生成 admin host 短链。

24. 删除对象后的 alias 清理

- 创建下载 alias 后删除单个对象。
- 预期：
  - S3 对象删除成功。
  - 对应 s3_download_aliases 被 best-effort 删除。
  - 即使 alias 清理失败，也不能影响主删除流程。

25. 删除队列批量清理

- 触发按 keys 删除，比如删除 chat/dataset 文件。
- 预期：
  - S3 对象删除成功。
  - 对应 keys 的 download alias 被 best-effort 删除。
  - 删除 prefix 时对象删除成功；如果后续需要 prefix alias 清理，需要单独确认是否补实现。

26. Mongo TTL 清理

- 检查两个集合：
  - s3_download_aliases
  - s3_upload_sessions
- 预期：
  - s3_download_aliases.purgeAt 有 TTL 索引。
  - s3_upload_sessions.expiresAt 有 TTL 索引。
  - 到期后 Mongo 会自动清理。
  - download alias 的 purgeAt 晚于链接过期时间，有 grace。

27. short-proxy / short-redirect / presigned 模式

- 不配置 STORAGE_EXTERNAL_ENDPOINT。
  - 下载应默认走 /api/system/file/d/...。
  - previewUrl 应是短下载。
- 配置 STORAGE_EXTERNAL_ENDPOINT。
  - 普通下载默认仍走 /api/system/file/d/...。
  - STORAGE_DOWNLOAD_URL_MODE=short-redirect 时，访问短链应 302 到短 TTL 对象存储 presigned URL。
  - STORAGE_DOWNLOAD_URL_MODE=presigned 或明确传 mode: presigned 时，才直接返回对象存储 presigned URL。
  - 明确传 mode: short-proxy 时仍应走短下载。
  - 上传 URL 仍是 /api/system/file/u/...。
- 配置 STORAGE_S3_CDN_ENDPOINT。
  - presigned 下载 URL 应替换成 CDN host/path。
  - short-redirect 的 302 Location 应替换成 CDN host/path。
  - proxy 短链不应被替换成 CDN。

28. FILE_DOMAIN / FE_DOMAIN / NEXT_PUBLIC_BASE_URL

- 分别配置：
  - FILE_DOMAIN
  - FE_DOMAIN
  - 只配置 NEXT_PUBLIC_BASE_URL
- 预期：
  - 短链 host 符合优先级：FILE_DOMAIN || FE_DOMAIN || '' + NEXT_PUBLIC_BASE_URL。
  - 线上环境不能生成 localhost 链接。
  - base path 场景下路径正确，例如 /fastgpt/api/system/file/d/...。
  - admin 的 FE_DOMAIN 指向主 app，不生成 admin host 的 /api/system/file/u 或 /api/system/file/d。

29. 短链长度

- 随机生成一批下载/上传链接。
- 预期：
  - 下载链接 path 约为 /api/system/file/d/16位alias.过期base36.22位sig。
  - 上传 token 默认约 22 位。
  - 明显短于旧 JWT URL。
  - 链接不包含 +、/、= 这类容易出问题的字符。

30. Agent 引用链接稳定性

- 让模型回答里引用包含文件/图片的短链。
- 预期：
  - 短链被模型复述时不容易截断。
  - 图片 markdown 可预览。
  - 对比旧 JWT 链接，链接长度明显下降。

31. 错误提示

- 分别触发：
  - 403 无效短链
  - 404 文件不存在
  - 413 文件过大
  - 400 文件类型不匹配
  - 500 bucket 不存在或存储异常
- 预期：
  - 前端提示符合预期。
  - 上传错误能被 parseS3UploadError 识别。
  - 短链内部错误不暴露具体原因给用户。

影响面覆盖清单

SDK 层

- sdk/storage/src/access-link/*
- @fastgpt-sdk/storage 主入口导出 access-link 能力。
- 影响：
  - HMAC 签名、base36 过期时间、URL-safe token。
  - download alias 状态机。
  - upload session 状态机。
  - memory store 测试工具。
  - SDK build 和 dist 产物。

Service 短链封装

- packages/service/common/s3/accessLink/*
- 影响：
  - s3_download_aliases
  - s3_upload_sessions
  - FILE_TOKEN_KEY
  - store adapter 和 service wrapper。
  - revoke/delete/verify 行为。

S3 bucket 基类

- packages/service/common/s3/buckets/base.ts
- 影响：
  - createExternalUrl
  - createPresignedPutUrl
  - uploadFileByBody
  - removeObject
  - 默认上传流量从对象存储直传变成 app proxy 上传。

API 路由

- 新路由：
  - projects/app/src/pages/api/system/file/d/[signedAlias].ts
  - projects/app/src/pages/api/system/file/u/[token].ts
- 旧兼容：
  - projects/app/src/pages/api/system/file/download/[token].ts
  - projects/app/src/pages/api/system/file/upload/[token].ts
  - projects/app/src/pages/api/system/file/[jwt].ts
- 公共 proxy：
  - projects/app/src/service/common/s3/proxy.ts

上传策略和文件类型校验

- packages/service/common/s3/validation/upload.ts
- packages/service/common/s3/utils/uploadConstraints.ts
- 影响：
  - allowedExtensions。
  - MIME 魔数检测。
  - Office zip 文档识别。
  - text/json/svg 等文本文件。
  - SKIP_FILE_TYPE_CHECK。

Chat 文件

- packages/service/common/s3/sources/chat/*
- projects/app/src/pages/api/core/chat/file/presignChatFilePostUrl.ts
- projects/app/src/pages/api/core/chat/file/presignChatFileGetUrl.ts
- projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useFileUpload.tsx
- 影响：
  - ChatBox 上传。
  - 变量文件上传。
  - outLink 场景。
  - 历史会话重新签发文件 URL。

App FileSelector

- projects/app/src/components/core/app/FileSelector/index.tsx
- 影响：
  - 应用配置里的文件变量上传。
  - 已保存文件重新获取 previewUrl。

Dataset 文件和图片

- packages/service/common/s3/sources/dataset/*
- packages/service/core/dataset/utils.ts
- packages/service/core/dataset/data/controller.ts
- projects/app/src/pages/api/core/dataset/file/*
- 影响：
  - dataset 文件上传。
  - dataset 图片预览。
  - markdown S3 key 替换。
  - 搜索测试。
  - 引用返回。
  - 导出。

Avatar

- packages/service/common/s3/sources/avatar/index.ts
- 影响：
  - 上传头像短上传。
  - 新头像 TTL 移除。
  - 旧头像删除和 alias 清理。

Pro/Admin 文件

- pro/admin/src/pages/api/common/file/getAvatarPresign.ts
- pro/admin/src/pages/api/system/file/download/[token].ts
- pro/admin/src/pages/api/system/file/upload/[token].ts
- pro/admin/src/pages/api/system/img/[...id].ts
- pro/admin/src/pages/api/common/file/read/[filename].ts
- pro/admin/src/pages/api/admin/routes/settings/updateConfig.ts
- pro/admin/src/pages/api/admin/core/app/templates/create.ts
- pro/admin/src/pages/api/admin/core/app/templates/update.ts
- pro/admin/src/pages/api/admin/support/user/inform/updateOperationalAd.ts
- pro/admin/src/pages/api/admin/support/user/inform/updateActivityAd.ts
- pro/admin/src/pages/api/core/chat/setting/update.ts
- pro/admin/src/pages/api/support/user/team/org/create.ts
- pro/admin/src/pages/api/support/user/team/org/update.ts
- pro/admin/src/pages/api/support/user/team/group/create.ts
- pro/admin/src/pages/api/support/user/team/group/update.ts
- pro/admin/src/service/core/ai/auxiliaryGeneration/chatAgentHelper/service.ts
- pro/admin/src/service/support/outLink/official_account/file.ts
- pro/admin/src/service/support/outLink/wecom/file.ts
- 影响：
  - admin 配置页图片上传。
  - 系统 favicon、navbar item avatar。
  - 应用模板头像。
  - 运营广告图、活动广告图。
  - Chat 首页 wide logo / square logo。
  - 组织头像、成员组头像。
  - admin 旧 JWT upload/download/read 兼容。
  - admin ChatAgentHelper 文件 previewUrl 重新签发。
  - 公众号/企微消息文件写入 chat S3。
  - admin 不承接新短链 route 的部署约束。

Temp / Sandbox / Skill / RawText

- projects/app/src/pages/api/common/file/presignTempFilePostUrl.ts
- projects/app/src/pages/api/core/ai/sandbox/getHtmlPreviewLink.ts
- packages/service/common/s3/sources/skill/index.ts
- packages/service/common/s3/sources/rawText/index.ts
- 影响：
  - 临时文件 TTL。
  - 工具/沙盒产物预览。
  - raw text 缓存文件。

Invoke 插件文件

- projects/app/src/pages/api/invoke/fileUpload.ts
- packages/service/support/invoke/invoke.ts
- packages/global/openapi/plugin/invoke.ts
- 影响：
  - 工具生成文件返回字段。
  - 工具文件 TTL 移除。
  - 旧 SDK 兼容 url。

删除和清理

- packages/service/common/s3/queue/delete.ts
- packages/service/common/s3/models/ttl.ts
- 影响：
  - S3 删除队列。
  - alias best-effort 清理。
  - s3_ttls 和短链集合 TTL。

配置

- FILE_TOKEN_KEY
- FILE_DOMAIN
- FE_DOMAIN
- NEXT_PUBLIC_BASE_URL
- STORAGE_EXTERNAL_ENDPOINT
- STORAGE_S3_ENDPOINT
- STORAGE_S3_CDN_ENDPOINT
- STORAGE_PUBLIC_ACCESS_EXTRA_SUB_PATH
- SKIP_FILE_TYPE_CHECK

部署

- Docker compose / Helm 里需要确认：
  - FILE_TOKEN_KEY 所有 app 实例一致。
  - 多实例共享同一 Mongo。
  - app proxy 上传带宽和超时配置够用。
  - NEXT_PUBLIC_BASE_URL 和 FILE_DOMAIN 不生成内网/localhost 链接。
  - pro/admin 的 FE_DOMAIN 指向主 app。
  - 如配置 FILE_DOMAIN，admin 和 app 侧都应指向主 app 或独立文件域名，由主 app 承接 /api/system/file/*。
  - admin 域名不承接 /api/system/file/u 和 /api/system/file/d，除非网关明确转发到主 app。

升级及兼容性

向后兼容

- 旧下载 JWT 路由保留。
- 旧上传 JWT 路由保留。
- 旧 objectKey JWT 路由保留。
- CreatePostPresignedUrlResponse 字段仍保留：
  - url
  - key
  - headers
  - previewUrl
  - maxSize
- ctx.invoke.uploadFile() 响应仍保留 url，新增 key/filename/contentType/type。

行为变化

- 新签发的 proxy 下载不再返回长 JWT URL。
- 新签发的上传 URL 不再是对象存储 presigned PUT，而是 app proxy 短上传 URL。
- 上传文件类型校验从“只靠扩展名/请求头”变成会检查文件内容前若干字节。
- 工具生成文件不再保留 1 小时临时 TTL。
- 下载短链 Mongo 文档数量接近对象变体数量，不随每次签发线性增长。
- 上传 session 仍是每次上传一条文档，靠 TTL 清理。

配置兼容

- FILE_TOKEN_KEY 不能变；变了会导致新旧短链、旧 JWT 都失效。
- 多副本部署必须使用同一个 FILE_TOKEN_KEY。
- 下载默认由 STORAGE_DOWNLOAD_URL_MODE 控制，默认值 short-proxy。
- 配置 STORAGE_EXTERNAL_ENDPOINT 不再自动切到对象存储 presigned。
- STORAGE_DOWNLOAD_URL_MODE=short-redirect 时，短链入口 302 到短 TTL 对象存储 presigned URL。
- STORAGE_DOWNLOAD_URL_MODE=presigned 时，下载才默认走对象存储 presigned URL。
- 即使配置 STORAGE_EXTERNAL_ENDPOINT，上传仍走 app proxy 短上传。

数据库兼容

- 新增集合：
  - s3_download_aliases
  - s3_upload_sessions
- 需要确认索引创建成功：
  - s3_download_aliases.aliasId unique
  - s3_download_aliases.aliasKey unique
  - s3_download_aliases.purgeAt TTL
  - s3_upload_sessions.tokenHash unique
  - s3_upload_sessions.expiresAt TTL
- Mongo TTL 删除不是秒级实时，测试时要允许延迟。

回滚注意

- 回滚后，新短链 /api/system/file/d、/api/system/file/u 可能不可用。
- 如果已经把短链写进历史消息、dataset 内容或工具输出，回滚会影响这些新链接访问。
- 回滚前需要确认是否要继续保留短链路由兼容。
- 如果回滚到旧直传上传，前端仍拿到 /api/system/file/u 的场景会失败。

性能和容量

- app proxy 上传会消耗 app 服务端入口带宽和 CPU。
- 大文件上传需要关注：
  - Next API bodyParser 已关闭。
  - 反向代理超时。
  - 最大请求体限制。
  - app 实例带宽。
- download proxy 模式本来就走 app 流量；presigned 模式不走 app 流量。
- s3_upload_sessions 在高并发上传时会增长，依赖 TTL 清理。
- s3_download_aliases 不应随页面刷新暴涨。

提测前自查命令

- SDK access-link：
  - pnpm exec vitest run test/sdk/storage/accessLink.test.ts
- Service access-link：
  - cd packages/service && pnpm exec vitest run -c vitest.config.ts test/common/s3/accessLink.test.ts
- App 短链 API：
  - pnpm exec vitest run projects/app/test/api/system/file/accessLink.test.ts
- 旧 JWT proxy 兼容：
  - pnpm exec vitest run projects/app/test/api/system/file/sourceContentType.test.ts
- Invoke 上传：
  - cd packages/service && pnpm exec vitest run -c vitest.config.ts test/support/invoke/invoke.test.ts
- App 类型检查：
  - pnpm --filter @fastgpt/app typecheck

提测环境冒烟顺序

1. 检查环境变量，确认短链 host 正确。
2. 跑 ChatBox 上传图片和普通文件。
3. 跑 Dataset 上传和图片预览。
4. 跑 admin 配置图、模板头像、广告图上传保存。
5. 确认 admin 返回的短上传 URL host 是主 app 或文件域名，不是 admin host。
6. 跑 admin 旧 JWT 下载/上传/read 链接。
7. 跑旧 JWT 下载/上传链接。
8. 跑工具 ctx.invoke.uploadFile()。
9. 查 Mongo 两个短链集合和 s3_ttls。
10. 等待超过 1 小时，确认工具生成文件仍可预览。
11. 检查 app 服务端上传流量和错误日志。
