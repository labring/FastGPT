# AI Proxy 租户分组渠道（Group Channel）架构设计与 FastGPT 集成方案

> **文档归档路径**：`.agents/design/model/aiproxy-integration-and-branch-diff.md`  
> **适用分支**：`feat/group-model`  
> **关联底层**：[labring/aiproxy#621 - feat: group channel](https://github.com/labring/aiproxy/pull/621)  
> **核心目标**：统一收敛 AI Proxy 租户渠道（PR #621）能力分析与 FastGPT 架构设计，明确 Member 级多租户安全隔离边界，确立模型管理与 AI Proxy 的解耦架构、数据面路由规则及平滑迁移方案。

---

## 一、架构背景与系统定位

以往 AI Proxy 主要作为全局统一反向代理，所有渠道均为系统共享。PR #621 引入了原生 **Group Channel（租户分组渠道）** 体系，建立了“全局系统渠道（Global Channels）”与“租户分组渠道（Group Channels）”双轨并行的架构：

```mermaid
flowchart TD
    subgraph FastGPT["FastGPT (feat/group-model)"]
        UI["前端视图 (模型管理 / 渠道管理 / 调用日志 / 监控仪表盘)"]
        Service["服务端 / 渠道业务逻辑 (权限控制 / 关联计算 / 防误删保护)"]
        Client["AIProxyClient (基础设施防腐层 / 错误统一透传)"]
        RelayReq["数据面推理请求 (LLM / Embedding / Rerank / STT / TTS)"]
    end

    subgraph AIProxy["AI Proxy 内核 (PR #621)"]
        Router["路由分发器 (解析 X-Aiproxy-Group & Mode Headers)"]
        GlobalPool[("系统全局渠道池 (Global Channels)")]
        GroupPool[("租户私有渠道池 (Group Channels, 事务内自动建组)")]
        Obs["可观测性中心 (租户日志检索 / 导出 / 时序 Dashboard)"]
    end

    UI --> Service --> Client --> AIProxy
    RelayReq -->|带入 Scope Headers| Router
    Router -->|global 模式| GlobalPool
    Router -->|own 模式| GroupPool
    AIProxy --> Obs
```

### 核心定位决策：
1. **AI Proxy 为标配底座（无条件常驻）**：
   彻底去除 `show_aiproxy` 等动态特性开关。只要具备模型管理权限的成员，在模型管理页面均常驻展示渠道管理、调用日志与监控分析能力。
2. **彻底解耦，单一事实源**：
   AI Proxy 作为渠道物理配置与中继转发的单一事实源；FastGPT 维护业务模型实体与显示名。两端通过模型名（`model`）在内存中动态映射，彻底废弃旧版分布式租约锁（`lease.ts`）以及在模型增删改时强写渠道 `models` 数组的反模式。

---

## 二、AI Proxy 核心能力与职责边界

明确 AI Proxy 的能力边界是避免架构劣化的关键：

| 维度 | AI Proxy 能力范畴（PR #621） | AI Proxy 不负责的范畴（FastGPT 职责） |
| :--- | :--- | :--- |
| **渠道管理** | 提供系统/Group 渠道完整 CRUD，支持 `batch_delete` 和 `batch_status`；通过 `ensureGroups` 原子建组，调用方无需预建 Group。 | 控制谁能操作渠道（团队 RBAC 权限）、渠道名称重名校验、前端展示交互。 |
| **路由转发** | Header 驱动路由：<br>- `X-Aiproxy-Group: <groupId>`<br>- `X-Aiproxy-Group-Channel-Mode: own / global`；<br>支持加权轮询、智能降权与熔断。 | 将内部业务 `modelId` 解析为实际模型名 `model`，注入正确的 Owner 路由 Header。 |
| **模型实体** | 仅维护渠道支持的模型名字符串列表（`models: []string`），无实体概念。 | 维护模型实体（`modelId`、类型、价格配置、权限、知识库/工作流绑定关系）。 |
| **依赖计算** | 仅根据模型名做转发匹配。 | 内存计算模型关联渠道数（`channelCount`）、删除渠道前唯一依赖保护算法（`getChannelAffectedModels`）。 |
| **计费与权限**| 记录 Token 消耗量与基础通道费用；仅基于 Admin Token 与 Group ID 做接口鉴权。 | 用户钱包余额扣减、点数折算、VIP 额度控制、细粒度权限（Owner、协作者、模型操作权限）拦截。 |

---

## 三、核心业务原则与安全隔离铁律

1. **Member 级别私有数据绝对隔离**：
   - **渠道分组标识**：服务端强制推导：
     $$\text{groupId} = \text{fastgpt:tmb:} + \text{tmbId}$$
   - **私有模型归属**：归属于创建者（`modelData.tmbId`）。
   - **私有渠道归属**：归属于成员专属的 `groupId`，不同成员间**绝对互不可见**。
   - **日志与监控隔离**：仅允许查询当前成员专属 Group 的调用日志与时序仪表盘，严禁跨成员翻阅 Prompt 内容和指标。
2. **服务端强制防御，严禁信任前端透传**：
   - 所有 `/api/core/ai/channel/*` 接口服务端强制从当前登录 Session 提取 `tmbId` 并构建 `groupId`，杜绝前端通过 Query/Body 篡改。
   - 普通成员仅能操作 `channelType: 'team'`；系统管理员（Root）可通过 `channelType: 'system'` 维护平台全局渠道与监控。
3. **推理数据面路由规则（按模型 Owner 路由）**：
   - **系统模型**：统一走平台全局渠道，注入 `X-Aiproxy-Group-Channel-Mode: global`；
   - **团队私有模型**：无论工作流调用者是谁，**统一注入模型拥有者（Owner）的租户凭证**：
     ```ts
     export const getAiproxyScopeHeaders = (
       modelData: { isSystem?: boolean; tmbId?: string } | undefined,
       baseUrl: string | undefined
     ): Record<string, string> => {
       if (!baseUrl || baseUrl !== aiProxyBaseUrl) return {};
       if (modelData?.isSystem) {
         return { 'X-Aiproxy-Group-Channel-Mode': 'global' };
       }
       if (modelData?.tmbId) {
         return {
           'X-Aiproxy-Group': getMemberGroupId(String(modelData.tmbId)),
           'X-Aiproxy-Group-Channel-Mode': 'own'
         };
       }
       return {};
     };
     ```
     `own` 模式保证只在拥有者的私有渠道内寻找健康渠道；无渠道时 AIProxy 返回 404，绝不跨组泄漏，亦绝不私自回退到系统渠道。

---

## 四、系统架构与模块改造方案

### 1. 基础设施客户端与错误处理规范 (`packages/service`)
- **`AIProxyClient` 错误统一收敛**：
  在 `client.ts` 内部统一拦截 Axios 请求错误：
  - 404 / `record not found` 映射为 `ModelErrEnum.channelNotExist`（供业务层识别资源缺失）；
  - 其余错误直接提取 AIProxy 返回的真实 message 抛出；
- **业务层免除 try-catch 胶水代码**：
  CRUD 接口与 Service（`createChannel`、`updateChannel`、`deleteChannel` 等）不再包裹冗余的 `catch -> reject`，错误自然向上冒泡；
- **404 精准业务识别**：
  - `resolve.ts`（单查渠道）：捕获 404 转为 `undefined`；
  - `summary.ts`（查询渠道摘要）：新用户未初始化渠道时捕获 404 转为空列表 `[]`，其余系统级错误正常抛出，由 API 层统一返回错误码供前端直接 Toast，严禁全量静默吞错；
- **运行时无可用渠道拦截**：
  在五大模型运行时调用出口（LLM、Embedding、Rerank、TTS、STT）统一使用 `normalizeRelayNoChannelError`，将 AIProxy 404 无渠道精准转换为 `ModelErrEnum.noAvailableChannel`。

### 2. API 路由层收敛 (`projects/app/src/pages/api/core/ai/channel/`)
全部接口基于 `parseApiInput` 进行 Zod 校验，强绑定 `session.tmbId`：
- `list.ts`：透传 `page`、`per_page`、`search` 到 AI Proxy，废弃本地全量拉取做 slice 的反模式；
- `create.ts` / `update.ts` / `delete.ts` / `status.ts`：标准的渠道 CRUD 控制；
- `batch.ts`：直接对接 AI Proxy 原生批量接口 `/batch_delete` 和 `/batch_status`；
- `affectedModels.ts`：在删除渠道前预检哪些模型将失去全部渠道；
- `models.ts` & `modelChannels.ts`：模型与渠道双向关联悬浮信息展示；
- `logs.ts` / `logDetail.ts` / `dashboard.ts`：当前成员私有作用域下的日志与时序数据。

### 3. 前端交互层改造 (`projects/app/src/pageComponents/model/`)
- **常驻 Tabs**：在模型管理中常驻提供「活跃模型」、「模型配置」、「模型渠道」、「调用日志」、「监控分析」标签页；
- **纯粹数据驱动**：表格多选直接对接 `batch.ts`，弹窗与表格操作回调中清理机械性编写的 `await refresh().catch(() => {})`，依靠 `useRequest` 原生机制进行 Toast 反馈；
- **安全渲染兜底**：消费层对模型与渠道列表默认采用 `?? []` 兜底，确保网络请求失败时仅弹 Toast，不会触发 React 渲染崩溃。

### 4. 存量模型数据平滑迁移 (`projects/app/src/migration/tasks/`)
遵循 FastGPT 统一系统迁移框架：
- 新增独立的迁移任务，扫描包含旧版 `metadata.requestUrl`/`requestAuth` 的模型；
- 内存按 `(model, requestUrl, requestAuth)` 维度去重；
- 通过 AI Proxy API 幂等创建 `Migrated: <model>` 系统渠道；
- 迁移全程支持断点续跑，日志中严禁暴露密钥明文。

---

## 五、验收标准

1. **Member 隔离验证**：成员 A 创建的私有渠道与日志，成员 B 无法通过任何界面或 API 查询到；
2. **跨成员调用验证**：成员 B 在应用中调用成员 A 的私有模型，请求带入成员 A 的 `X-Aiproxy-Group` 顺利推理，配额与调用日志严格落在成员 A 名下；
3. **错误提示原真性**：渠道配置错误时（如上游 Key 无效），前端直接 Toast 显示 AIProxy 返回的具体错误原因，无任何伪造或无关枚举提示；
4. **单元测试矩阵**：`@fastgpt/service` 渠道测试与 `projects/app` 模型/渠道测试全部通过。
