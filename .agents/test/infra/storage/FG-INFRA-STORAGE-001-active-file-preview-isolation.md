---
case_version: 1
id: "FG-INFRA-STORAGE-001"
title: "可执行文件预览保留交互并隔离主站登录权限"
business: "infra/storage"
types: [api, ui, integration]
category: boundary
scenario: special
priority: P0
status: ready
tags: [HTML, SVG, CSP, 文件安全, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, ui, database, storage]
sources:
  - packages/service/common/s3/preview.ts
  - projects/app/src/service/common/s3/proxy.ts
  - projects/app/src/pages/api/system/file/d/[signedAlias].ts
  - projects/app/src/pages/api/system/file/download/[token].ts
  - projects/app/src/pages/api/system/file/[jwt].ts
  - projects/app/src/pages/api/system/img/[...id].ts
  - projects/app/src/pages/api/proApi/[...path].ts
  - pro/admin/src/pages/api/system/file/download/[token].ts
routes:
  - POST /api/core/chat/file/presignChatFilePostUrl
  - PUT /api/system/file/u/{token}
  - POST /api/core/chat/file/presignChatFileGetUrl
  - GET /api/system/file/d/{signedAlias}
  - HEAD /api/system/file/d/{signedAlias}
  - GET /api/system/file/download/{token}
  - GET /api/system/file/{jwt}
  - GET /api/system/img/{id}
  - GET /api/proApi/system/img/{id}
related: [FG-ADMIN-CONFIG-004]
automation: []
baseline: "88a1d4c654"
---

# 可执行文件预览保留交互并隔离主站登录权限

## 用例简介

用户上传的 HTML 和 SVG 可直接打开并运行脚本，HTML 可加载第三方资源、发起外部请求和完成页面交互；文件不能获得主站 Cookie、DOM 或存储权限，也不能借原窗口的消息通道触发主站行为。代理模式、重定向模式和旧下载入口遵循同一隔离规则，普通文件下载行为保持兼容。

## 前置准备

- 使用本地 dev 及现有 Mongo、Redis、MinIO 和 Pro 服务；创建本轮独立团队、owner、普通成员和开启文件上传的应用，记录资源 ID。禁止启动额外本地测试数据库。
- 通过真实预签名接口上传 HTML、SVG、PNG 和 TXT；HTML 包含内嵌计数按钮、外部脚本、图片、样式及 CORS API 探针。外部资源由本轮独立端口的受控 HTTP 服务提供，日志只保留路径、方法、Origin 和 Cookie 是否存在。
- 浏览器使用本轮测试账号登录，先证明正常主站 API 成功；主站存储仅写入本轮随机标记。功能交互优先使用 EGO Lite；浏览器若移除 CSP/X-Frame-Options，则保留该差异并使用独立标准 Chromium 上下文完成安全断言，不能以改写过响应的浏览器行为判定产品安全。接口及存储校验使用 Node 脚本。
- 主动文件使用 HTML MIME 或 HTML/SVG 后缀的任一条件即隔离。不会通过放宽 CORS、修改已有登录 Cookie、关闭 CSRF 或更改产品期望使测试通过。
- 若切换共享 storage 配置，先保存 BSON 快照并以 revision CAS 修改和恢复，确认无其他任务变更；只改变本轮需要的下载模式/端点字段，不回滚无关配置。
- 临时签名和 Cookie 只存私有夹具，不写报告。旧 JWT 由 dev 的签名配置为本轮对象签发，不能访问清单外文件。
- 完成后精确删除本轮文件及 alias/session、应用、账号和团队；恢复 storage 配置和本轮浏览器标记，保留脱敏证据。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；真实上传 HTML 后取得短链 | 打开 HTML，点击计数按钮；验证内嵌脚本、外部脚本/样式/图片和外部 CORS API 请求。记录下载字节哈希与最终响应头。 |
| C2 | 异常；主站已登录 | 从文件尝试读取 Cookie、localStorage、主站窗口 DOM；分别请求主站 API，含 credentials=include、简单请求和带自定义头的请求；测试 HTML 表单访问主站。 |
| C3 | 边界；从主站页面打开文件 | 检查新窗口 opener、尝试向原窗口 postMessage；再从主站 iframe 嵌入文件。记录原窗口消息计数和 iframe 内容是否执行。 |
| C4 | 边界；SVG 和 MIME/后缀冲突 | 真实上传 SVG，分别通过 MIME、文件名大小写及历史 metadata 类型错配检查隔离；GET 和 HEAD 的安全头一致，错误签名不能取得内容。 |
| C5 | 兼容；本轮对象已存在 | 使用短链、旧 download JWT、旧 objectKey JWT、Pro download JWT 入口访问同一 HTML；核对正文和安全头。 |
| C6 | 边界；恢复配置基线后切换下载模式 | short-proxy 与 short-redirect 分别读取 HTML、SVG、PNG、TXT；主动文件最终由代理响应，普通文件继续使用配置选择的下载方式。 |
| C7 | 兼容；历史图片记录 | 准备本轮测试的历史 SVG 图片和 PNG 对照，通过 App 与 Pro 图片入口读取，覆盖主站对 Pro 图片跳转的代理。 |

## 预期结果

公共断言：文件内容与上传字节一致；主动内容响应保持 inline，CSP sandbox 允许脚本但不允许 same-origin 或弹窗逃逸，COOP 为 same-origin，frame-ancestors 为 none，Referrer-Policy 为 no-referrer，Cache-Control 为 private/no-store。所有证据限定本轮资源，测试结束检查资源清理和配置恢复。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | API + UI + storage | 脚本运行、按钮计数和外部资源请求成功；真实对象与下载哈希一致。 | HTTP 响应、DOM 状态、资源服务日志、对象哈希。 |
| C2 | UI + API + DB | 主站存储/DOM 读取被拒绝；主站请求不能读到登录用户数据或以其身份修改；同一账号在正常主站页面仍能调用 API。 | 探针 DOM、浏览器网络记录和本轮团队/应用前后精确查询。 |
| C3 | UI | 文件 opener 为 null，原窗口未收到文件发送的消息；iframe 不执行主动文件。 | 浏览器状态、消息计数、探针资源日志。 |
| C4 | API + UI | SVG 脚本可运行且 Cookie/存储被隔离；冲突仍返回安全头；GET/HEAD 一致，篡改签名被拒绝。 | SVG 状态、响应头与拒绝响应。 |
| C5 | API | 所有可达兼容入口的正文和隔离头一致；Pro 直连和主站代理均覆盖。 | 各入口最终响应、正文哈希。 |
| C6 | API + storage + DB | HTML/SVG 两模式均 200 代理且具备隔离头；PNG/TXT 保留 200/302 模式行为，重定向最终字节一致；配置恢复。 | 模式配置 CAS、各响应及跟随跳转的哈希、恢复快照。 |
| C7 | API + storage | 历史 SVG 的最终文档带隔离头。PNG 正常读取，Pro 的普通图片跳转保留独立存储地址。 | 响应头、状态、字节哈希与跳转目标来源。 |
