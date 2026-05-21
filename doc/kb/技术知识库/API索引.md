# API 索引

> 本文档梳理 FastGPT 主应用（`projects/app`）的 HTTP API 全景，包含对外的 OpenAI 兼容接口（v1）以及前后端共享的内部接口（core/common）。所有 API 路由文件位于 `FastGPT/projects/app/src/pages/api/`，遵循 Next.js Pages Router 文件路由约定。

---

## 一、API 架构概述

### 1.1 基础路径

- **API 根**：`/api/`
- **对外 OpenAI 兼容 API 根**：`/api/v1/`（保留与 OpenAI SDK 兼容的请求/响应结构）
- **应用层内部 API 根**：`/api/core/`（应用、聊天、知识库、Agent、工作流等）
- **公共能力 API 根**：`/api/common/`（文件、系统初始化、埋点）
- **AI Proxy 透传 API 根**：`/api/aiproxy/`（系统管理员将请求转发到外部 AI Proxy 服务）
- **OpenAPI 规范导出**：`/api/openapi.json`

### 1.2 NextJS API Routes 架构

- 使用 Next.js Pages Router 的 `pages/api/**/*.ts` 文件路由：每个文件即一个端点。
- 所有处理器统一通过 `@/service/middleware/entry` 中的 `NextAPI` 包裹，提供：
  - 错误捕获与统一 `jsonRes` 响应格式
  - 请求日志、追踪
  - 频率限制中间件（`useIPFrequencyLimit`、`teamFrequencyLimit`）
  - 鉴权（`authCert`、`authApp`、`authDataset`、`authSkill`、`authUserPer`、`authSystemAdmin`）
- 入参/出参基于 `zod` Schema 定义，统一存放于 `FastGPT/packages/global/openapi/`，并在 OpenAPI 文档（`/api/openapi.json`）中注册。
- 入口文件示例：
  - 主对外接口：`FastGPT/projects/app/src/pages/api/v1/chat/completions.ts`
  - 内部接口示例：`FastGPT/projects/app/src/pages/api/core/app/create.ts`

### 1.3 认证方式

FastGPT 同时支持以下三类身份：

| 身份类型 | 请求头 | 说明 |
|---------|-------|-----|
| Web 登录 Token（Cookie） | 浏览器自动携带 Cookie | 前端管理后台默认方式，对应 `authToken: true` |
| 团队 / 应用 API Key（Bearer） | `Authorization: Bearer fastgpt-xxxxxxx` | 对外接入推荐方式，对应 `authApiKey: true` |
| 分享链接 / 团队空间 Token | 在 Body 中传递 `shareId + outLinkUid` 或 `teamId + teamToken` | 用于嵌入式聊天与跨团队协作场景 |

认证统一在 `FastGPT/packages/service/support/permission/auth/common.ts` 中通过 `authCert` 解析，并按需结合资源粒度的 `authApp` / `authDataset` / `authSkill` 等做权限校验。

### 1.4 通用请求 / 响应格式

- **请求格式**：`POST/PUT` 默认 `application/json`，文件上传使用 `multipart/form-data`（详见 `presign*` 系列）。
- **请求体大小**：默认上限 20MB（如 `completions.ts` 中 `bodyParser.sizeLimit: '20mb'`）。
- **响应格式**：统一通过 `@fastgpt/service/common/response` 中的 `jsonRes` 输出：
  ```jsonc
  {
    "code": 200,            // 业务码（200 表成功，其余见错误码表）
    "message": "",          // 错误信息（成功时为空）
    "data": { /* ... */ }   // 业务数据
  }
  ```
- **流式响应（SSE）**：`v1/chat/completions`、`core/chat/chatTest`、`core/workflow/debug` 等支持 `stream: true`，事件名见 `FastGPT/packages/global/core/workflow/runtime/constants.ts` 中的 `SseResponseEventEnum`（`answer` / `flowResponses` / `interactive` / `[DONE]` 等）。

### 1.5 错误码规范

错误码定义集中在 `FastGPT/packages/global/common/error/errorCode.ts`，并按业务模块拆分到 `code/app.ts`、`code/chat.ts`、`code/dataset.ts` 等子文件。常见 HTTP/业务码：

| Code | 含义 |
|------|------|
| 200  | 成功 |
| 400  | 参数校验失败（Zod） |
| 401  | 未认证 |
| 403  | `unAuthorization`，权限不足 |
| 404  | 资源不存在 |
| 405  | 方法不支持 |
| 406  | 内容协商失败 / 请求格式不被服务端接受 |
| 410  | 资源已删除 |
| 422  | 业务参数错误 |
| 429  | `tooManyRequest` / `uploadFileIntervalLimit`，频率限制 |
| 500  | 服务端错误 |
| 502  | 网关错误 |
| 503  | 服务不可用 |
| 504  | 网关超时 |
| 510  | `insufficientQuota`，额度不足 |
| 511  | `unAuthModel`，未授权模型 |
| 513  | `unAuthFile`，未授权文件 |
| 514  | `unAuthApiKey`，API Key 无效 |

业务级错误枚举定义见 `FastGPT/packages/global/common/error/code/*.ts`，例如 `ChatErrEnum.unAuthChat`、`SkillErrEnum.*`。

---

## 二、公开对外 API（v1，兼容 OpenAI）

源码目录：`FastGPT/projects/app/src/pages/api/v1/`

### 2.1 聊天补全（核心对外接口）

- **路径**：`POST /api/v1/chat/completions`
- **源码**：`FastGPT/projects/app/src/pages/api/v1/chat/completions.ts`
- **入参 Schema**：`CompletionsPropsSchema`（`FastGPT/packages/global/openapi/core/chat/completion/api.ts`）

**请求体字段**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `messages` | `ChatCompletionMessage[]` | 是（普通对话） | OpenAI 消息列表（含 `role`、`content`，以及多模态扩展） |
| `stream` | `boolean` | 否 | 是否流式返回，默认 `false` |
| `chatId` | `string` | 否 | 会话 ID；传入则自动续接历史，未传视为新对话 |
| `appId` | `ObjectId` | 视情况 | 使用 Token Cookie 时必填；使用应用 API Key 时可不传 |
| `customUid` | `string` | 否 | 分享场景下自定义用户标识 |
| `shareId` + `outLinkUid` | `string` | 否 | 通过分享链接调用时使用 |
| `teamId` + `teamToken` | `string` | 否 | 团队空间 Token 调用 |
| `variables` | `Record<string, any>` | 否 | 全局变量或工作流插件输入，默认 `{}` |
| `responseChatItemId` | `string` | 否 | 自定义响应消息 ID（不传自动生成 nanoid） |
| `detail` | `boolean` | 否 | 是否返回详细工作流响应（`responseData` / `newVariables`） |
| `retainDatasetCite` | `boolean` | 否 | 是否保留答案中的数据集引用标记 |
| `showSkillReferences` | `boolean` | 否 | 是否在响应中保留 Agent 技能引用 |
| `metadata` | `Record<string, any>` | 否 | 自定义元数据，落库到聊天记录 |

**响应格式**（非流式 `CompletionsResponseSchema`）：

```jsonc
{
  "id": "<chatId>",
  "model": "",
  "usage": { "prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 1 },
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "...",                 // detail=true 或工作流交互时为对象数组
        "reasoning_content": "..."        // 仅推理模型
      },
      "finish_reason": "stop",
      "index": 0
    }
  ],
  "responseData": [ /* 节点级详情，detail=true 时返回 */ ],
  "newVariables": { /* 工作流执行后变量，detail=true 时返回 */ }
}
```

**流式响应说明**（`stream=true`）：

- 走 SSE，事件类型见 `SseResponseEventEnum`：
  - `answer`：增量回答（兼容 OpenAI `choices[].delta.content`）
  - `flowNodeStatus` / `toolCall` / `toolParams` / `toolResponse`：工作流节点状态
  - `flowResponses`：仅在 `detail=true` 时输出整轮节点响应数据
  - `interactive`：命中交互节点
  - 终止时输出 `data: [DONE]`
- 同时 `recordAppUsage`、`updateApiKeyUsage`、`addOutLinkUsage` 异步累计计费。

**鉴权流程**（同一文件内三种分支）：

- `shareId + outLinkUid` → `authShareChat`
- `teamId + teamToken + appId` → `authTeamSpaceChat`
- 其他 → `authHeaderRequest`（解析 Cookie 或 `Authorization: Bearer <key>`）

### 2.2 语音转写

- **路径**：`POST /api/v1/audio/transcriptions`
- **源码**：`FastGPT/projects/app/src/pages/api/v1/audio/transcriptions.ts`
- **请求**：`multipart/form-data`，字段含音频文件、`appId`、`duration`、可选 `shareId/outLinkUid/teamId/teamToken`。
- **响应**：`{ data: <text> }`，使用默认 STT 模型完成转写并按 `duration` 计费。
- **特性**：IP 频率限制 1 秒 / 1 次（`useIPFrequencyLimit`）。

---

## 三、内部核心 API（按模块索引）

### 3.1 应用管理（`/api/core/app/`）

源码目录：`FastGPT/projects/app/src/pages/api/core/app/`

| HTTP | 路径 | 功能 | 关键参数 | 响应 |
|------|------|------|----------|------|
| POST | `/api/core/app/create` | 创建应用（普通/工作流/插件） | `parentId`、`name`、`avatar`、`type`、`modules`、`edges`、`chatConfig`、`templateId` | `{ appId }` |
| POST | `/api/core/app/update` | 更新应用元数据/工作流/聊天配置 | `appId` 等 | 成功标识 |
| GET  | `/api/core/app/detail` | 应用详情 | `appId` | `AppSchemaType` |
| GET  | `/api/core/app/list` | 应用列表（含分页/筛选） | `parentId`、`type` | `AppListItem[]` |
| GET  | `/api/core/app/getBasicInfo` | 应用基础信息 | `appId` | 简要信息 |
| GET  | `/api/core/app/getAppDatasetCollection` | 关联数据集合列表 | `appId` | `Collection[]` |
| GET  | `/api/core/app/getPermission` | 应用权限信息 | `appId` | 权限值 |
| POST | `/api/core/app/copy` | 复制应用 | `appId`、`name` | `{ appId }` |
| DELETE | `/api/core/app/del` | 删除应用 | `appId` | 成功标识 |
| POST | `/api/core/app/exportSkill` | 导出为 Agent Skill | `appId` | 包文件 |
| POST | `/api/core/app/transitionWorkflow` | 简易模式 → 工作流模式迁移 | `appId` | 工作流定义 |
| POST | `/api/core/app/resumeInheritPermission` | 恢复继承权限 | `appId` | 成功标识 |
| POST | `/api/core/app/folder/create` | 创建文件夹 | `name`、`parentId` | `{ folderId }` |
| GET  | `/api/core/app/folder/path` | 文件夹路径面包屑 | `parentId` | 路径数组 |
| POST | `/api/core/app/version/publish` | 发布新版本 | `appId`、`versionName` | `{ versionId }` |
| GET  | `/api/core/app/version/latest` | 最新版本 | `appId` | 版本数据 |
| GET  | `/api/core/app/version/list` | 版本列表（分页） | `appId` | 版本数组 |
| GET  | `/api/core/app/version/detail` | 版本详情 | `versionId` | 版本数据 |
| POST | `/api/core/app/version/update` | 更新版本（备注） | `versionId` | 成功标识 |
| POST | `/api/core/app/template/list` | 模板列表 | 类型筛选 | 模板数组 |
| GET  | `/api/core/app/template/detail` | 模板详情 | `templateId` | 模板数据 |
| POST | `/api/core/app/httpTools/create` | 创建 HTTP 工具 | API Schema | `{ id }` |
| POST | `/api/core/app/httpTools/update` | 更新 HTTP 工具 | `id` 等 | 成功标识 |
| POST | `/api/core/app/httpTools/runTool` | 调试运行 HTTP 工具 | `id`、入参 | 工具结果 |
| GET  | `/api/core/app/httpTools/getApiSchemaByUrl` | 通过 URL 解析 OpenAPI Schema | `url` | `OpenAPI` |
| POST | `/api/core/app/mcpTools/create` | 创建 MCP 工具 | MCP server 信息 | `{ id }` |
| POST | `/api/core/app/mcpTools/update` | 更新 MCP 工具 | `id` 等 | 成功标识 |
| GET  | `/api/core/app/mcpTools/getTools` | 列出 MCP server 工具 | `serverUrl` | 工具数组 |
| GET  | `/api/core/app/mcpTools/getChildren` | 获取子工具 | `parentId` | 工具数组 |
| POST | `/api/core/app/mcpTools/runTool` | 调试运行 MCP 工具 | `id`、入参 | 工具结果 |
| GET  | `/api/core/app/tool/getSystemToolTemplates` | 系统工具模板 | 类型 | 模板数组 |
| GET  | `/api/core/app/tool/getPreviewNode` | 预览工具节点定义 | `toolId` | 节点 |
| GET  | `/api/core/app/tool/getVersionList` | 工具版本列表 | `toolId` | 版本数组 |
| GET  | `/api/core/app/tool/path` | 工具分类路径 | `toolId` | 路径 |
| GET  | `/api/core/app/logs/list` | 应用调用日志（分页） | `appId`、时间区间 | 日志数组 |
| GET  | `/api/core/app/logs/exportLogs` | 导出日志 CSV | `appId`、时间区间 | 文件流 |
| GET  | `/api/core/app/logs/getUsers` | 日志中的用户去重 | `appId` | 用户数组 |
| GET  | `/api/core/app/logs/getLogKeys` | 日志可用筛选键 | `appId` | 字符串数组 |
| POST | `/api/core/app/logs/updateLogKeys` | 更新日志筛选键 | `appId`、`keys` | 成功标识 |

### 3.2 聊天管理（`/api/core/chat/`）

源码目录：`FastGPT/projects/app/src/pages/api/core/chat/`

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/core/chat/chatTest` | 工作流编辑器内调试聊天（流式 + 节点详情） |
| POST | `/api/core/chat/init` | 初始化聊天会话（加载 App 与历史） |
| POST | `/api/core/chat/team/init` | 团队空间下的会话初始化 |
| POST | `/api/core/chat/outLink/init` | 分享链接下的会话初始化 |
| GET  | `/api/core/chat/getHistories` | 历史会话列表（旧版） |
| GET  | `/api/core/chat/history/getHistories` | 历史会话列表（v2） |
| GET  | `/api/core/chat/history/getHistoryStatus` | 单会话生成状态 |
| POST | `/api/core/chat/history/markRead` | 标记历史已读 |
| POST | `/api/core/chat/history/updateHistory` | 修改历史标题/置顶等 |
| POST | `/api/core/chat/history/delHistory` | 删除单条历史 |
| POST | `/api/core/chat/history/batchDelete` | 批量删除历史 |
| POST | `/api/core/chat/history/clearHistories` | 清空历史 |
| POST | `/api/core/chat/delHistory` | 兼容旧版的删除接口 |
| POST | `/api/core/chat/clearHistories` | 兼容旧版清空接口 |
| POST | `/api/core/chat/updateHistory` | 兼容旧版更新接口 |
| GET  | `/api/core/chat/getPaginationRecords` | 分页拉取消息（旧） |
| GET  | `/api/core/chat/record/getPaginationRecords` | 分页拉取消息（v2） |
| GET  | `/api/core/chat/record/getRecords_v2` | 拉取消息（v2 完整） |
| GET  | `/api/core/chat/record/getResData` | 单条消息节点响应数据 |
| GET  | `/api/core/chat/record/getQuote` | 单条消息引用 |
| GET  | `/api/core/chat/record/getCollectionQuote` | 集合维度引用 |
| GET  | `/api/core/chat/record/getKeywordQuote` | 关键词引用 |
| GET  | `/api/core/chat/record/getSpeech` | 文本转语音 |
| POST | `/api/core/chat/record/delete` | 删除消息 |
| GET  | `/api/core/chat/getResData` | 兼容旧版节点响应数据 |
| GET  | `/api/core/chat/quote/getQuote` | 兼容旧版引用查询 |
| GET  | `/api/core/chat/assistant/getQuote` | Agent 助手引用 |
| GET  | `/api/core/chat/assistant/getRetrievalResults` | Agent 检索结果 |
| POST | `/api/core/chat/feedback/updateUserFeedback` | 用户点赞/点踩 |
| POST | `/api/core/chat/feedback/closeCustom` | 关闭自定义反馈卡片 |
| POST | `/api/core/chat/feedback/adminUpdate` | 管理员更新反馈 |
| GET  | `/api/core/chat/feedback/getFeedbackRecordIds` | 反馈消息 ID 列表 |
| POST | `/api/core/chat/feedback/updateFeedbackReadStatus` | 标记反馈已读 |
| POST | `/api/core/chat/correction/submit` | 提交答案纠正 |
| GET  | `/api/core/chat/correction/list` | 纠正列表 |
| POST | `/api/core/chat/correction/delete` | 删除纠正 |
| POST | `/api/core/chat/correction/export` | 导出纠正数据 |
| POST | `/api/core/chat/file/presignChatFilePostUrl` | 获取聊天文件上传预签名 URL |
| GET  | `/api/core/chat/file/presignChatFileGetUrl` | 获取聊天文件下载预签名 URL |
| GET  | `/api/core/chat/inputGuide/list` | 输入引导词列表 |
| POST | `/api/core/chat/inputGuide/create` | 新增输入引导词 |
| POST | `/api/core/chat/inputGuide/update` | 更新输入引导词 |
| POST | `/api/core/chat/inputGuide/delete` | 删除输入引导词 |
| POST | `/api/core/chat/inputGuide/deleteAll` | 清空输入引导词 |
| GET  | `/api/core/chat/inputGuide/query` | 查询匹配的引导词 |
| GET  | `/api/core/chat/inputGuide/countTotal` | 引导词总数统计 |
| POST | `/api/core/chat/helperBot/completions` | Helper Bot 聊天 |
| GET  | `/api/core/chat/helperBot/getRecords` | Helper Bot 历史 |
| POST | `/api/core/chat/helperBot/deleteRecord` | 删除 Helper Bot 记录 |
| POST | `/api/core/chat/helperBot/getFilePresign` | Helper Bot 文件上传预签名 |
| GET  | `/api/core/chat/helperBot/getFilePreviewUrl` | Helper Bot 文件预览 URL |
| GET  | `/api/core/chat/recentlyUsed` | 最近使用应用列表 |
| POST | `/api/core/chat/resume` | 流式中断后续传 |

### 3.3 知识库管理（`/api/core/dataset/`）

源码目录：`FastGPT/projects/app/src/pages/api/core/dataset/`

#### 知识库（Dataset）

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/core/dataset/create` | 创建知识库（含 API/网站/数据库等类型） |
| POST | `/api/core/dataset/createWithFiles` | 创建知识库并初始化文件 |
| GET  | `/api/core/dataset/detail` | 知识库详情 |
| GET  | `/api/core/dataset/list` | 知识库列表 |
| GET  | `/api/core/dataset/listWithChildren` | 包含子文件夹的列表 |
| GET  | `/api/core/dataset/paths` | 路径面包屑 |
| GET  | `/api/core/dataset/apps` | 关联应用 |
| POST | `/api/core/dataset/update` | 更新知识库元数据 |
| DELETE | `/api/core/dataset/delete` | 删除知识库 |
| POST | `/api/core/dataset/exportAll` | 导出所有数据 |
| POST | `/api/core/dataset/searchTest` | 检索测试 |
| GET  | `/api/core/dataset/getPermission` | 权限查询 |
| POST | `/api/core/dataset/resumeInheritPermission` | 恢复继承权限 |
| GET  | `/api/core/dataset/getdefaultPrompt` | 默认 Prompt |
| POST | `/api/core/dataset/folder/create` | 新建文件夹 |

#### 集合（Collection）

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/core/dataset/collection/create` | 通用创建集合 |
| POST | `/api/core/dataset/collection/create/fileId` | 通过文件 ID 创建 |
| POST | `/api/core/dataset/collection/create/link` | 通过链接创建 |
| POST | `/api/core/dataset/collection/create/text` | 通过纯文本创建 |
| POST | `/api/core/dataset/collection/create/template` | 通过模板创建 |
| POST | `/api/core/dataset/collection/create/images` | 图片集合 |
| POST | `/api/core/dataset/collection/create/localFile` | 本地上传 |
| POST | `/api/core/dataset/collection/create/backup` | 从备份导入 |
| POST | `/api/core/dataset/collection/create/apiCollection` | 外部 API 集合 v1 |
| POST | `/api/core/dataset/collection/create/apiCollectionV2` | 外部 API 集合 v2 |
| POST | `/api/core/dataset/collection/create/reTrainingCollection` | 重新训练集合 |
| POST | `/api/core/dataset/collection/create/custom/fileId` | 自定义-文件 |
| POST | `/api/core/dataset/collection/create/custom/link` | 自定义-链接 |
| POST | `/api/core/dataset/collection/create/custom/website` | 自定义-站点 |
| POST | `/api/core/dataset/collection/create/custom/template` | 自定义-模板 |
| GET  | `/api/core/dataset/collection/detail` | 集合详情 |
| GET  | `/api/core/dataset/collection/list` | 集合列表 v1 |
| GET  | `/api/core/dataset/collection/listV2` | 集合列表 v2 |
| GET  | `/api/core/dataset/collection/scrollList` | 滚动列表 |
| GET  | `/api/core/dataset/collection/paths` | 集合路径 |
| GET  | `/api/core/dataset/collection/read` | 读取集合内容 |
| GET  | `/api/core/dataset/collection/export` | 导出集合 |
| GET  | `/api/core/dataset/collection/check/duplicate` | 重名检查 |
| GET  | `/api/core/dataset/collection/trainingDetail` | 训练详情 |
| POST | `/api/core/dataset/collection/sync` | 同步集合（API/链接） |
| POST | `/api/core/dataset/collection/update` | 更新集合 |
| DELETE | `/api/core/dataset/collection/delete` | 删除集合 |
| POST | `/api/core/dataset/collection/resumeInheritPermission` | 恢复权限继承 |

#### 数据项（Data）

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/core/dataset/data/insertData` | 插入文本数据项 |
| POST | `/api/core/dataset/data/insertImages` | 插入图片数据项 |
| POST | `/api/core/dataset/data/pushData` | 批量推送（队列） |
| GET  | `/api/core/dataset/data/list` | 数据项列表 v1 |
| GET  | `/api/core/dataset/data/v2/list` | 数据项列表 v2 |
| GET  | `/api/core/dataset/data/detail` | 数据项详情 |
| GET  | `/api/core/dataset/data/getindex` | 索引信息 |
| GET  | `/api/core/dataset/data/getQuoteData` | 引用上下文 |
| GET  | `/api/core/dataset/data/getBatchPermission` | 批量权限校验 |
| POST | `/api/core/dataset/data/update` | 更新数据项 |
| DELETE | `/api/core/dataset/data/delete` | 删除数据项 |

#### 训练（Training）

| HTTP | 路径 | 功能 |
|------|------|------|
| GET  | `/api/core/dataset/training/getDatasetTrainingQueue` | 训练队列状态 |
| GET  | `/api/core/dataset/training/getTrainingDataDetail` | 训练数据详情 |
| GET  | `/api/core/dataset/training/getTrainingError` | 错误数据列表 |
| POST | `/api/core/dataset/training/updateTrainingData` | 更新训练数据 |
| POST | `/api/core/dataset/training/deleteTrainingData` | 删除训练数据 |
| POST | `/api/core/dataset/training/rebuildEmbedding` | 重建向量索引 |

#### 同义词 / 文件 / API 数据源 / 数据库类型

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/core/dataset/synonym/upload` | 上传同义词 |
| GET  | `/api/core/dataset/synonym/list` | 同义词列表 |
| GET  | `/api/core/dataset/synonym/download` | 下载同义词 |
| POST | `/api/core/dataset/synonym/delete` | 删除同义词 |
| POST | `/api/core/dataset/file/getPreviewChunks` | 上传后切片预览 |
| POST | `/api/core/dataset/file/presignDatasetFilePostUrl` | 知识库文件上传预签名 |
| GET  | `/api/core/dataset/apiDataset/list` | 外部 API 数据集列表 |
| GET  | `/api/core/dataset/apiDataset/getCatalog` | 外部 API 目录树 |
| GET  | `/api/core/dataset/apiDataset/getPathNames` | 外部 API 路径名称 |
| GET  | `/api/core/dataset/apiDataset/listExistId` | 已导入的 ID 列表 |
| POST | `/api/core/dataset/database/checkConnection` | 数据源连接测试 |
| GET  | `/api/core/dataset/database/getConfiguration` | 配置查询 |
| POST | `/api/core/dataset/database/createCollections` | 批量建集合 |
| POST | `/api/core/dataset/database/createStructureCollection` | 建结构化集合 |
| POST | `/api/core/dataset/database/detectChanges` | 检测数据变更 |
| POST | `/api/core/dataset/database/applyChanges` | 应用变更 |
| POST | `/api/core/dataset/database/preview` | 数据预览 |
| POST | `/api/core/dataset/database/searchTest` | 数据库检索测试 |

### 3.4 Agent 技能（`/api/core/agentSkills/`）

源码目录：`FastGPT/projects/app/src/pages/api/core/agentSkills/`

| HTTP | 路径 | 功能 | 关键参数 |
|------|------|------|---------|
| POST | `/api/core/agentSkills/create` | 新建 Agent Skill（含 LLM 生成 Markdown 描述与 zip 包） | `parentId`、`name`、`description`、`requirements`、`model`、`category`、`config`、`avatar` |
| POST | `/api/core/agentSkills/update` | 更新技能元数据 | `id`、待更新字段 |
| POST | `/api/core/agentSkills/edit` | 编辑技能（草稿态） | `id`、内容 |
| POST | `/api/core/agentSkills/save-deploy` | 保存并发布 | `id` |
| POST | `/api/core/agentSkills/copy` | 复制技能 | `id` |
| DELETE | `/api/core/agentSkills/delete` | 删除技能 | `id` |
| GET  | `/api/core/agentSkills/detail` | 技能详情 | `id` |
| GET  | `/api/core/agentSkills/list` | 技能列表（分页） | `parentId`、筛选项 |
| GET  | `/api/core/agentSkills/apps` | 关联应用 | `id` |
| POST | `/api/core/agentSkills/import` | 上传 zip 包导入 | 文件流 |
| GET  | `/api/core/agentSkills/export` | 导出 zip 包 | `id` |
| POST | `/api/core/agentSkills/resumeInheritPermission` | 恢复继承权限 | `id` |
| POST | `/api/core/agentSkills/folder/create` | 创建文件夹 | `name`、`parentId` |
| GET  | `/api/core/agentSkills/folder/path` | 文件夹路径 | `parentId` |
| POST | `/api/core/agentSkills/debugChat` | 调试 Skill 对话（流式） | `skillId`、`messages`、`config` |
| GET  | `/api/core/agentSkills/debugSession/list` | 调试会话列表 | `skillId` |
| POST | `/api/core/agentSkills/debugSession/delete` | 删除调试会话 | `sessionId` |
| GET  | `/api/core/agentSkills/debugSession/records` | 调试会话消息 | `sessionId` |
| POST | `/api/core/agentSkills/debugSession/chatItem/delete` | 删除调试消息 | `chatItemId` |
| GET  | `/api/core/agentSkills/version/list` | 版本列表 | `skillId` |
| POST | `/api/core/agentSkills/version/switch` | 切换版本 | `skillId`、`versionId` |
| POST | `/api/core/agentSkills/version/update` | 更新版本备注 | `versionId` |

### 3.5 工作流（`/api/core/workflow/`）

源码目录：`FastGPT/projects/app/src/pages/api/core/workflow/`

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/core/workflow/debug` | 单节点调试运行（接收 `nodes/edges/variables/query/history`，返回执行结果或流式事件） |
| GET  | `/api/core/workflow/getSandboxPackages` | 获取代码节点可用 NPM 包白名单 |
| POST | `/api/core/workflow/optimizeCode` | 调用 LLM 优化代码节点 |

> 注：工作流的「真正执行」入口是 `/api/v1/chat/completions` 与 `/api/core/chat/chatTest`；该目录主要服务于编辑器调试与代码节点辅助。

### 3.6 通用 API（`/api/common/`）

源码目录：`FastGPT/projects/app/src/pages/api/common/`

#### 文件（`/api/common/file/`）

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/common/file/presignTempFilePostUrl` | 获取临时文件上传预签名 URL（30 秒频率限制） |
| GET  | `/api/common/file/presignTempFileGetUrl` | 获取临时文件下载预签名 URL |
| POST | `/api/common/file/presignAvatarPostUrl` | 获取头像上传预签名 URL |
| GET  | `/api/common/file/read/[filename]` | 直接读取临时文件（鉴权后） |

#### 系统（`/api/common/system/`）

| HTTP | 路径 | 功能 |
|------|------|------|
| GET  | `/api/common/system/getInitData` | 获取系统初始化数据（模型列表、功能开关、分享配置等） |
| POST | `/api/common/system/unlockTask` | 解锁卡死任务（系统管理员） |

#### 埋点（`/api/common/tracks/`）

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/common/tracks/push` | 上报前端埋点事件 |

### 3.7 其他

| 路径 | 功能 |
|------|------|
| `GET /api/openapi.json` | 导出 OpenAPI 3.0 规范（聚合 `packages/global/openapi/` 下所有 zod schema） |
| `ALL /api/aiproxy/[...path]` | AI Proxy 透传，仅系统管理员可调用，转发到 `process.env.AIPROXY_API_ENDPOINT`，并自动注入 `Authorization: Bearer ${AIPROXY_API_TOKEN}` |
| `POST /api/aiproxy/api/createChannel` | AI Proxy 渠道创建（透传封装） |

### 3.8 评测框架（`/api/core/evaluation/`）

源码目录：`FastGPT/projects/app/src/pages/api/core/evaluation/`

评测框架用于对知识库问答质量进行系统化评估，支持自定义评测指标、批量评测任务和结果汇总。

#### 评测数据集（`evaluation/dataset/`）

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/core/evaluation/dataset/collection/create` | 创建评测集合 |
| GET  | `/api/core/evaluation/dataset/collection/list` | 评测集合列表 |
| GET  | `/api/core/evaluation/dataset/collection/listv2` | 评测集合列表 v2 |
| GET  | `/api/core/evaluation/dataset/collection/detail` | 评测集合详情 |
| POST | `/api/core/evaluation/dataset/collection/update` | 更新评测集合 |
| DELETE | `/api/core/evaluation/dataset/collection/delete` | 删除评测集合 |
| POST | `/api/core/evaluation/dataset/collection/deleteTask` | 删除集合关联任务 |
| GET  | `/api/core/evaluation/dataset/collection/failedTasks` | 失败任务列表 |
| POST | `/api/core/evaluation/dataset/collection/retryTask` | 重试单个任务 |
| POST | `/api/core/evaluation/dataset/collection/retryAllTask` | 重试全部失败任务 |
| POST | `/api/core/evaluation/dataset/collection/qualityAssessmentBatch` | 批量质量评估 |
| POST | `/api/core/evaluation/dataset/data/create` | 新增评测数据项 |
| GET  | `/api/core/evaluation/dataset/data/list` | 评测数据项列表 |
| GET  | `/api/core/evaluation/dataset/data/detail` | 评测数据项详情 |
| POST | `/api/core/evaluation/dataset/data/update` | 更新评测数据项 |
| DELETE | `/api/core/evaluation/dataset/data/delete` | 删除评测数据项 |
| POST | `/api/core/evaluation/dataset/data/import` | 批量导入评测数据 |
| POST | `/api/core/evaluation/dataset/data/smartGenerate` | LLM 智能生成评测数据 |
| POST | `/api/core/evaluation/dataset/data/qualityAssessment` | 单项质量评估 |

#### 评测指标（`evaluation/metric/`）

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/core/evaluation/metric/create` | 创建评测指标 |
| GET  | `/api/core/evaluation/metric/list` | 评测指标列表 |
| GET  | `/api/core/evaluation/metric/detail` | 评测指标详情 |
| POST | `/api/core/evaluation/metric/update` | 更新评测指标 |
| POST | `/api/core/evaluation/metric/debug` | 调试评测指标 |
| DELETE | `/api/core/evaluation/metric/delete` | 删除评测指标 |

#### 评测任务（`evaluation/task/`）

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/core/evaluation/task/create` | 创建评测任务 |
| GET  | `/api/core/evaluation/task/list` | 评测任务列表 |
| GET  | `/api/core/evaluation/task/detail` | 评测任务详情 |
| GET  | `/api/core/evaluation/task/stats` | 评测任务统计 |
| POST | `/api/core/evaluation/task/start` | 启动评测任务 |
| POST | `/api/core/evaluation/task/stop` | 停止评测任务 |
| POST | `/api/core/evaluation/task/retryFailed` | 重试失败项 |
| POST | `/api/core/evaluation/task/update` | 更新评测任务 |
| DELETE | `/api/core/evaluation/task/delete` | 删除评测任务 |
| GET  | `/api/core/evaluation/task/item/list` | 评测项列表 |
| GET  | `/api/core/evaluation/task/item/detail` | 评测项详情 |
| POST | `/api/core/evaluation/task/item/retry` | 重试单个评测项 |
| POST | `/api/core/evaluation/task/item/update` | 更新评测项 |
| DELETE | `/api/core/evaluation/task/item/delete` | 删除评测项 |
| POST | `/api/core/evaluation/task/item/export` | 导出评测结果 |

#### 评测汇总（`evaluation/summary/`）

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/core/evaluation/summary/create` | 创建评测汇总 |
| GET  | `/api/core/evaluation/summary/detail` | 评测汇总详情 |
| GET  | `/api/core/evaluation/summary/config/detail` | 汇总配置详情 |
| POST | `/api/core/evaluation/summary/config/update` | 更新汇总配置 |

### 3.9 插件管理（`/api/core/plugin/`）

源码目录：`FastGPT/projects/app/src/pages/api/core/plugin/`

管理 FastGPT 插件生态，支持管理员安装、解析、配置插件包，以及团队级插件的启用与查询。

#### 管理员插件管理（`plugin/admin/`）

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/core/plugin/admin/installWithUrl` | 通过 URL 安装插件 |
| POST | `/api/core/plugin/admin/pkg/parse` | 解析插件包 |
| POST | `/api/core/plugin/admin/pkg/presign` | 获取插件包上传预签名 URL |
| POST | `/api/core/plugin/admin/pkg/confirm` | 确认安装插件包 |
| DELETE | `/api/core/plugin/admin/pkg/delete` | 删除插件包 |
| GET  | `/api/core/plugin/admin/tool/list` | 插件工具列表 |
| GET  | `/api/core/plugin/admin/tool/detail` | 插件工具详情 |
| POST | `/api/core/plugin/admin/tool/update` | 更新插件工具 |
| DELETE | `/api/core/plugin/admin/tool/delete` | 删除插件工具 |
| POST | `/api/core/plugin/admin/tool/updateOrder` | 更新插件工具排序 |
| POST | `/api/core/plugin/admin/tool/app/create` | 为插件创建应用 |
| GET  | `/api/core/plugin/admin/tool/app/systemApps` | 插件关联系统应用列表 |
| POST | `/api/core/plugin/admin/tool/tag/create` | 创建插件标签 |
| POST | `/api/core/plugin/admin/tool/tag/update` | 更新插件标签 |
| DELETE | `/api/core/plugin/admin/tool/tag/delete` | 删除插件标签 |
| POST | `/api/core/plugin/admin/tool/tag/updateOrder` | 更新标签排序 |
| GET  | `/api/core/plugin/admin/marketplace/installed` | 已安装插件市场列表 |

#### 团队级插件（`plugin/team/`）

| HTTP | 路径 | 功能 |
|------|------|------|
| GET  | `/api/core/plugin/team/list` | 团队插件列表 |
| GET  | `/api/core/plugin/team/toolDetail` | 团队插件工具详情 |
| POST | `/api/core/plugin/team/toggleInstall` | 团队级启用/禁用插件 |

#### 插件工具标签（`plugin/toolTag/`）

| HTTP | 路径 | 功能 |
|------|------|------|
| GET  | `/api/core/plugin/toolTag/list` | 插件工具标签列表 |

### 3.10 模型管理（`/api/core/ai/model/`）

源码目录：`FastGPT/projects/app/src/pages/api/core/ai/model/`

管理 AI 模型配置（LLM、Embedding、Rerank、STT 等），支持增删改查、连通性测试与默认模型设置。

| HTTP | 路径 | 功能 |
|------|------|------|
| GET  | `/api/core/ai/model/list` | 模型列表（按类型筛选） |
| GET  | `/api/core/ai/model/detail` | 模型详情 |
| POST | `/api/core/ai/model/update` | 更新模型配置 |
| DELETE | `/api/core/ai/model/delete` | 删除模型 |
| POST | `/api/core/ai/model/test` | 连通性测试 |
| GET  | `/api/core/ai/model/getDefaultConfig` | 获取默认模型配置 |
| POST | `/api/core/ai/model/updateDefault` | 更新默认模型 |
| GET  | `/api/core/ai/model/getConfigJson` | 导出模型配置 JSON |
| POST | `/api/core/ai/model/updateWithJson` | 通过 JSON 批量导入更新模型 |
| GET  | `/api/core/ai/model/getMyModels` | 获取当前可用模型列表 |

### 3.11 用户与团队管理（`/api/support/user/`）

源码目录：`FastGPT/projects/app/src/pages/api/support/user/`

处理用户认证、账户管理、团队配置及团队配额管控。

#### 账户管理（`user/account/`）

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/support/user/account/preLogin` | 预登录（获取加密公钥） |
| POST | `/api/support/user/account/loginByPassword` | 密码登录 |
| POST | `/api/support/user/account/tokenLogin` | Token 免密登录（含重定向） |
| GET  | `/api/support/user/account/tokenLoginRedirect` | Token 登录回调重定向 |
| POST | `/api/support/user/account/loginout` | 退出登录 |
| POST | `/api/support/user/account/update` | 更新账户信息 |
| POST | `/api/support/user/account/updatePasswordByOld` | 通过旧密码修改密码 |
| POST | `/api/support/user/account/resetExpiredPsw` | 重置过期密码 |
| POST | `/api/support/user/account/checkPswExpired` | 检查密码是否过期 |
| POST | `/api/support/user/account/adminGenerateToken` | 管理员为指定用户生成 Token |
| GET  | `/api/support/user/account/adminGetUserTeams` | 管理员查询用户所属团队 |

#### 团队管理（`user/team/`）

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/support/user/team/update` | 更新团队信息 |
| GET  | `/api/support/user/team/plan/getTeamPlanStatus` | 查询团队套餐状态与额度 |
| GET  | `/api/support/user/team/limit/datasetSizeLimit` | 知识库大小限制 |
| GET  | `/api/support/user/team/limit/evalDatasetDataLimit` | 评测数据集数据项限制 |
| GET  | `/api/support/user/team/limit/evalDatasetLimit` | 评测数据集数量限制 |
| GET  | `/api/support/user/team/limit/evalMetricLimit` | 评测指标数量限制 |
| GET  | `/api/support/user/team/limit/evaluationTaskLimit` | 评测任务数量限制 |
| GET  | `/api/support/user/team/limit/exportDatasetLimit` | 数据集导出限制 |
| GET  | `/api/support/user/team/limit/webSyncLimit` | 网站同步限制 |
| POST | `/api/support/user/team/thirtdParty/checkUsage` | 第三方用量校验 |

### 3.12 外部链接（`/api/support/outLink/`）

源码目录：`FastGPT/projects/app/src/pages/api/support/outLink/`

管理 FastGPT 对外分享的多种渠道（Feishu、DingTalk、WeChat、WeCom 等），支持创建分享链接、回调处理和渠道配置。

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/support/outLink/create` | 创建外部链接 |
| POST | `/api/support/outLink/update` | 更新外部链接 |
| GET  | `/api/support/outLink/list` | 外部链接列表 |
| DELETE | `/api/support/outLink/delete` | 删除外部链接 |
| ALL  | `/api/support/outLink/feishu/[token]` | 飞书渠道回调处理 |
| ALL  | `/api/support/outLink/dingtalk/[token]` | 钉钉渠道回调处理 |
| ALL  | `/api/support/outLink/wecom/[token]` | 企业微信渠道回调处理 |
| ALL  | `/api/support/outLink/offiaccount/[token]` | 公众号渠道回调处理 |
| GET  | `/api/support/outLink/playground/config` | Playground 配置 |
| POST | `/api/support/outLink/playground/update` | 更新 Playground 配置 |
| POST | `/api/support/outLink/wechat/qrcode/generate` | 生成微信扫码登录二维码 |
| GET  | `/api/support/outLink/wechat/qrcode/status` | 轮询微信扫码状态 |
| POST | `/api/support/outLink/wechat/logout` | 注销微信 OutLink 会话 |

### 3.13 MCP 服务器管理（`/api/support/mcp/`）

源码目录：`FastGPT/projects/app/src/pages/api/support/mcp/`

管理 MCP（Model Context Protocol）服务器配置，支持 MCP 工具发现和调用。

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/support/mcp/create` | 创建 MCP 服务器配置 |
| POST | `/api/support/mcp/update` | 更新 MCP 服务器配置 |
| GET  | `/api/support/mcp/list` | MCP 服务器列表 |
| DELETE | `/api/support/mcp/delete` | 删除 MCP 服务器配置 |
| POST | `/api/support/mcp/server/toolList` | 列出 MCP 服务器可用工具 |
| POST | `/api/support/mcp/server/toolCall` | 调用 MCP 服务器工具 |

### 3.14 外部 OpenAPI 数据源（`/api/support/openapi/`）

源码目录：`FastGPT/projects/app/src/pages/api/support/openapi/`

管理外部 OpenAPI 数据源的配置与健康检查，用于将第三方 API 接入 FastGPT 知识库。

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/support/openapi/create` | 创建外部数据源 |
| POST | `/api/support/openapi/update` | 更新外部数据源 |
| GET  | `/api/support/openapi/list` | 外部数据源列表 |
| DELETE | `/api/support/openapi/delete` | 删除外部数据源 |
| POST | `/api/support/openapi/health` | 数据源健康检查 |

### 3.15 管理迁移 API（`/api/admin/`）

源码目录：`FastGPT/projects/app/src/pages/api/admin/`

系统管理员专用的数据迁移与清理脚本，用于在版本升级时执行数据库迁移。

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/admin/initv4132` | v4.13.2 数据迁移 |
| POST | `/api/admin/initv4140` | v4.14.0 数据迁移 |
| POST | `/api/admin/initv4141` | v4.14.1 数据迁移 |
| POST | `/api/admin/initv4143` | v4.14.3 数据迁移 |
| POST | `/api/admin/initv4144` | v4.14.4 数据迁移 |
| POST | `/api/admin/initv4145` | v4.14.5 数据迁移 |
| POST | `/api/admin/initv41451` | v4.14.51 数据迁移 |
| POST | `/api/admin/initv4147` | v4.14.7 数据迁移 |
| POST | `/api/admin/sf-initv630` | v6.3.0 SF 版数据迁移 |
| POST | `/api/admin/migrateToMilvus26` | Milvus 2.6 迁移 |
| POST | `/api/admin/initFeedbackFlags` | 初始化反馈标记字段 |
| POST | `/api/admin/clearInvalidData` | 清理无效数据 |
| POST | `/api/admin/support/appRegistration/create` | 创建应用注册 |

### 3.16 v2 API 与营销（`/api/v2/`、`/api/support/marketing/`）

#### v2 聊天 API（`v2/chat/`）

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/v2/chat/completions` | v2 版聊天补全（增强流式控制） |
| POST | `/api/v2/chat/stop` | 停止正在进行的聊天生成 |

#### 营销（`support/marketing/`）

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/support/marketing/fetchWorkflow` | 拉取营销工作流模板 |

### 3.17 其他 API 模块

以下模块为代理透传或单一功能端点，源码存在于 `projects/app/src/pages/api/` 但由外部系统驱动：

| 路径 | 功能 |
|------|------|
| `POST /api/plugin/getAccessToken` | 获取插件访问 Token（用于外部插件认证） |
| `POST /api/invoke/userInfo` | invoke 协议下查询调用用户信息 |
| `GET /api/system/file/[jwt]` | 通过 JWT 鉴权读取系统文件 |
| `GET /api/system/file/download/[token]` | 系统级文件下载（按 token 路径） |
| `GET /api/system/file/upload/[token]` | 系统级文件上传（按 token 路径） |
| `GET /api/system/img/[...id]` | 系统级图片访问 |
| `ALL /api/system/plugin/[...path]` | 系统插件代理 |
| `POST /api/support/wallet/usage/createTrainingUsage` | 创建训练用量记录 |
| `ALL /api/proApi/[...path]` | Pro API 透传代理（catch-all） |
| `ALL /api/lafApi/[...path]` | Laf API 透传代理（catch-all） |
| `ALL /api/marketplace/[...path]` | 插件市场 API 透传代理（catch-all） |

---

## 四、API 认证说明

### 4.1 获取 API Key

1. 登录 FastGPT，在 **账号 → API Key** 中签发团队级 Key（用于跨应用访问）。
2. 在 **应用详情 → 接入 → API 接入** 中签发应用级 Key（更推荐，自动绑定 `appId`）。
3. Key 形如 `fastgpt-xxxxxxxxxxxxx`；同一团队可创建多把 Key 并按用量记账。

### 4.2 请求头格式

```http
POST /api/v1/chat/completions HTTP/1.1
Host: <fastgpt-host>
Content-Type: application/json
Authorization: Bearer fastgpt-xxxxxxxxxxxxx
```

- 应用级 Key：可省略 `appId`，由 Key 绑定。
- 团队级 Key：必须显式传 `appId`。
- Web 浏览器：携带登录 Cookie 即可，无需 Bearer。
- 分享链接：使用 `shareId + outLinkUid`，无需 Bearer，但需要在 Body 中传递。

### 4.3 鉴权失败响应

```json
{ "code": 514, "message": "API key 无效或已被禁用", "data": null }
```

参考 `FastGPT/packages/global/common/error/errorCode.ts` 的 `ERROR_RESPONSE` 表，`code` 为业务码，HTTP 状态默认 500，特殊情况下通过 `httpStatus` 字段覆盖。

---

## 五、速率限制和配额

| 维度 | 实现位置 | 默认策略 |
|------|---------|---------|
| 团队聊天 QPM | `teamFrequencyLimit({ type: LimitTypeEnum.chat })` 于 `v1/chat/completions` | 按团队套餐 `chatRequestPerMinute` 限制（超出返回 `429 tooManyRequest`） |
| IP 转写频率 | `useIPFrequencyLimit({ id: 'transcriptions', seconds: 1, limit: 1 })` | 同一 IP 每秒最多 1 次转写 |
| 文件上传频率 | `authFrequencyLimit({ eventId: '<tmbId>-uploadfile' })` 于 `presignTempFilePostUrl` | 30 秒窗口，按团队套餐 `maxUploadFileCount` 限制 |
| 套餐额度 | `getTeamPlanStatus({ teamId })` + `recordAppUsage` / `updateApiKeyUsage` | 余额不足返回 `510 insufficientQuota` |
| Token / 模型授权 | `authModel`、`unAuthModel` | 未授权返回 `511 unAuthModel` |
| 全局错误码 | `ERROR_RESPONSE` 中的 `429 tooManyRequest` / `429 uploadFileIntervalLimit` | 通用频率限制响应 |

> 应用级 API Key 的实际用量在 `updateApiKeyUsage` 中按工作流 `flowUsages.totalPoints` 累计，分享链接使用 `addOutLinkUsage` 单独计费，可在「使用记录」面板审计。

---

## 六、相关源码索引

| 关注点 | 路径 |
|--------|------|
| 主对外接口 | `FastGPT/projects/app/src/pages/api/v1/chat/completions.ts` |
| 对外接口入参 Schema | `FastGPT/packages/global/openapi/core/chat/completion/api.ts` |
| 工作流分发引擎 | `FastGPT/packages/service/core/workflow/dispatch/index.ts` |
| 通用 NextAPI 中间件 | `FastGPT/projects/app/src/service/middleware/entry.ts` |
| 鉴权入口 | `FastGPT/packages/service/support/permission/auth/common.ts` |
| 错误码总表 | `FastGPT/packages/global/common/error/errorCode.ts` |
| OpenAPI 规范导出 | `FastGPT/projects/app/src/pages/api/openapi.json.ts` |
| AI Proxy 透传 | `FastGPT/projects/app/src/pages/api/aiproxy/[...path].ts` |

---

## 七、近期新增 API（基于 develop-1.3.0 git 历史）

> 此节归纳近 3 个月新增/重构的 API 端点，便于补全前文索引盲区。已在前文表格中出现的端点不再重复列出。

### 7.1 模型训练（`/api/core/train/`）

源码目录：`FastGPT/projects/app/src/pages/api/core/train/`

#### Embedding 训练任务

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/core/train/embedding/task/create` | 创建 Embedding 训练任务 |
| GET  | `/api/core/train/embedding/task/list` | 训练任务列表（按 trainsetId 过滤） |
| GET  | `/api/core/train/embedding/task/detail` | 训练任务详情 |
| POST | `/api/core/train/embedding/task/cancel` | 取消运行中的任务 |
| POST | `/api/core/train/embedding/task/retry` | 失败任务重试 |
| DELETE | `/api/core/train/embedding/task/delete` | 删除任务 |
| GET  | `/api/core/train/embedding/task/eval-dataset` | 训练评测数据集 |
| GET  | `/api/core/train/embedding/task/eval-report` | 训练前后评测报告（召回率/MRR 等） |

#### Embedding 训练样本集（trainset）

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/core/train/embedding/trainset/create` | 创建样本集 |
| GET  | `/api/core/train/embedding/trainset/list` | 样本集列表 |
| GET  | `/api/core/train/embedding/trainset/detail` | 样本集详情 |
| DELETE | `/api/core/train/embedding/trainset/delete` | 删除样本集 |
| POST | `/api/core/train/embedding/trainset/data/create` | 新增样本数据 |
| GET  | `/api/core/train/embedding/trainset/data/list` | 样本数据列表 |
| POST | `/api/core/train/embedding/trainset/data/update` | 更新样本数据 |
| DELETE | `/api/core/train/embedding/trainset/data/delete` | 删除样本数据 |
| POST | `/api/core/train/embedding/trainset/data/generate` | LLM 自动扩充样本（stream-based pipeline） |

#### Rerank 训练任务

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/core/train/rerank/task/create` | 创建 Rerank 训练任务 |
| GET  | `/api/core/train/rerank/task/list` | 训练任务列表（按 trainsetId 过滤） |
| GET  | `/api/core/train/rerank/task/detail` | 训练任务详情 |
| POST | `/api/core/train/rerank/task/cancel` | 取消运行中的任务 |
| POST | `/api/core/train/rerank/task/retry` | 失败任务重试 |
| DELETE | `/api/core/train/rerank/task/delete` | 删除任务 |
| GET  | `/api/core/train/rerank/task/eval-dataset` | 训练评测数据集 |
| GET  | `/api/core/train/rerank/task/eval-report` | 训练前后评测报告 |

> Rerank 训练任务接口与 Embedding 同形结构，另有 `trainset` 子模块（create/list/detail/delete）和 `trainset/data` 子模块（create/list/update/delete/generate），不再赘述。源码位于 `train/rerank/`。

### 7.2 微信 OutLink（`/api/support/outLink/wechat/`）

源码目录：`FastGPT/projects/app/src/pages/api/support/outLink/wechat/`

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/support/outLink/wechat/qrcode/generate` | 生成微信扫码登录二维码（含 ticket） |
| GET  | `/api/support/outLink/wechat/qrcode/status` | 轮询扫码状态（pending / scanned / confirmed / expired） |
| POST | `/api/support/outLink/wechat/logout` | 注销微信 OutLink 会话 |

### 7.3 Helper Bot（`/api/core/chat/helperBot/`）

> 已在第 3.2 节列出，但与普通对话隔离运行；不计费、独立历史存储，用于系统内置助手与文档问答。

### 7.4 聊天恢复与状态

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/core/chat/resume` | 流式中断后续传 SSE（基于 `chatId + responseChatItemId`） |
| GET  | `/api/core/chat/history/getHistoryStatus` | 单会话生成状态查询 |
| POST | `/api/core/chat/history/markRead` | 标记历史已读 |
| GET  | `/api/core/chat/quote/getQuote` | 兼容旧版引用查询 |
| GET  | `/api/core/chat/record/getQuote` | v2 单条消息引用 |
| POST | `/api/core/chat/correction/export` | 导出答案纠正数据 |

### 7.5 知识库新增

| HTTP | 路径 | 功能 |
|------|------|------|
| GET  | `/api/core/dataset/listWithChildren` | 列出含子文件夹的数据集（扁平展开） |
| GET  | `/api/core/dataset/apps` | 查询关联当前数据集的应用列表（删除前置校验） |
| POST | `/api/core/dataset/collection/resumeInheritPermission` | Collection 级权限恢复继承 |
| POST | `/api/core/dataset/collection/create/custom/website` | 自定义站点导入（统一文件、FAQ、网页导入逻辑） |
| GET  | `/api/core/dataset/data/getBatchPermission` | 数据项批量权限校验 |

### 7.6 通用 / 系统 / 文件

| HTTP | 路径 | 功能 |
|------|------|------|
| GET  | `/api/common/file/presignTempFileGetUrl` | 获取临时文件下载预签名 URL |
| GET  | `/api/system/file/upload/[token]` | 系统级文件上传（按 token 路径） |
| GET  | `/api/system/file/download/[token]` | 系统级文件下载（按 token 路径） |
| POST | `/api/admin/initv4147` | v4.14.7 数据迁移脚本（管理员） |
| POST | `/api/admin/sf-initv630` | v6.3.0 SF 版数据迁移脚本（管理员） |
| POST | `/api/admin/migrateToMilvus26` | Milvus 2.6 迁移脚本（管理员） |

### 7.7 沙箱（`/api/core/sandbox/`、`/api/core/ai/sandbox/`）

| HTTP | 路径 | 功能 |
|------|------|------|
| ALL  | `/api/core/sandbox/proxyAuth` | code-server 鉴权代理 |
| POST | `/api/core/sandbox/proxyCSPassword` | code-server 密码代理（修复未鉴权 RCE） |
| GET  | `/api/core/ai/sandbox/list` | 沙箱文件列表 |
| GET  | `/api/core/ai/sandbox/read` | 读取沙箱文件 |
| POST | `/api/core/ai/sandbox/write` | 写入沙箱文件 |
| GET  | `/api/core/ai/sandbox/download` | 下载沙箱文件 |
| GET  | `/api/core/ai/sandbox/checkExist` | 检查沙箱文件存在 |
| GET  | `/api/core/ai/sandbox/getHtmlPreviewLink` | 获取 HTML 预览链接（多媒体预览） |
| GET  | `/api/core/ai/record/getRecord` | AI Sandbox 操作记录 |

### 7.8 应用 / 工具相关补充

| HTTP | 路径 | 功能 |
|------|------|------|
| POST | `/api/core/app/exportSkill` | 应用导出为 Agent Skill（zip 包） |
| GET  | `/api/core/app/logs/getUsers` | 应用调用日志的去重用户 |
| GET  | `/api/core/app/mcpTools/getTools` | 列出 MCP server 工具 |
| POST | `/api/core/app/mcpTools/runTool` | 调试运行 MCP 工具 |
| GET  | `/api/core/workflow/getSandboxPackages` | 工作流代码节点可用包白名单 |
| POST | `/api/invoke/userInfo` | invoke 协议下查询调用用户信息 |
