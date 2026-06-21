# Agent Skill Sandbox Entrypoint 方案

## 背景

Agent Skill 需要支持初始化脚本，但入口脚本不能绑定到 sandbox 创建时机。运行态 sandbox 会复用，selected skill 版本会变化，应用配置里的 sandbox 层脚本也可能变化。更准确的模型是：每次进入运行态 `useSandbox()` 时，把当前 sandbox reconcile 到本轮需要的状态。

本方案覆盖运行态 sandbox entrypoint 与 Agent skill runtime，不改 `projects/code-sandbox`，不使用 sandbox provider 的容器 entrypoint。

## 目标

1. 支持 sandbox 层入口脚本：来自 Agent 配置字段 `sandboxEntrypoint`，不写入 sandbox 工作区。
2. 支持 skill 版本包入口脚本：固定识别 `./projects/<versionId>/entrypoint.sh`。
3. entrypoint 在用户文件和 skill 包文件注入完成后执行，且在 `SKILL.md` 扫描注入 prompt 前执行。
4. 同一个 sandbox 内避免重复执行：
   - sandbox 层入口：当前配置脚本 hash 与 HOME 状态一致时跳过。
   - skill 层入口：当前 `versionId` 非本轮 fresh deploy，且 HOME 状态记录该版本入口已成功执行时跳过。
5. 脚本失败、超时或状态读写失败不阻断 Agent 初始化。
6. edit-debug 不自动执行 entrypoint，用户通过 workspace terminal 手动运行。

## 非目标

1. 不识别版本根目录以外的 `entrypoint.sh`。
2. 不把 sandbox 层入口注入成 `./entrypoint.sh`。
3. 不做前端进度态和交互式日志展示。
4. 不做后台进程生命周期管理。
5. 不在 DB 记录某个 sandbox 是否已经执行过 entrypoint。

## 路径规则

### sandbox 层入口

配置字段：

```text
sandboxEntrypoint: string
```

运行时只在服务端通过 `sandbox.execute()` 临时传给 shell 执行。有效条件为：

```text
sandboxEntrypoint.trim().length > 0
```

### skill 版本入口

普通运行态把 selected skill 版本包部署到：

```text
./projects/<versionId>/
```

只识别该目录根部的：

```text
./projects/<versionId>/entrypoint.sh
```

不识别：

```text
./entrypoint.sh
./projects/<versionId>/<skill-name>/entrypoint.sh
./projects/<versionId>/**/entrypoint.sh
```

包内 `SKILL.md` 仍可位于子目录，扫描边界是本轮 selected version 目录。
`entrypoint.sh` 只按版本目录根部判断，不要求同目录存在 `SKILL.md`。

## 部署 reconcile

普通运行态按 selected skill 的 `currentVersionId` 同步 `./projects`：

```text
selected skillIds
  -> 查询 skill.currentVersionId
  -> 查询 version.storageKey
  -> expectedVersionDirs = ./projects/<currentVersionId>
  -> 缺失的 versionDir 才下载、解压
  -> 已存在的 versionDir 跳过下载、解压
  -> 清理 ./projects 下不在 expectedVersionDirs 的旧 version 目录
  -> 对 expectedVersionDirs 检查 entrypoint 成功状态，未成功执行过时执行
  -> 只扫描本轮 selected versionDirs 下的 SKILL.md，用于 prompt 注入
```

部署目录判断：

```text
./projects/<versionId> 为一级目录，且 versionId 是合法版本 ID
=> 认为该版本包已经部署过

versionDir 不存在
=> 使用 version.storageKey 下载 zip 并部署
```

部署使用临时目录解压，成功后再整体替换目标 versionDir，避免半解压目录直接暴露为可用版本：

```text
./projects/.tmp-<versionId>-<random>  解压临时目录
mv ./projects/.tmp-<versionId>-<random> ./projects/<versionId>
```

`storageKey` 只作为下载地址，不进入状态 key。正式发布、导入、复制、创建路径里，包对象 ID 都来自新生成的 `versionId`；现有版本更新接口只修改 `versionName`，没有合法路径在同一个 `versionId` 下替换 `storageKey`。

## 状态设计

状态写在 sandbox 用户 HOME，而不是 skill root：

```text
~/.fastgpt/agent-skill-entrypoints/state.json
```

HOME 解析沿用 ide-agent 逻辑：

1. 优先使用 `$HOME`。
2. `$HOME` 不存在时执行 `sh -c "echo ~"`。

最小状态：

```json
{
  "sandboxEntrypointHashes": ["sha256:..."],
  "skillEntrypoints": ["<versionId>"]
}
```

字段含义：

1. `sandboxEntrypointHashes`：当前 sandbox 已成功执行过的 sandbox 层脚本 hash 集合。多个 workflow 节点共享同一个 sandbox 时，不同节点脚本互不覆盖。
2. `skillEntrypoints`：当前 sandbox 已成功执行过版本包根 `entrypoint.sh` 的 `versionId` 集合。

状态只用于本 sandbox 内的 entrypoint 执行去重，不描述 DB 版本或发布状态。
有 selected version 时会按本轮 version 集合 reconcile `skillEntrypoints`：未选中的 versionId 会被移除，fresh deploy 后入口失败或不存在时也会清掉对应旧成功状态，避免目录重建后误跳过。状态目录不可用时仍执行脚本但不记录成功状态；状态文件缺失或损坏时会按空状态重建。

状态读写和普通运行态 skill 目录 reconcile 都使用 sandbox HOME 下的目录锁。锁会有限等待并清理陈旧锁；锁机制本身不可用时只记录日志并继续执行，不向上阻断本轮 Agent 初始化。

## 执行判断

### sandbox 层

```text
没有配置脚本
=> 跳过

状态可读，且 state.sandboxEntrypointHashes 包含 hash(script.trim())
=> 跳过

状态不可读，或 state.sandboxEntrypointHashes 不包含 hash(script.trim())
=> 执行脚本
=> 成功后尽力追加写入 state.sandboxEntrypointHashes
=> 失败/超时只记录截断日志，继续主流程
```

状态放在 sandbox HOME 中，而不是 DB 中。DB 只能表示当前发布配置是什么，不能证明某个具体 sandbox 里已经存在对应副作用。sandbox 被重建、HOME 被清理或实例切换时，HOME 状态会自然丢失，下次会重新执行。

### skill 层

```text
./projects/<versionId>/entrypoint.sh 不存在
=> 跳过

entrypoint.sh 存在
=> 本轮 fresh deploy 时执行，即使 state.skillEntrypoints 已包含 versionId
=> 非 fresh deploy 且 state.skillEntrypoints 包含 versionId 时跳过
=> 状态不可读或不包含 versionId 时执行
```

正常发布模型下，同一个 `versionId` 的脚本内容不会变化，因此 skill 层不记录脚本 hash。失败或超时不写入 `versionId`，下轮同一 sandbox 会再次尝试。

如果某个 `versionId` 目录曾被取消选择后清理，HOME 状态可能仍保留该 `versionId`。部署函数会返回 `freshlyDeployed` 瞬时标记：本轮 fresh deploy 的版本必须重新检查并执行入口。`freshlyDeployed` 不写入状态文件。

## 执行顺序

`useSandbox()` 普通运行态顺序：

```text
1. 启动或连接 sandbox
2. 并行注入用户输入文件、部署 selected skill version、读取 pwd
3. 等待用户文件和 skill 包部署都完成
4. 执行 sandbox 层 entrypoint
5. 执行本轮需要运行的 skill version entrypoint
6. 扫描本轮 selected versionDirs 下的 SKILL.md
7. 返回 sandboxClient、currentWorkingDirectory、skillInfos
```

sandbox 层 entrypoint 放在 skill entrypoint 前面，因为它更像基础环境初始化，skill entrypoint 可以依赖它产生的环境。

edit-debug 不接入自动执行流程。

ToolCall/SimpleApp 没有 selected skill 包部署流程，只在启用 sandbox 时执行 sandbox 层 `sandboxEntrypoint`。它同样发生在用户文件注入完成之后、LLM loop 开始之前。

## 脚本执行约束

1. shell 路径必须使用 `shellQuote()`。
2. skill entrypoint 执行命令：

```sh
cd <versionDir> && /bin/bash entrypoint.sh
```

3. sandbox 层 entrypoint 不落文件，通过临时 shell 命令执行脚本文本。
4. sandbox 层 entrypoint 执行前显式 `cd <runtime workDirectory>`。
5. 默认超时 30 秒，运行时 clamp 到 `1..600` 秒。
6. stdout/stderr 只写服务端截断日志，避免把大段脚本输出暴露到用户侧。
7. exitCode 非 0、超时或 sandbox execute 抛错不能向上抛错阻断本轮 Agent 初始化。

## 验收测试

### 普通运行态部署

1. selected skill 首次运行时部署到 `./projects/<versionId>`。
2. 同一 sandbox、同一 `versionId` 再次运行时不重新下载、不重新解压。
3. selected skill 切换到新 `currentVersionId` 时，只部署变化的版本。
4. 取消选择的旧 version 目录会被清理，且不会被扫描进 prompt。
5. `storageKey` 只在缺失版本需要下载时使用。

### sandbox 层 entrypoint

1. 配置为空时不执行。
2. 首次看到某个脚本 hash 时执行。
3. 同一 sandbox 内 hash 不变时跳过。
4. 配置脚本变更导致 hash 变化时重新执行。
5. HOME 状态不可用时仍执行，但不写成功状态。
6. 失败或超时不阻断主流程，且不写成功状态。

### skill 层 entrypoint

1. 只识别 `./projects/<versionId>/entrypoint.sh`。
2. 不递归执行子目录里的 `entrypoint.sh`。
3. 新部署版本存在 entrypoint 时执行。
4. 同一 versionId 已成功执行过时跳过。
5. 目录被清理后重新部署同一 versionId 时，fresh deploy 会重新执行。
6. HOME 状态不可用时仍执行，但不写成功状态。
7. 上次失败或超时后，下轮会再次尝试。
8. entrypoint 在用户输入文件和 skill 包部署都完成后执行。
9. entrypoint 执行结束后才扫描 `SKILL.md`。

### edit-debug

1. 预览聊天不会自动执行 entrypoint。
2. 用户仍可通过 workspace terminal 手动执行脚本。
