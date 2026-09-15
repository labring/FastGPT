# Skill 辅助生成迁移 Max 功能开发文档

## 文档标识

- 任务前缀：`skill-max-migration`
- 文档文件名：`skill-max-migration-功能开发文档.md`
- 对应需求文档：`skill-max-migration-需求设计文档.md`
- 状态：代码迁移已完成，待真实鉴权生成与部署镜像验收

## 0. 开发目标与约束

- 功能目标：把 Plus Skill 辅助生成的 `skill-creator`、资源加载和商业 API 入口从 Pro 迁移到 Max，保持社区 Skill Debug 和用户交互不变。
- 代码范围：`max/apps/server`、FastGPT 前端 API 选择、OpenAPI、流恢复白名单、Pro 旧代码清理和相关局部测试。
- 非目标：工作流辅助生成、Skill CRUD/发布、Sandbox 初始化、模型注册、数据库迁移。
- 适用维度：API[x] Data[ ] Frontend[x] Logging[x] Packaging[x] Testing[x] DocI18n[ ]
- 需遵循项目规范：FastGPT TypeScript/API/日志规范、Max Hono 现有分层、最小局部测试、禁止改动部署 `.yml/.yaml`。
- 固定业务约束：`usageSource` 继续为 `UsageSourceEnum.fastgpt`；Max 与 FastGPT 使用同一套 Sandbox provider 配置和访问凭证。

## 1. 实施任务拆解（可直接执行）

| 任务ID | 任务名称 | 责任层 | 输入 | 输出 | 完成定义（DoD） |
|---|---|---|---|---|---|
| T1 | 迁移内置 Skill 资源 | Max Packaging | Pro `skill-creator/**` | Max 唯一资源目录 | 内容逐文件一致，Pro 最终无副本 |
| T2 | 实现 Max 资源加载器 | Max Service | 内置资源目录 | `BuiltinSkillSource[]` | 支持递归文件、POSIX 相对路径、缺少 `SKILL.md` 明确失败 |
| T3 | 抽取共享 Skill Debug runner | FastGPT Service | Node 请求、body、传输层适配器 | 与 HTTP 框架无关的完整业务流程 | `authSkill`、聊天、Workflow、usage 和失败收尾只有一份实现 |
| T4 | 实现 Max Skill 调试服务 | Max Service | schema 解析后的 body、SSE session | Max 组合入口 | 调用共享 runner，并注入 `skill-creator`、限流和 Hono SSE 适配器 |
| T5 | 新增 Hono 路由 | Max API | POST JSON | SSE response | 参数错误、业务错误、成功流符合契约 |
| T6 | 完成资源构建 | Max Packaging | `resources/builtin-skills` | `dist/resources/builtin-skills` | dev 可加载且 build 后资源逐文件一致；部署镜像启动单独验收 |
| T7 | 切换 FastGPT 商业入口 | Frontend/OpenAPI | `isPlus` | `/api/maxApi/...` | 社区 URL 不变，恢复白名单和文档同步 |
| T8 | 补齐环境模板 | Max Config | FastGPT Sandbox env | Max `.env.example` | provider 变量同名并说明必须同值 |
| T9 | 删除 Pro 旧实现 | Pro Cleanup | Max 验证结果 | 无旧路由/加载器/资源 | 仅在 T1-T8 通过后执行 |
| T10 | 局部验证和人工验收 | Testing | 所有改动 | 测试结果与验收记录 | 自动测试已通过；实际生成/修改 Skill 待部署环境验收 |

实施顺序必须是 `T1 -> T2/T3 -> T4/T5 -> T6 -> T7/T8 -> T10 -> T9`。T9 不得提前，避免迁移窗口内没有可用商业入口。

## 2. 文件级改动清单

| 文件路径 | 改动类型 | 变更摘要 | 关键代码（可伪代码） | 关联任务ID |
|---|---|---|---|---|
| `max/apps/server/resources/builtin-skills/skill-creator/**` | 新增（从 Pro 移动） | 保存 `SKILL.md`、references、scripts | 保持字节内容不变 | T1 |
| `max/apps/server/src/services/skill-helper/builtin.ts` | 新增 | 加载并校验 Max 内置 Skill | `getMaxBuiltinSkillSources({ includeNames })` | T2 |
| `packages/service/core/ai/skill/debugChat/handler.ts` | 修改 | 将业务生命周期抽为共享 runner，保留原 Next 适配器 | `runSkillDebugChat(...)`、`handleSkillDebugChat(...)` | T3/T4 |
| `packages/service/common/api/frequencyLimit.ts` | 修改 | 抽出不直接写 Node response 的团队限流校验 | `checkTeamFrequencyLimit(...)` | T3/T4 |
| `max/apps/server/src/services/skill-helper/debug-chat.ts` | 新增 | 组合共享 runner、Max 内置 Skill 和 Hono 适配器 | `SkillHelperDebugChatService.run(...)` | T4 |
| `max/apps/server/src/services/skill-helper/workflow-writer.ts` | 新增 | 将 Workflow 事件适配为 Hono SSE | `createSkillHelperWorkflowStreamContext(...)` | T4 |
| `max/apps/server/src/routes/skill-helper/debug-chat.ts` | 新增 | schema 校验和 SSE 路由边界 | `POST /core/ai/skill/debugChat` | T5 |
| `max/apps/server/src/app.ts` | 修改 | 在 `/api` 下挂载 Skill 路由 | `app.route('/api', skillHelper)` | T5 |
| `max/apps/server/scripts/copy-builtin-skills.ts` | 新增 | 将非 TS 资源复制到 `dist` | 清空目标后 `fs.cpSync` | T6 |
| `max/apps/server/package.json` | 修改 | build 追加资源复制命令 | `tsdown && pnpm run build:resources` | T6 |
| `max/apps/server/.env.example` | 修改 | 增加与 FastGPT 相同的 Sandbox provider 配置 | `AGENT_SANDBOX_PROVIDER=...` | T8 |
| `projects/app/src/web/core/skill/api.ts` | 修改 | Plus URL 从 Pro 切到 Max | `isPlus ? '/api/maxApi/...' : '/api/core/...'` | T7 |
| `projects/app/src/web/common/api/fetch.ts` | 修改 | 流恢复白名单替换商业 Skill URL | 删除 `proApi`，加入 `maxApi` | T7 |
| `packages/global/openapi/core/ai/skill/index.ts` | 修改 | 商业 Skill Debug 文档路径改为 Max | `/maxApi/core/ai/skill/debugChat` | T7 |
| `pro/admin/src/pages/api/core/ai/skill/debugChat.ts` | 删除 | 移除 Pro 商业入口 | Max 验证后删除 | T9 |
| `pro/admin/src/service/core/ai/skill/builtin/index.ts` | 删除 | 移除 Pro 资源加载器 | Max 验证后删除 | T9 |
| `pro/admin/src/service/core/ai/skill/builtin/skill-creator/**` | 删除（移动） | 移除 Pro 资源副本 | 以 Max 目录为唯一来源 | T1/T9 |
| `max/apps/server/test/skillHelper.apiSchema.test.ts` | 新增 | 路由入参契约测试 | 合法/非法 body | T5/T10 |
| `max/apps/server/test/skillHelper.test.ts` | 新增 | 服务组合测试 | 校验共享 runner、限流、SSE 和 builtin action 注入 | T4/T10 |
| `max/apps/server/test/skillHelper.builtin.test.ts` | 新增 | 资源递归测试 | 校验完整资源列表和缺失资源错误 | T2/T10 |
| `max/apps/server/test/skillHelper.workflowWriter.test.ts` | 新增 | Workflow SSE 适配测试 | 校验事件格式和 resume mirror | T4/T10 |
| `packages/service/test/common/api/frequencyLimit.test.ts` | 新增 | 共享团队限流测试 | 无配额、放行、超限、依赖故障 | T3/T10 |
| `projects/app/test/web/core/skill/api.test.ts` | 修改 | 前端选路测试 | 校验社区/Plus URL 分支 | T7/T10 |
| `projects/app/test/web/common/api/fetch.test.ts` | 修改 | 流恢复白名单测试 | Max 路径允许、旧 Pro 路径拒绝 | T7/T10 |
| `packages/global/test/openapi/core/ai.test.ts` | 修改 | 校验 Max 商业路径 | 不再登记旧 Pro 路径 | T7/T10 |

### 2.1 关键代码片段（用于规划核对）

#### Max 内置资源加载器

```ts
export async function getMaxBuiltinSkillSources({ includeNames }) {
  const root = await resolveMaxBuiltinSkillRoot({ moduleDirectory: import.meta.dirname });
  return Promise.all(
    includeNames.map(async (name) => {
      const directory = path.join(root, name);
      await assertSkillMdExists(directory, name);
      return { name, files: await collectFiles(directory) };
    })
  );
}
```

要求：当前业务调用点只传入常量 `skill-creator`；加载根目录只探测 Max 自身的
`dist/resources/builtin-skills` 和 `resources/builtin-skills`，不依赖 `NODE_ENV`、进程工作目录
或 FastGPT/Pro 源码目录。文件 `relativePath` 统一为 `/`，文件内容保持 `Buffer`。

#### 共享 Skill Debug runner

```ts
export async function runSkillDebugChat(req, body, options) {
  const auth = await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId: body.skillId,
    per: WritePermissionVal
  });
  await options.checkTeamFrequencyLimit(auth.teamId);
  // 继续执行既有 chat round、Workflow、usage 和失败收尾流程。
}
```

要求：社区 Next API 与 Max Hono API 都调用这一份 runner。权限不能降级为读权限，Max 不能复制聊天落库或失败收尾逻辑。

#### Workflow 到 Hono SSE 的写入适配

```ts
const responseWrite: WorkflowResponseType = ({ id, event, data }) => {
  if (!event) return;
  const payload = typeof data === 'string'
    ? data
    : { ...data, ...(id ? { responseValueId: id } : {}) };
  sse.write(event, payload);
};
```

实际实现必须复用现有 detail/showNodeStatus 过滤语义，并在写出前连接 `getStreamResumeMirror`；不能把整个响应缓存后一次性返回。

#### Max Skill 调试主流程

```ts
async run({ headers, body, sse }) {
  const req = toNodeRequest(toSharedRequest(headers));
  await runSkillDebugChat(req, body, {
    agentSandboxPrepareActions: [createBuiltinSkillPrepareAction({
      getSources: () => getMaxBuiltinSkillSources({ includeNames: ['skill-creator'] })
    })],
    checkTeamFrequencyLimit: (teamId) => checkTeamFrequencyLimit({
      teamId,
      type: LimitTypeEnum.chat
    }).then(() => true),
    createStreamResponseContext: (context) =>
      createSkillHelperWorkflowStreamContext({ ...context, headers, sse })
  });
}
```

共享 runner 保留原行为顺序：先准备轮次，再调度；成功时保存 flow responses、duration、memories 和 interactive；失败时只对已创建且未结束的轮次执行一次失败收尾。

#### Hono 路由

```ts
export const skillHelper = new Hono<Env>().basePath('/core/ai/skill');

skillHelper.post('/debugChat', jsonBodyGuard, zValidator('json', SkillDebugChatBodySchema), (c) => {
  c.header('X-Accel-Buffering', 'no');
  return SseSession.open(c, {
    run: (sse) => skillHelperDebugChatService.run({
      headers: c.req.raw.headers,
      signal: c.req.raw.signal,
      body: c.req.valid('json'),
      sse
    })
  });
});
```

#### 前端 URL 选择

```ts
url: feConfigs?.isPlus
  ? '/api/maxApi/core/ai/skill/debugChat'
  : '/api/core/ai/skill/debugChat'
```

不修改 `SkillPreview` 的消息构造、模型选择、AbortController 或渲染逻辑。

#### 资源构建

```ts
const source = path.resolve(packageRoot, 'resources/builtin-skills');
const target = path.resolve(packageRoot, 'dist/resources/builtin-skills');
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
assertExists(path.join(target, 'skill-creator/SKILL.md'));
```

复制命令必须在 `tsdown` 之后执行，因为 `tsdown` 的 `clean: true` 会先清空 `dist`。

### 2.2 Reviewer 阅读流程（给代码评审的人看）

#### 2.2.1 一句话改动主线

Plus 用户仍从 Skill 编辑页发起对话，但 URL 改由 FastGPT `maxApi` 代理进入 Max；Max 复用 FastGPT 的权限、聊天、Workflow 和同一 Sandbox，同时从自己的运行包加载 `skill-creator`。社区入口保持原样，验证完成后 Pro 旧实现被删除。

#### 2.2.2 阅读顺序表

| 步骤 | Reviewer 应先看什么 | 对应文件/符号 | 关注点 | 看完应得到的结论 |
|---|---|---|---|---|
| 1 | 前端触发入口 | `projects/app/src/web/core/skill/api.ts::streamSkillDebugChat` | Plus/社区分支 URL | 只有商业请求改走 Max |
| 2 | 代理与 Max 路由 | `maxApi/[...path].ts`、`routes/skill-helper/debug-chat.ts` | path 映射、body 校验、SSE | 请求如何进入 Max |
| 3 | 权限与核心编排 | `runSkillDebugChat` | 写权限、生命周期、`usageSource` | 社区和 Max 共用一份业务实现 |
| 4 | Max 组合层 | `SkillHelperDebugChatService.run` | request、限流、SSE、builtin 注入 | Max 只承载商业差异 |
| 5 | 内置 Skill | `builtin.ts`、`resources/.../skill-creator` | 唯一来源、完整资源、隔离目录 | 生成质量核心已归 Max |
| 6 | Sandbox 和数据副作用 | `getRunningSkillEditSandbox`、chat save helpers | 同一实例、成功/失败只落一次 | 不新增状态同步层 |
| 7 | 流与错误 | `workflow-writer.ts`、`SseSession` | 事件格式、resume、error、DONE | 前端无需适配新协议 |
| 8 | 构建 | `copy-builtin-skills.ts`、`package.json` | `tsdown clean` 后复制 | 生产资源不会丢失 |
| 9 | 清理与测试 | Pro 删除项、`max/apps/server/test/*` | 无双份资源、关键分支覆盖 | 迁移闭环成立 |

#### 2.2.3 调用链展开

1. 入口：`SkillPreview.tsx` 调用 `streamSkillDebugChat`；`api.ts` 在 `feConfigs.isPlus` 时选择 `/api/maxApi/core/ai/skill/debugChat`。
2. 参数进入：`projects/app/src/pages/api/maxApi/[...path].ts` 原样透传 cookie、headers 和 body；Max `debug-chat.ts` 用 `SkillDebugChatBodySchema` 校验。
3. 请求适配：`SkillHelperDebugChatService.run` 把 Fetch `Headers` 转为共享 Node 请求形状，并注入 Max 的限流、SSE 和 builtin action。
4. 核心函数：`runSkillDebugChat` 调用共享 `authSkill`（`WritePermissionVal`），获取模型、执行限流、解析消息和文件、调用 `preChatRound`，再由 `buildDebugRuntimeNodes` 生成调试图。
5. 外部依赖：`getRunningSkillEditSandbox` 从共享 Mongo/provider 找到 FastGPT 已初始化的沙盒；`getMaxBuiltinSkillSources` 读取 Max 资源；`createBuiltinSkillPrepareAction` 把资源同步到 Sandbox HOME。
6. Workflow 与数据：`dispatchWorkFlow` 使用 `apiVersion: 'v2'`、`sourceType: skillEdit` 和 `usageSource: fastgpt`；成功后 `finalizeChatRound`/`updateInteractiveChat`，失败后 `failChatRound`/`updateChatGenerateStatus`。
7. 返回：Workflow writer 将事件交给 `SseSession`，FastGPT 代理继续流式回传，原页面按现有事件渲染。
8. 错误：参数错误在路由边界返回 400；进入 SSE 后用 error 事件结束；资源缺失、沙盒不存在和 Workflow 失败都必须记录结构化日志并完成轮次收尾。
9. 测试：先读 loader 和 service 单测，再看 route/schema 测试、构建资源冒烟、社区回归和人工 Sandbox 验收。

## 3. 后端实施说明

### 3.1 API 改动

| 接口 | 方法 | 请求参数 | 响应结构 | 鉴权 | 错误处理 |
|---|---|---|---|---|---|
| Max `/api/core/ai/skill/debugChat` | POST | `SkillDebugChatBodySchema` | `ChatWorkflowSseResponse` SSE | Skill 写权限 | 校验前 JSON 400；流内 SSE error |
| FastGPT `/api/maxApi/core/ai/skill/debugChat` | POST | 原样透传 | 原样透传 | Max 执行 | 沿用通用代理错误 |
| FastGPT `/api/core/ai/skill/debugChat` | POST | 不变 | 不变 | 不变 | 不变 |

请求和响应示例见需求设计文档 6.2，不增加 Max 私有字段。

### 3.2 Core/Service 改动

| 模块 | 函数/类型 | 具体改动 | 依赖关系 |
|---|---|---|---|
| Builtin Loader | `getMaxBuiltinSkillSources` | 替代 Pro loader，只读取 Max package 内资源 | `BuiltinSkillSource` |
| Shared Runner | `runSkillDebugChat` | 承担权限、Chat、Workflow、Sandbox、Model、Usage 和失败收尾 | FastGPT Community、Max |
| Request/Rate Limit Adapter | `toNodeRequest`、`checkTeamFrequencyLimit` | 把 Hono headers 转为共享请求形状，提供无 response 的限流入口 | `authSkill`、团队 QPM |
| Skill Helper Service | `SkillHelperDebugChatService.run` | 组合共享 runner 并注入 builtin action | Shared Runner、Builtin Loader、Workflow Writer |
| Workflow Writer | `createSkillHelperWorkflowStreamContext` | 适配 Hono SSE 和 resume mirror | `SseSession`、`getStreamResumeMirror` |
| Route | `skillHelper` | 只做输入校验、header 和服务调用 | Hono、zValidator |

上述生命周期继续由 `packages/service/core/ai/skill/debugChat/handler.ts::runSkillDebugChat` 唯一维护；Max 不再复制这些分支。

### 3.3 数据层改动

无 schema、字段、索引和迁移脚本变更。代码评审中如出现新的 Mongo Schema 或索引，应视为超范围并撤回。

## 4. 前端实施说明

| 页面/组件 | 文件路径 | 交互变化 | i18n 改动 | 状态覆盖（加载/空/错/成功） |
|---|---|---|---|---|
| Skill Debug API | `projects/app/src/web/core/skill/api.ts` | Plus 请求目的地改为 Max | 无 | 全部沿用现有逻辑 |
| Stream Resume | `projects/app/src/web/common/api/fetch.ts` | Max Skill 路径发送恢复请求头 | 无 | 恢复成功/不可恢复/失败均沿用 |
| Skill Preview | `SkillPreview.tsx` | 无代码变更 | 无 | 现有四态不变 |

## 5. 日志与可观测性

| 触发点 | 日志级别 | 分类 | 字段 | 备注 |
|---|---|---|---|---|
| builtin 加载 | debug/error | `AGENT_SKILLS` | `skillName`、`fileCount`、`error` | 禁止输出正文 |
| sandbox 命中 | debug | `AGENT_SKILLS` | `skillId`、`sandboxId` | 与现有日志口径一致 |
| workflow 开始/结束 | debug | `AGENT_SKILLS` | `skillId`、`chatId`、`modelId`、`durationSeconds` | 支持跨服务排查 |
| 生成失败 | error | `AGENT_SKILLS` | `skillId`、`chatId`、`error` | 不记录 messages、cookie、token |
| 资源打包失败 | 构建失败 | build script | 缺失相对路径 | 直接非零退出，禁止静默发布 |

## 6. 文档 i18n 实施说明

### 6.1 文件映射与动作

| 源文件 | 目标文件 | 类型 | 动作 | 状态 |
|---|---|---|---|---|
| 无 | 无 | 用户可见文档 | 无 | 不命中 |

### 6.2 缺失文件

无。本次新增的是仓库内部中文设计文档，不增加产品可见文案。

## 7. 测试与验证

规范来源：`project-requirement-design/references/testing-standards.md`

### 7.1 测试文件映射

| 源文件路径 | 测试文件路径 | 是否跳过 | 跳过理由 |
|---|---|---|---|
| `max/apps/server/src/services/skill-helper/builtin.ts` | `max/apps/server/test/skillHelper.builtin.test.ts` | 否 | - |
| `max/apps/server/src/services/skill-helper/debug-chat.ts` | `max/apps/server/test/skillHelper.test.ts` | 否 | - |
| `max/apps/server/src/services/skill-helper/workflow-writer.ts` | `max/apps/server/test/skillHelper.workflowWriter.test.ts` | 否 | - |
| `max/apps/server/src/routes/skill-helper/debug-chat.ts` | `max/apps/server/test/skillHelper.apiSchema.test.ts` | 否 | - |
| `max/apps/server/scripts/copy-builtin-skills.ts` | `pnpm --filter @fastgpt/server build` | 否 | 构建结束后逐文件比较 `dist` 资源 |
| `packages/service/common/api/frequencyLimit.ts` | `packages/service/test/common/api/frequencyLimit.test.ts` | 否 | 验证 Hono 可复用的传输层无关限流 |
| `projects/app/src/web/core/skill/api.ts` | `projects/app/test/web/core/skill/api.test.ts` | 否 | 验证 Plus/社区 URL 分支 |
| `projects/app/src/web/common/api/fetch.ts` | `projects/app/test/web/common/api/fetch.test.ts` | 否 | 增加 Max Skill 恢复 header 用例 |
| `packages/global/openapi/core/ai/skill/index.ts` | `packages/global/test/openapi/core/ai.test.ts` | 否 | - |

### 7.2 自动化测试设计

| 类型 | 用例 | 预期结果 |
|---|---|---|
| 单元测试 | loader 读取 `skill-creator` 全部嵌套文件 | 返回稳定 POSIX 路径和原始 Buffer |
| 单元测试 | loader 缺少目录或 `SKILL.md` | 抛出包含 Skill 名称的明确错误 |
| 单元测试 | Max 传递 cookie/header、注入限流与 SSE adapter | 共享 runner 收到正确请求和 options |
| 单元测试 | Workflow writer 写字符串/对象/error/DONE | SSE 帧格式与前端解析一致 |
| 单元测试 | 团队限流无配额、放行、超限、依赖失败 | 与原 Next 限流保持 fail-closed 语义 |
| 服务测试 | Skill Helper 组合 | 只注入 `skill-creator`，生命周期委托共享 runner |
| API 测试 | 非法 body | 400，服务不执行 |
| 构建测试 | 执行 Max build | `dist/resources/.../SKILL.md`、references、script 均存在 |
| 回归测试 | 前端与 OpenAPI | 社区 URL 不变，Plus URL 改为 Max，旧 Pro 路径不存在 |

### 7.3 场景覆盖核对

| 场景 | 是否覆盖 | 对应用例/describe |
|---|---|---|
| 基础编排 | 自动覆盖 | Max 服务将请求、`skill-creator`、限流和 SSE 适配器交给共享 runner |
| 请求边界 | 自动覆盖 | 合法/非法 body、空 messages、Max 路由挂载、Plus/社区选路 |
| 资源与构建 | 自动覆盖 | 完整资源树、缺失资源、非仓库 cwd、构建复制和逐文件比较 |
| 通用异常 | 自动覆盖 | 共享处理器的只读权限拒绝、沙盒缺失、团队限流失败和轮次收尾 |
| 流式协议 | 自动覆盖 | 字符串/对象/error/DONE、resume mirror、Max 恢复请求头 |
| 真实业务链路 | 待人工验收 | 鉴权用户创建/修改 Skill、多轮交互、文件上传、usage 明细和实际 Sandbox 写入 |

### 7.4 执行命令与结果

以下结果来自 2026-09-15 的本地局部验证。当前 Node 为 `v20.19.5`，仓库声明要求 `>=22.23.2`，命令均有 engine warning，但测试、类型检查和构建实际成功。

| 命令 | 结果 | 覆盖率（行/分支） | 备注 |
|---|---|---|---|
| `pnpm --filter @fastgpt/server exec vitest run` | 12 files / 39 tests 通过 | 未采集 | Max 完整测试 |
| `pnpm --filter @fastgpt/server typecheck` | 通过 | - | Max 类型检查 |
| `pnpm --filter @fastgpt/server build` | 通过 | - | `dist` 资源复制完成，12 个文件与源码一致 |
| `pnpm --dir max docker:build -- fastgpt-max/server:skill-helper-test` | 通过 | - | Node 26 Docker 镜像构建、生产依赖裁剪和资源复制完成；最终 runner 包含启动入口、运行依赖与 `skill-creator` 资源 |
| 使用最终镜像启动 Max 并请求 `/healthz`、Skill Helper 非法 body | 200 / 400 | - | 容器完成 Redis、MongoDB、S3、系统配置和 59 个模型初始化，路由可执行 |
| `pnpm test projects/app/test/api/core/ai/skill/debugChat.test.ts packages/service/test/common/api/frequencyLimit.test.ts packages/global/test/openapi/core/ai.test.ts projects/app/test/web/core/skill/api.test.ts projects/app/test/web/common/api/fetch.test.ts` | 5 files / 63 tests 通过 | 未采集 | 社区处理器、共享限流、OpenAPI、前端选路和恢复白名单 |
| `pnpm --filter @fastgpt/app typecheck` | 通过 | - | FastGPT App 类型检查 |
| Max 服务启动后直连及经 FastGPT 代理发送非法 Skill Debug 请求 | 400，返回 Max schema 校验响应 | - | 已确认 `/api` 路由和 `/api/maxApi` 代理链路，不是 404/502 |
| Node 26、未设置 `NODE_ENV` 直接启动 `dist/main.mjs` | `/healthz` 返回 200 | - | 已确认构建产物按实际目录加载资源，不依赖 `NODE_ENV` |
| 鉴权用户经 FastGPT 代理真实创建/修改 Skill | 待执行 | - | 需在 UI 验证模型、Sandbox 写入和 usage 明细 |

## 8. 质量自检清单

- [x] 输入使用现有 zod schema，Skill 权限严格为写权限
- [x] 生成成功、interactive 和失败轮次的落库路径由共享 runner 唯一维护
- [x] Max `.env.example` 已声明与 FastGPT 同名的 Sandbox provider 配置
- [x] 使用量来源仍为 `UsageSourceEnum.fastgpt`，无重复记账
- [x] SSE 事件、DONE、error 和 resume mirror 与现有前端兼容
- [x] `skill-creator` 只在 Max 保留一份有效业务源码
- [x] 构建产物包含全部 Markdown、references 和 scripts
- [x] 社区 Skill Debug 不依赖 Max，社区 URL 保持不变
- [x] 日志不包含 prompt、文件正文、cookie、token 或 provider 凭证
- [x] 没有数据库、索引或部署 YAML 变更
- [x] 文档与最终实现一致
- [ ] 在完整本地依赖环境中完成 FastGPT 代理到 Max 的真实 Skill 创建/修改验收

## 9. 发布与回滚

### 9.1 发布步骤

1. 发布包含新 Skill 路由和资源的 Max，暂不切前端。
2. 通过 Max 直连和 FastGPT `maxApi` 代理完成冒烟测试。
3. 确认 Max/FastGPT Sandbox 配置一致，并完成真实 Skill 创建与修改。
4. 发布 FastGPT 前端 URL、resume 白名单和 OpenAPI 改动。
5. 观察请求成功率、SSE 错误、Sandbox 命中和 usage 明细。
6. 验收窗口结束后发布删除 Pro 旧实现的版本。

### 9.2 回滚触发条件

- Max 资源加载失败或生产产物缺文件。
- Max 无法命中 FastGPT 创建的 Skill Edit Sandbox。
- Plus Skill Debug 成功率明显下降、SSE 卡住或聊天轮次长期处于 generating。
- usage 未记录、重复记录或 source 不再为 `fastgpt`。

### 9.3 回滚步骤

1. 在 Pro 旧产物仍存在的迁移窗口内，将 FastGPT Plus URL 和恢复白名单切回 `/api/proApi/core/ai/skill/debugChat`。
2. 回滚 Max Skill 路由版本，不影响已经稳定的 AgentV2 辅助生成。
3. 若 Pro 旧实现已删除，整体回滚到同时包含 Pro 入口和对应前端 URL 的上一版本。
4. 不处理业务数据迁移；仅检查失败聊天轮次是否已由现有收尾逻辑标记为 error。

## 10. AI 实施提示

- 严格按任务 ID 顺序执行，每完成一项立即更新本文测试结果和质量清单。
- 实施前逐文件核对当前工作区改动，保留用户已有的 Max/Pro 修改。
- 移动 `skill-creator` 时先比较文件清单和内容 hash，再删除 Pro 源目录。
- Max 编排逐段对照 `handleSkillDebugChat`，不自行简化聊天、文件、usage 或失败收尾逻辑。
- `usageSource` 必须继续写 `UsageSourceEnum.fastgpt`。
- Sandbox 环境变量沿用 FastGPT 的变量名和值，不创建 Max 专用 provider 配置协议。
- 不修改任何 `.yml` 或 `.yaml`；如生产部署确需新增变量，由部署方在现有配置渠道注入。
- 不扩展到工作流辅助生成；发现关联改动时记录为后续任务。
