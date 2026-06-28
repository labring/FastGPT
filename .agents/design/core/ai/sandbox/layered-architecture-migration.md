# 沙盒三层架构迁移方案

## 背景

当前沙盒相关能力集中在 `packages/service/core/ai/sandbox`，但目录按实现类型横向展开为 `instance/provider/runtime/service/toolCall/volume`。业务调用方可以直接引用 `repository`、`provider`、`runtime` 或 `service` 内部文件，导致状态解释和流程编排容易分叉。

本方案将沙盒模块迁移为三层结构：外部业务只引用接口层，沙盒内部再按业务层和原子层拆分。迁移不改变 OpenAPI 协议和前端交互协议。

## 目标结构

```text
packages/service/core/ai/sandbox/
├─ interface/        # 暴露给业务的接口层
├─ application/      # 沙盒业务封装层
├─ infrastructure/   # 原子层：DB、provider、volume、文件系统、storage
├─ utils/            # 跨层共用纯工具
├─ type.ts
└─ error.ts
```

依赖方向固定为：

```text
外部业务 -> interface -> application -> infrastructure
                    \          \          \
                     -> utils   -> utils   -> utils
```

外部业务只允许引用 `sandbox/interface/*`。禁止外部业务直接引用 `sandbox/application/*`、`sandbox/infrastructure/*` 和层内 `utils/*`。

## 目录规则

每一层下面，简单能力使用单文件；内容多、职责多、需要内部 helper 或 type 的能力使用目录。目录内使用 `index.ts` 作为该能力入口，例如：

```text
interface/
├─ runtime.ts
├─ resource.ts
├─ file.ts
├─ session.ts
├─ admin.ts
├─ skillEdit/
│  ├─ index.ts
│  ├─ status.ts
│  ├─ init.ts
│  ├─ upgrade.ts
│  └─ package.ts
└─ toolCall/
   ├─ index.ts
   ├─ prepare.ts
   └─ execute.ts
```

不新增根 `sandbox/index.ts`。业务逐个引用具体接口文件或接口目录：

```ts
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/interface/runtime';
import { getSkillEditRuntimeStatus } from '@fastgpt/service/core/ai/sandbox/interface/skillEdit';
```

## 三层职责

### 接口层 `interface`

接口层是其他业务唯一允许调用的沙盒入口。它负责对外用例、参数归一化、权限上下文衔接和返回值转换，不直接操作 Mongo、provider adapter 或远端 sandbox 原子能力。

当前接口域：

- `interface/skillEdit`：Skill Edit runtime 状态、初始化、升级、打包、保存发布。
- `interface/runtime.ts`：通用运行态 sandbox client、Agent runtime 准备、chat source 到 sandbox query 转换。
- `interface/toolCall`：sandbox tools 准备、执行、展示信息。
- `interface/resource.ts`：app/chat/skill 删除时的 sandbox 清理。
- `interface/file.ts`：workspace 路径解析、文件读取、目录打包。
- `interface/session.ts`：checkExist、keepalive、ticket、verifyTicket。
- `interface/admin.ts`：归档 cron、admin 归档初始化、补偿入口。

### 业务层 `application`

业务层封装完整沙盒流程，统一解释状态。归档、恢复、升级、生命周期、运行态准备、启动脚本、toolCall 编排都应在这一层收口。

当前目录：

```text
application/
├─ admin.ts
├─ archive.ts
├─ cron.ts
├─ file.ts
├─ resource.ts
├─ skillEdit/
│  ├─ deploy.ts
│  └─ runtime.ts
├─ runtime/
│  ├─ index.ts
│  ├─ client.ts
│  ├─ prepare.ts
│  ├─ entrypoint.ts
│  ├─ home.ts
│  ├─ state.ts
│  ├─ files.ts
│  ├─ mirrors.ts
│  └─ skill/
│     ├─ index.ts
│     ├─ builtin.ts
│     ├─ core.ts
│     ├─ entrypoint.ts
│     ├─ prepare.ts
│     └─ types.ts
└─ toolCall/
   ├─ index.ts
   ├─ type.ts
   └─ *.tool.ts
```

启动脚本并发锁当前在 `application/runtime/entrypoint.ts` 的 `withAgentSandboxInitLease` 中。它保护的不是单个脚本，而是整个运行态初始化临界区：

```text
prepare workspace
-> inject files / deploy skills
-> run sandboxEntrypoint
-> run skill entrypoint.sh
-> scan skill/runtime state
```

后续如果 runtime 目录继续拆细，可把锁迁到 `application/runtime/initLease.ts`，但对外接口仍保持 `interface/runtime.ts` 不变。

### 原子层 `infrastructure`

原子层只做底层能力封装，不编排业务状态机。

建议目录：

```text
infrastructure/
├─ instance/
│  ├─ schema.ts
│  └─ repository.ts
├─ provider/
│  ├─ config.ts
│  ├─ adapter.ts
│  ├─ lifecycle.ts
│  └─ runtimeProfile/
└─ volume/
   ├─ config.ts
   └─ service.ts
```

职责划分：

- `instance`：Mongo schema 和 DB 原子操作。
- `provider`：provider 配置、adapter 构造、远端 sandbox connect/disconnect/getInfo/ensureRunning、runtime profile。
- `volume`：volume manager 原子操作。
- `filesystem`：当前仍通过 provider adapter 暴露的 sandbox read/write/execute/list/getFileInfo 原子能力承接，后续可独立拆目录。
- `storage`：当前归档对象存储由 application 调用统一 S3 source，后续如归档存储实现变复杂再拆独立原子目录。

## Utils 规则

根 `utils/` 只放跨层共用、无副作用、无业务流程的纯工具：

- `utils/index.ts`：`joinSandboxPath`、`trimSandboxPathRight`、`buildRuntimeHash`、`getSafeSandboxInputFilename`。
- `utils/id.ts`：`getRunningSandboxId`。
- `utils/image.ts`：镜像 normalize/compare。

每层可以有自己的 `utils/`，只允许该层内部使用：

- `interface/utils`：接口响应转换、入参归一化。
- `application/utils`：状态机、镜像判断、流程 helper。
- `infrastructure/utils`：Mongo/provider 参数转换。

禁止跨层引用其他层的 `utils`。

## 文件注释规范

每个文件顶部、所有 import 之前，必须使用 `/** ... */` 文件级注释。注释使用中文，控制在 2-5 行，说明三点：

1. 所属层。
2. 文件职责。
3. 不负责什么。

示例：

```ts
/**
 * 沙盒业务层：编排 runtime image 升级流程。
 *
 * 负责统一解释镜像状态、归档状态和升级结果；外部接口不得重复实现状态判断。
 */
```

```ts
/**
 * 沙盒原子层：封装 SandboxInstance 的 Mongo 读写和状态迁移。
 *
 * 仅提供数据库原子操作，不编排归档、恢复、升级等业务流程。
 */
```

## 暴露给业务的接口

### `interface/skillEdit`

Skill Edit 沙盒专用，内容多，用目录承载。建议暴露：

- `getSkillEditRuntimeStatus`：查询编辑沙盒状态，统一解释镜像、归档、升级状态。
- `initSkillEditRuntimeSandbox`：初始化、恢复或复用编辑沙盒。
- `upgradeSkillEditRuntimeSandbox`：触发 runtime image 升级。
- `packageSkillEditWorkspace`：把编辑沙盒工作区打包为 skill zip。
- `saveDeploySkillFromSandbox`：从编辑沙盒保存并发布版本。
- `getRunningSkillEditSandbox`：给 debug/export/deploy 查询当前编辑沙盒。

约束：debugChat/export/deploy 这类直接依赖编辑工作区实时状态的能力，必须只接受
`running` 状态的编辑沙盒；如果沙盒已被闲置暂停，应提示用户重新初始化，而不是在调试
请求里隐式拉起。

Skill Edit 升级通过 `sandbox/interface/skillEdit/index.ts` 暴露，内部再调用业务层：

```text
interface/skillEdit/index.ts
-> application/skillEdit/runtime.ts
-> application/archive.ts
-> infrastructure/*
```

### `interface/runtime.ts`

通用运行态入口，简单文件承载。建议暴露：

- `getSandboxClient`。
- `prepareAgentSandboxRuntime`。
- `buildSandboxClientQueryFromChatSource`。
- `getSandboxRuntimeProfile`。
- `withAgentSandboxInitLease`。
- sandbox prepare / entrypoint / skill 注入相关能力。

### `interface/toolCall`

Sandbox tools 调用，内容偏多，用目录承载。建议暴露：

- `prepareSandboxToolRuntime`。
- `runSandboxTools`。
- `getSandboxToolInfo`。

### `interface/resource.ts`

资源清理入口，简单文件承载。建议暴露：

- `deleteAppSandboxes`。
- `deleteAppChatRuntimeSandboxes`。
- `deleteSkillEditSandboxes`。
- `getSandboxInfo`。
- `deleteSandbox`。

### `interface/file.ts`

Sandbox 文件能力，简单文件承载。建议暴露：

- `resolveSandboxWorkspacePath`。
- `isSandboxPathDirectory`。
- `getSandboxFileContent`。
- `addDirectoryToArchive`。

### `interface/session.ts`

SandboxEditor 和 proxy 会话能力，简单文件承载。建议暴露：

- `checkSandboxSessionExist`。
- `keepaliveSandboxSession`。
- `getSandboxConnectionTicket`。
- `verifySandboxConnectionTicket`。

### `interface/admin.ts`

后台任务和管理脚本入口，简单文件承载。建议暴露：

- `runSandboxArchiveCron`。
- `archiveInactiveSandboxes`。
- `archiveSandboxResources`。
- `getConfiguredSandboxProvider`。

## 散落引用收口结果

已收口的普通业务调用方：

- Skill Edit：原 `skill/edit/sandbox.ts`、`skill/edit/deploy.ts`、`skill/runtime/*` 已迁到 `sandbox/application/skillEdit` 和 `sandbox/application/runtime/skill`，外部走 `sandbox/interface/skillEdit`。
- Skill export/debug/deploy：改为引用 `sandbox/interface/skillEdit`。
- Workflow/Agent：改为引用 `sandbox/interface/runtime` 和 `sandbox/interface/toolCall`。
- App/chat/skill 删除：改为引用 `sandbox/interface/resource`。
- Pro/Admin 业务清理：订阅过期聊天清理改为引用 `sandbox/interface/resource`，不能引用已删除的 `sandbox/service/*` 旧路径。
- App 层文件服务：`projects/app/src/service/core/sandbox/fileService.ts` 已删除，能力迁到 `sandbox/application/file.ts`，外部走 `sandbox/interface/file`。
- App sandbox API：checkExist/keepalive/download/preview/ticket 相关能力改为走 `sandbox/interface/*`。

仍允许的例外：

- 沙盒模块自己的测试可直接 import `application/*` 和 `infrastructure/*`，用于覆盖业务层和原子层。
- admin 历史迁移脚本可直接读写 `MongoSandboxInstance`，因为它们职责是一次性数据修复，不属于普通业务调用。

边界检查口径：

```bash
rg -n "from ['\"]@fastgpt/service/core/ai/sandbox/(application|infrastructure|utils)|from ['\"][^'\"]*core/ai/sandbox/(application|infrastructure|utils)|from ['\"][^'\"]*sandbox/(application|infrastructure|utils)" packages/service/core projects/app/src --glob '!node_modules'
```

预期只剩 admin 迁移脚本直连 `sandbox/infrastructure/instance/schema` 或 `repository`。

## 迁移步骤状态

1. 已创建迁移文档和 `interface` 入口。
2. 已收口普通业务引用到 `interface/*`。
3. 已迁移原子层：`instance/*`、`provider/*`、`volume/*` 到 `infrastructure/`。
4. 已迁移业务层：`archive/resource/file/cron/runtime/toolCall/skillEdit` 到 `application/`。
5. 已建立接口层：`skillEdit/runtime/toolCall/resource/file/session/admin/utils`。
6. 已删除旧实现路径，不保留旧路径兼容 re-export。
7. 已用 grep 边界检查约束外部绕过 `interface/*`。

## 测试用例

### Skill Edit 状态

- 无实例返回 `readyToInit`。
- 镜像一致且无归档忙碌返回 `readyToInit`。
- 镜像不一致且无错误返回 `upgradeRequired`。
- `archiving/restoring` 返回 `upgrading`，不返回 `readyToInit`。
- `failed` 返回 `upgradeRequired`，即使镜像字段已经一致，也不能被解释为 `readyToInit`。
- 跨 provider 历史 archived 实例可按迁移逻辑识别。

### Skill Edit upgrade

- 镜像一致直接返回 ready，不触发归档。
- 镜像不一致且归档状态为空或 archived 时触发升级归档。
- 归档进行中返回 `upgrading`，不抛 `runtimeUpgradeInProgress`。
- 归档失败返回失败态，只有真正触发失败才报错。
- 归档完成后 runtime image 更新为当前镜像。

### Skill Edit init

- 只有 `readyToInit` 才允许 init。
- `archiving/restoring/failed/upgradeRequired` 不创建 sandbox。
- archived restore 成功后继续部署工作区。
- restore busy 抛出统一升级中状态。
- provider create 失败不错误改写归档状态。

### Runtime client

- `getSandboxClient` 会先 restore archived，再 ensure running。
- `restoreArchived: false` 时 archived/busy 直接拒绝。
- `ensureAvailable` upsert 运行实例并刷新活跃时间。
- stop/delete 不触发 create/resume。
- app source 写 userId，skillEdit source 不写 userId。

### Runtime init lease / entrypoint

- 同 sandbox 并发初始化只允许一个进入临界区。
- lease 失败转换为 sandbox initializing 业务错误。
- sandboxEntrypoint 空值跳过。
- sandboxEntrypoint hash 相同跳过，hash 改变重新执行。
- entrypoint 失败、超时或抛错不写 state。
- skill `entrypoint.sh` 成功后按 versionId 记录，失败后下次重试。

### Archive / restore

- 闲置 running 实例进入 archiving。
- 归档成功写 storage、标记 archived、停止或删除远端资源。
- 归档失败写 failed/error。
- restore 时标记 restoring，成功清理 archive state。
- restore 失败 rollback restoring。
- archiving/restoring 并发互斥。

### Resource cleanup

- delete app 删除 app 相关沙盒。
- delete app chat 只删指定 chat runtime sandbox。
- delete skill 删除 Skill Edit 沙盒。
- delete 单个 sandbox 时校验 team。
- `keepArchive=true` 时保留归档数据。

### ToolCall

- `prepareSandboxToolRuntime` 会准备镜像源、注入用户文件。
- `runSandboxTools` 复用传入 sandbox client，不重复 get client。
- 未知工具返回失败结果。
- 参数 JSON 解析失败返回失败结果。
- read/write/edit/search/shell/getFileUrl 工具行为保持现有测试通过。

### File / session

- workspace 相对路径解析到 workDirectory。
- `..` 路径拒绝。
- 默认拒绝 workspace 外绝对路径。
- 目录下载递归打包，超过最大深度停止。
- HTML preview 只允许 html 文件。
- checkExist 不创建 sandbox。
- keepalive 会 ensure sandbox 可用。
- getTicket 生成 ticket 前校验 sandbox 可用。
- verifyTicket 读 IDE agent password 并返回连接信息。

### Import boundary

- 外部业务不能 import `sandbox/application/*`。
- 外部业务不能 import `sandbox/infrastructure/*`。
- 外部业务不能 import 层内 `utils/*`。
- 允许测试文件直接 import 内部模块做单元测试。
- 所有业务调用改为 `sandbox/interface/*`。

## 建议验证命令

```bash
pnpm --dir packages/service exec vitest run -c vitest.config.ts test/core/ai/sandbox
pnpm --dir packages/service exec vitest run -c vitest.config.ts test/core/ai/skill/editSandboxPackage.test.ts test/core/ai/skill/runtime.entrypoint.test.ts test/core/ai/skill/runtime.test.ts
pnpm --dir packages/service exec vitest run -c vitest.config.ts test/core/workflow/dispatch/ai/agent/sub/sandbox/prepare.test.ts
pnpm --dir projects/app exec vitest run test/api/core/ai/sandbox test/service/core/sandbox/fileService.test.ts
pnpm --dir packages/service typecheck
pnpm --dir projects/app typecheck
```

## 当前假设

- 本次迁移不改 OpenAPI 协议、global schema 和前端交互协议。
- 当前阶段已完成核心实现目录迁移，旧 `sandbox/service|runtime|provider|instance|toolCall|volume`
  路径不保留兼容 re-export；普通业务调用方必须改到 `sandbox/interface/*`。
- `interface` 是唯一业务调用入口；`application` 和 `infrastructure` 默认视为沙盒内部实现。
