# Workflow 输入文件上下文统一设计

## 1. 背景

Workflow 输入文件目前以 URL 字符串贯穿 AI Chat、ToolCall、AgentV2、ReadFiles 和
Sandbox。URL 同时承担模型访问地址、服务端下载地址、文件类型推断和去重标识，导致同源
绝对 URL、相对下载短链和外部 URL 容易被错误转换。

尤其需要避免以下行为：

- 根据 `requestOrigin`、`FE_DOMAIN` 或 URL 前缀推断文件权限；
- 将用户输入的相对 URL 交给内部 Axios；
- 让模型或节点通过新 URL 扩大本轮 Workflow 可读取的文件集合；
- 使用模型 URL 作为私有对象的服务端读取来源。

本期引入请求级、只读的 `WorkflowFileContext`。它在 `dispatchWorkFlow` 入口统一处理当前
query、histories 和全局文件变量，并允许交互恢复入口登记 `fileSelect` 文件。下游消费者
不能登记文件；Context 未命中的绝对 HTTP(S) URL 按节点生成的外链处理。

## 2. 本期范围

### 2.1 包含

- 当前 query 中的文件；
- histories 中 Human 消息携带的文件；
- Workflow 全局文件变量和交互表单 `fileSelect` 文件；
- AI Chat、ToolCall、AgentV2、ReadFiles 和 Sandbox 对上述文件的消费；
- 私有 chat object key 的归属校验；
- 外部绝对 HTTP(S) URL 的 SSRF 防护读取；
- 请求级文件数量和单文件大小限制。

### 2.2 不包含

- Workflow 运行期间由普通节点、Plugin 或 Dataset Search 新产生的文件登记；
- Workflow 文件变量的存储结构迁移；
- 跨请求持久化 `WorkflowFileRef`；
- 修改聊天数据库中的现有文件格式；
- 通过 signed alias 反推业务归属；
- Context clone、分支注册和合并。

## 3. 核心原则

### 3.1 key 是私有文件的可信来源

私有文件必须携带 `key`。Workflow 入口使用 `parseChatFileS3Key` 或
`isAuthorizedChatFileS3Key` 校验 key 是否属于根 Workflow：

```text
key
  -> sourceType
  -> sourceId
  -> uid
  -> chatId
  -> 与根 Workflow 鉴权上下文逐项匹配
```

匹配使用根 `dispatchWorkFlow` 的 `runningAppInfo`、`uid` 和 `chatId`。Child Workflow 不得
使用 child app 的身份重新解释父 Workflow 输入文件。

归属匹配失败时直接拒绝。不能把失败的私有 key 降级成外部 URL。

### 3.2 signed URL 只用于模型访问

signed URL 不参与权限判断。私有 key 校验通过后，每个 key 在一次 Workflow 中最多签发
一次两小时有效的绝对 HTTP(S) URL，并在请求内复用。

如果文件域名配置无法生成绝对 HTTP(S) URL，入口应报配置错误，不能生成相对 URL。

### 3.3 服务端读取与模型 URL 分离

- 私有 chat object：FastGPT 服务端通过 S3 client 直接读取；
- 外部 HTTP(S) URL：FastGPT 服务端通过带 SSRF 防护的 Axios 读取；
- 模型只接收 `modelUrl`；
- 相对 URL、protocol-relative URL 和非 HTTP(S) 协议一律不能进入读取链路。

### 3.4 Context 只读

只有 Workflow 输入适配器可以通过独立 `WorkflowFileRegistrar` 登记文件，包括根入口的
query/history/全局变量和交互恢复入口的 `fileSelect`。节点、模型工具参数和下游消费者只能
查询已登记 Ref，不能在查询失败时自动注册新外链。未命中的绝对 HTTP(S) URL 可作为节点
生成的外链消费，但不写入 Context；相对 URL 直接拒绝。

## 4. 数据模型

```ts
export type WorkflowFileSource =
  | {
      type: 'chatObject';
      objectKey: string;
    }
  | {
      type: 'externalHttp';
      url: string;
    };

export type WorkflowFileRef = {
  id: string;
  name: string;
  type: ChatFileTypeEnum;
  modelUrl: string;
  source: WorkflowFileSource;
};

export type WorkflowFileLimits = {
  maxFiles: number;
  maxBytesPerFile: number;
};

export type WorkflowFileContext = {
  resolve: (urlOrId: string) => WorkflowFileRef | undefined;
  resolveChatFile: (url: string) => UserChatItemFileItemType | undefined;
  getIdentity: (urlOrId: string) => string | undefined;
  read: (target: string | WorkflowFileRef) => Promise<WorkflowFileReadResult>;
  limits: WorkflowFileLimits;
};
```

Context 不暴露 `register`、`clone` 或文件枚举接口。内部至少维护：

- `byId`：服务端生成 file id 到 Ref；
- `byRuntimeUrl`：本轮 `modelUrl` 到 Ref；
- `byIdentity`：私有 key 或完整外部 URL 到 Ref，用于去重。

登记能力通过独立的 `WorkflowFileRegistrar` 只传给受控输入适配器，不属于下游只读
`WorkflowFileContext` 接口。

## 5. Workflow 入口

入口处理顺序：

```text
完成 Workflow/Chat 鉴权
  -> 计算根 Workflow 文件 scope
  -> 计算 maxFiles/maxBytesPerFile
  -> 扫描 query + histories + 全局文件变量
  -> 校验 chat object key 归属
  -> 校验外链必须为绝对 HTTP(S)
  -> 对私有 key 按请求缓存签发两小时 modelUrl
  -> 按 key/完整外链 URL 去重并建立只读 Context
  -> 将 FileContext 挂载到 WorkflowContext
  -> 开始节点调度
```

### 5.1 Query

- 带 key：完整校验 `sourceType/sourceId/uid/chatId`，失败则拒绝本轮 Workflow；
- 无 key：只允许绝对 HTTP(S) URL，并继续应用 `fileUrlWhitelist`；
- 其他 URL：拒绝本轮 Workflow。

### 5.2 Histories

- 带 key：使用根 Workflow scope 校验并签发 URL；
- 无 key的绝对 HTTP(S) URL：登记为外链；
- 无 key的相对或非法 URL：不登记，使用该文件时返回不可用，不能交给内部 Axios；
- 无关历史文件不可用时，不能阻塞整轮 Workflow。

入口只登记来源和签发 URL，不下载所有历史文件正文。正文继续按消费者需求懒加载。

### 5.3 全局变量和交互 fileSelect

- 全局文件变量只在 `WorkflowVariableState.create` 初始化时登记，后续节点 `set()` 不得扩展 Context；
- 交互恢复入口只登记当前表单配置为 `fileSelect` 的值；
- 带 key 的值必须按根 Workflow scope 校验，并按私有对象处理；
- 无 key 的绝对 HTTP(S) URL 登记为外链；其他值拒绝。

## 6. 读取规则

### 6.1 私有对象

`WorkflowFileContext.read` 根据 Ref 中已校验的 bucket/objectKey 使用 S3 client：

1. 先读取 metadata；
2. `contentLength` 超过 `maxBytesPerFile` 时拒绝；
3. 下载流再次按累计字节数限制；
4. 返回 Buffer、filename 和 contentType。

### 6.2 外部 URL

外部 URL 始终使用带 SSRF 防护的 Axios：

- 只允许 `http:` 和 `https:`；
- 保留 `fileUrlWhitelist`；
- SSRF Axios 负责 DNS、metadata 地址和逐跳重定向检查；
- 先检查 `Content-Length`，流式下载时再次限制累计字节数；
- 禁止使用 `pickOutboundAxios` 或任何内部相对路径 Axios。

Raw-text 缓存只能在文件引用完成授权后查询：已登记文件使用 Context identity；未登记动态
外链必须先通过绝对 HTTP(S)、域名白名单和内部地址检查，不能通过缓存命中绕过出站策略。

### 6.3 大小限制

`dispatchWorkFlow` 接受可选的 `maxFileSize`（字节）。调用入口可以根据团队套餐和系统限制
计算后传入；本期未传入时固定使用 2GB。

该限制约束 FastGPT 服务端读取。模型提供商直接拉取外部 `modelUrl` 时，不经过 FastGPT
下载链路，因此不计入服务端读取限制。

## 7. 消费者

### 7.1 AI Chat

- 已登记文档由 Context 统一读取；未登记绝对 HTTP(S) URL 由 SSRF Axios 读取；
- 图片、音频、视频默认使用 `modelUrl`；
- LLM 层不感知 Workflow Context；`shouldLoadMediaAsBase64` 为真时统一使用 AI 层已有的
  下载与 Base64 转换能力，否则把绝对 `modelUrl` 直接交给模型。

### 7.2 ToolCall 和 AgentV2 read_file

- 模型只提交 file id；
- file id 必须命中节点已知文件映射；
- 映射 URL 命中 Context 时直读私有对象，未命中的绝对 HTTP(S) URL 按外链读取；
- 未知 id 和相对 URL 返回文件不可用，不能注册新外链；
- 文档解析继续复用 `core/chat/fileContext.ts`。

### 7.3 ReadFiles

ReadFiles 的字符串 URL 输入保持兼容：命中 Context 时走 Context reader，未命中的绝对
HTTP(S) URL 走 SSRF Axios，相对 URL 不可读取。

### 7.4 Sandbox

Workflow 显式向 Agent 和 ToolCall Sandbox 文件注入步骤传入组合读取函数：命中
WorkflowFileContext 时读取 Buffer，未命中的绝对 URL 交给带 SSRF 防护的 Sandbox reader。
Sandbox 通用模块不引用 Workflow，也不使用 `requestOrigin`、相对 URL 或内部 Axios。

### 7.5 Child、Loop 和 Parallel

根 Workflow、Child、Loop 和 Parallel 共享同一请求级 Context，不需要 clone 或 merge。
Context 对消费者保持只读；只有根输入初始化和交互恢复适配器持有 registrar。

## 8. 兼容策略

- 文件类型、名称和 key 等运行态元数据统一由 WorkflowFileContext 提供，不再维护额外的
  query URL Map；
- WorkflowFileContext 复用 Workflow 自己的 AsyncLocalStorage，并由 Workflow 调用方显式传给
  Chat/Sandbox；`core/ai` 和 `core/chat` 不得反向引用 `core/workflow`；
- 字符串 URL 运行值继续保留；
- keyless 历史绝对 URL 按外链处理；
- Context 未命中的绝对 HTTP(S) URL 按节点生成外链处理，但不登记；
- keyless 历史相对 URL 不再通过内部 Axios 读取；
- AgentV2 的 `normalizeAgentServerFileUrl` 和 `internalUrl` 过渡实现应删除；
- Workflow 以外的普通聊天文件链路暂不纳入本期 Context，但共享读取函数不能再接受相对 URL。

## 9. 测试要求

### 9.1 Context

- query/history 私有 key 归属校验成功；
- sourceType/sourceId/uid/chatId 任一不匹配时拒绝；
- 同一个 key 在 query/history 中只签发一次并只创建一个 Ref；
- 外部绝对 HTTP(S) URL 可登记；
- 相对 URL、protocol-relative、`file:`、`data:`、`ws:` 被拒绝或跳过；
- `fileUrlWhitelist` 继续生效；
- `resolve` 不会自动登记未知绝对 URL。
- 全局文件变量只在初始化时登记，节点更新不会扩展 Context；
- 交互 `fileSelect` 的私有 key 和外链均可登记；

### 9.2 读取

- 私有对象通过 S3 client 读取；
- 外链通过 SSRF Axios 读取；
- 私有对象和外链均执行 header/metadata 与流式双重大小限制；
- 私有对象读取不调用 HTTP；
- 相对 URL 不进入任何 Axios。

### 9.3 消费者

- AI Chat、ToolCall、AgentV2、ReadFiles 优先使用同一 Context，并支持安全外链回退；
- Agent history 和当前输入都保留绝对 modelUrl；
- read_file 未知 id 无法读取；
- Agent 和 ToolCall Sandbox 注入使用 Context/SSRF 外链组合 reader；
- 不可用的无关 history 文件不阻塞本轮请求。

## 10. TODO

- [x] 新增只读 `WorkflowFileContext` 和入口准备函数；
- [x] 为 `dispatchWorkFlow` 增加 `maxFileSize`，创建并挂载 Context；
- [x] `parseUrlToFileType` 优先读取 Context 文件元数据；
- [x] 统一 `core/chat/fileContext.ts` 的 Workflow 文件读取；
- [x] 保持 AI Chat 多模态 Base64 与 Workflow Context 解耦；
- [x] 迁移 ToolCall、AgentV2 和 ReadFiles；
- [x] 迁移 Sandbox 文件注入；
- [x] 登记全局文件变量和交互 `fileSelect` 输入；
- [x] 为 Context 未命中的绝对 URL 增加 SSRF 外链回退；
- [x] 删除 AgentV2 `requestOrigin/internalUrl` 过渡逻辑；
- [x] 补齐 Context、读取器和消费者测试；
- [x] 运行全量测试；Admin 既有批处理性能用例在全量并发下超时，隔离复跑 31/31 通过。

## 11. 相关代码

- `packages/service/core/workflow/utils/context.ts`
- `packages/service/core/workflow/utils/fileContext.ts`
- `packages/service/core/workflow/dispatch/index.ts`
- `packages/service/core/chat/fileContext.ts`
- `packages/service/core/workflow/dispatch/ai/chat/chatMessages.ts`
- `packages/service/core/workflow/dispatch/ai/toolcall/tools/file.ts`
- `packages/service/core/workflow/dispatch/ai/agent/adapter/userContext.ts`
- `packages/service/core/workflow/dispatch/ai/agent/sub/file/index.ts`
- `packages/service/core/ai/sandbox/application/file.ts`
- `packages/service/core/workflow/dispatch/tools/readFiles.ts`
- `packages/service/common/api/axios.ts`
- `packages/service/common/s3/sources/chat/key.ts`
