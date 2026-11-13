# Agent 工具输入形状历史与 PR #8346 分析

## 结论

Agent 节点把工具列表存放在 `inputs[selectedTools].value`。当前持久化协议中，每个工具大致为：

```ts
{
  id: string;
  name?: string;
  avatar?: string;
  version?: string;
  source?: string;
  toolConfig?: object;
  inputs?: Array<{ key: string; mode: 'agentGenerated' | 'manual' }>;
  config: Record<string, unknown>;
}
```

`{ key, mode }` 是工具参数的持久化描述；`config[key]` 保存最终由开发者固定下来的值。完整 NodeIO 对象包含 `renderTypeList`、`selectedType`、`valueType`、`value`、`defaultValue`、`inputList` 等字段，主要存在于编辑器内存、预览响应和少量历史写入路径。工作流迁移边界负责把历史完整 NodeIO 投影成 `{ key, mode }`，工具定义、权限和展示信息随后由服务端按当前工具重新加载。

“新数据直接存储整个节点”并不是当前持久化契约。它描述的是编辑器和早期/异常写入路径把完整工具节点预览直接放进 `selectedTools` 的现象。当前正常的独立 Agent 表单、工作流画布保存和服务端工具水合都会把持久化结果收敛为 sparse `{ key, mode }`；加载失败时还会通过 `rawInputs` 暂时保留原始输入来源，避免一次保存丢失历史配置。

## 代码位置

- 工具持久化类型：`packages/global/core/app/tool/type.ts`
- canonical 输入 schema：`packages/global/core/workflow/migration/schema.ts`
- 工作流迁移入口：`packages/global/core/workflow/migration/migrate.ts`
- 编辑器内部工具类型：`packages/global/core/app/formEdit/type.ts`
- 工具序列化与 mode 判定：`packages/global/core/app/formEdit/utils.ts`
- 独立 Agent 表单保存：`projects/app/src/pageComponents/app/detail/Edit/ChatAgent/utils.ts`
- 工作流画布保存：`projects/app/src/pageComponents/app/detail/WorkflowComponents/utils.ts`
- 服务端详情水合：`packages/service/core/app/utils.ts`
- 运行时固定参数与模型参数分离：`packages/global/core/app/tool/runtime.ts`
- 设计记录：`.agents/design/core/workflow/agent-node.md`

## 数据路径

### 1. 编辑器内部：完整 NodeIO

`SelectedToolItemType` 承载完整工具模板，工具参数是 `FlowNodeInputItemType[]`。典型形状：

```ts
{
  id: 'tool-id',
  pluginId?: 'workflow-or-plugin-id',
  name: 'Tool',
  flowNodeType: 'pluginModule',
  inputs: [
    {
      key: 'query',
      label: 'Query',
      renderTypeList: ['agentGenerated', 'textarea'],
      selectedType: 'agentGenerated',
      valueType: 'string',
      value: '...',
      defaultValue: '...',
      required: true
    }
  ],
  outputs: [],
  configStatus?: 'configured'
}
```

这里保留 `renderTypeList` 和 `selectedType`，因为编辑器需要渲染手动控件、变量引用和 Agent 生成来源，也需要基于最新工具定义编辑参数。

### 2. 持久化：sparse 输入配置

当前 `AgentToolSchema` 把工具输入定义为：

```ts
inputs?: Array<{
  key: string;
  mode: 'agentGenerated' | 'manual';
}>;
config: Record<string, unknown>;
```

实际保存时，`inputs` 只保留最终输入来源；固定参数值写入 `config`。这样工具版本的 label、控件类型和 JSON Schema 可以从当前定义重新水合，历史值不会被旧定义固化。

独立 Agent 表单由 `serializeAgentTool` 生成该形状：

- `canInputBeAgentGenerated` 过滤不可由模型生成的输入；
- `getAgentToolInputMode` 把最终 `selectedType` 转成 `agentGenerated` 或 `manual`；
- `filterToolConfiguredParams` 只保留固定参数；
- `config[key]` 的值可以是 `false`、`0`、`''`、对象和数组，不能用 truthy 判断区分是否已配置。

工作流画布由 `uiWorkflow2StoreWorkflow` 处理。展开态工具同时存在完整 NodeIO 字段时调用 `serializeAgentTool`；已经是 `AgentToolType` 的 sparse 记录直接保留。

### 3. 读取：按当前工具定义水合

`rewriteAppWorkflowToDetail` 读取 `selectedTools`，先用 `AgentToolSchema` 过滤可解析记录，再按 `id/version/source` 加载当前工具，最后：

- 用 `initAgentToolInputType` 将保存的 `mode` 应用回最新 NodeIO；
- 用 `config[input.key]` 覆盖参数默认值；
- 把无法加载的工具保留为空 `inputs`，并将持久化输入来源放入 `rawInputs`，保存时原样回写；
- 不把旧工具定义中的展示字段当作当前定义。

运行时 `compileToolRuntime` 再次根据最新工具定义区分模型可见参数和固定绑定。`agentGenerated` 参数进入 function schema，`manual` 参数从 `config` 合并到最终工具入参。

### 4. selectedTools 引用形态

`inputs[selectedTools].value` 还可以是二元组：

```ts
['source-node-id', 'output-key']
```

它表示变量引用，不是工具数组。迁移和前端处理必须原样保留，不能逐项转换，也不能用数组长度判断普通工具列表。

### 5. `flowNodeType` 在哪些形状中存在

`flowNodeType` 是工具模板/画布节点字段，不属于当前 sparse `AgentToolSchema` 的持久化输入协议。不能只看字段是否存在判断数据是否异常：

| 形状 | `flowNodeType` | `inputs` | 含义 |
| --- | --- | --- | --- |
| 编辑器完整工具模板 | 存在 | 完整 NodeIO 数组 | `getPreviewNode` 或画布加载得到，可编辑、可序列化 |
| 当前持久化 sparse 工具 | 不存在 | `{ key, mode }[]` 或缺失 | 正常协议，读取详情时按当前工具定义重新水合 |
| 旧完整 NodeIO 快照 | 通常存在 | 含 `selectedType`/`value` 等 | 历史兼容输入，应经迁移投影 |
| 缺 `flowNodeType` 的完整 NodeIO | 不存在 | 仍含完整 NodeIO | 异常混合形状，画布保存可能原样透传 |

当前 `serializeAgentTool` 返回的对象没有 `flowNodeType`，因此“持久化后没有该字段”本身是正常的。只有同时出现完整 NodeIO 输入字段和缺失 `flowNodeType` 时才需要关注。

从当前代码能确认的来源看，完整 NodeIO 缺 `flowNodeType` 主要来自跨协议或字段裁剪：

1. 旧缓存、旧客户端或前端本地快照把编辑期工具对象裁成持久化字段后，又把它放回 `selectedTools`；
2. 手工构造、导入或通过 API 提交的外部 workflow 只保留了 `inputs` 和配置字段；
3. 某个中间层对完整工具对象做对象投影时保留了 `inputs`，但没有同步保留作为节点类型标识的 `flowNodeType`。

当前 `getPreviewNode` 返回完整 `FlowNodeTemplateType`，`serializeAgentTool` 返回 sparse 工具，两者分别带完整字段和持久化字段；这两条正常路径都没有“完整 `inputs` + 无 `flowNodeType`”的稳定输出。要确认生产数据的具体来源，应抽样异常工作流，对比其中 `selectedTools[*].inputs` 是否是完整 NodeIO，以及该对象是否同时来自旧快照或外部导入。

### 修复前的触发条件

在 PR #8346 修复前的 main 版本中，持久化失败的条件可以精确到工具输入数组：

```ts
inputs: [
  {
    key: 'ms',
    selectedType: 'agentGenerated'
    // 缺少 mode
  }
]
```

`migrateWorkflowToCurrent` 只在工具的 `inputs` 字段缺失时，才根据 `config` 推导 `{ key, mode }`。只要 `inputs` 已经是数组，它会原样透传；随后 `CanonicalAgentToolInputConfigSchema` 要求每个数组元素显式包含合法的 `mode`，因此 `selectedType`、`renderTypeList`、`value` 等 NodeIO 字段都不能替代 `mode`。

所以“加哪个字段”的答案分两种情况：

- 给完整工具对象加 `flowNodeType`，画布保存会将其识别为展开态工具，调用 `serializeAgentTool`，通常能避免 strict schema 失败；
- 给持久化对象加完整 `inputs`（例如 `selectedType`）但不提供 `flowNodeType`，画布会原样透传，随后 canonical schema 因缺少 `mode` 失败；
- `flowNodeType` 本身不参与 canonical 工具 schema 的校验，故障来自它触发的两条不同处理路径。

`systemTool-delay` 这份对象带有 `flowNodeType: 'tool'` 和完整 `inputs: [{ key: 'ms', selectedType: 'agentGenerated', ... }]`。按正常画布序列化路径，它会被投影为：

```json
{
  "id": "systemTool-delay",
  "name": "流程等待",
  "avatar": "...",
  "version": "1.0",
  "metadataLocale": "zh-CN",
  "toolConfig": {
    "systemTool": {
      "toolId": "systemTool-delay"
    }
  },
  "inputs": [
    {
      "key": "ms",
      "mode": "agentGenerated"
    }
  ],
  "config": {}
}
```

这份对象如果未经过 `serializeAgentTool`，直接把完整 `inputs` 交给 publish migration，修复前会因 `inputs[0].mode` 缺失而失败；PR #8346 会在 migration 边界把它投影为上述形式。

### 11/5 前、11/5 后、PR 后三阶段对比

这里讨论的是 `selectedTools[*].flowNodeType`，不是外层工作流节点自身的 `flowNodeType`。

#### 11/5 前

画布保存只尝试把通过 `SelectedToolItemTypeSchema` 的对象当作完整工具：

```ts
const parsed = SelectedToolItemTypeSchema.safeParse(tool);
if (parsed.success) serializedTools.push(serializeAgentTool({ tool: parsed.data }));
```

完整工具必须包含 `flowNodeType` 才能通过该 schema；解析失败的工具会被跳过。序列化后的持久化工具由 `serializeAgentTool` 返回，不带 `flowNodeType`。

此时在画布保存路径中，如果完整 NodeIO 缺少 `flowNodeType`，它不会通过 `SelectedToolItemTypeSchema`，会被保存逻辑跳过；独立 Agent 表单路径则直接对工具调用 `serializeAgentTool`，不使用这个画布分支。如果同一完整对象直接绕过前端归一化进入 publish migration，仍可能触发后续 schema 校验问题。

“跳过”背后的具体原因可以从 11/5 的测试和设计说明确认：

- `SelectedToolItemTypeSchema` 以 `FlowNodeTemplateTypeSchema` 为基底，要求完整模板字段，包括 `flowNodeType`、`inputs`、`outputs` 等；
- 11/5 前使用 `safeParse`，解析失败的工具不会进入 `serializedTools`，随后从保存数组消失；
- 新增的 `imported-sparse-tool` 测试对象只有 `id/name/avatar/version/inputs[{key,mode}]/config`，缺少完整模板的展示字段，按旧逻辑会被删除；
- 11/5 的测试因此改名为 `preserves expanded and stored Agent tools without requiring display-only metadata`，设计文档也写明“已是 `AgentToolSchema` 的稀疏记录直接保留，禁止把稀疏输入强制断言为 NodeIO 再序列化”。

所以 11/5 没有“跳过完整 NodeIO”作为目标；它把 `flowNodeType` 当作完整编辑态的形状标记，以便完整工具继续序列化，同时让不带该字段的 sparse 工具原样保存。真正被跳过的通常是缺少完整模板元数据、无法直接交给 `serializeAgentTool` 的对象；其中也包括早期某些缺少 `flowNodeType` 的完整快照。

#### 最早那段 `safeParse` 跳过逻辑的原始动机

这段逻辑不是 11/5 才提出的，而是在 8 月 centralized workflow migration 收敛时出现。原始设计见 PR #7544：

- 编辑器、API、Service、Runtime 中存在多套 workflow 兼容逻辑；目标是让外部 workflow 在可信边界只迁移一次，后续只消费 canonical data；
- 可利用的工具由 resolver 加载当前定义，再重建 canonical `{ key, mode }`；
- 工具定义不可用时，用 `isUnavailable` 占位并保留可恢复的输入快照，避免缺失定义被保存成语义模糊的 `inputs: []`；
- 不可用工具与“有定义但输入为空”的工具必须区分；
- 运行时跳过不可用工具，其他工具和工作流仍可继续执行。

在这个模型下，`safeParse` 失败表示该对象不是当前可编辑完整工具模板，也没有显式声明为 unavailable。把它直接交给 `serializeAgentTool` 会把缺失定义或展示字段误当成工具定义，可能生成错误的 `mode`、空输入或丢失配置；因此先跳过，再依赖 `isUnavailable` 兼容分支保留真正需要恢复的工具。

后续 `19f3aeba7` 把 unavailable 模型进一步收敛，保留显式不可用工具，普通解析失败项仍不进入序列化。11/5 的改动把这段判断从“是否完整模板”改成“是否有 `flowNodeType`”，用轻量形状标记同时兼容完整编辑态和 sparse 存储态。

#### 11/5 后、PR #8346 前

为支持已经持久化的 sparse 工具，画布保存改为：

```ts
'flowNodeType' in tool ? serializeAgentTool({ tool }) : tool
```

完整工具带 `flowNodeType` 时，仍会序列化并移除它；sparse 工具不带 `flowNodeType`，会原样保留。这个判断对标准完整工具是安全的，但对“带完整 NodeIO 却没有 `flowNodeType`”的混合对象不安全：它会被误判为 sparse，完整 `inputs` 随后进入 strict canonical schema，修复前在 `mode` 校验处失败。

#### PR #8346 后

画布保存判断没有改变，变化发生在服务端迁移边界。`normalizeAgentToolInputs` 不再把已有 `inputs` 数组原样透传，而是逐项投影：

- 完整 NodeIO 的 `selectedType` 转为 `mode`；
- 手动 `value` 搬入 `config`；
- `flowNodeType`、`renderTypeList`、`valueType`、`outputs` 等展示/定义字段从持久化工具中移除；
- canonical `{ key, mode }` 记录保持幂等。

因此 PR 后持久化对象仍不带 `flowNodeType`。再次读取详情时，`rewriteAppWorkflowToDetail` 根据工具 `id/version/source` 加载当前定义，重新生成完整 NodeIO，包括新的 `flowNodeType`。`flowNodeType` 是读取时补回的领域信息，不是持久化输入协议的一部分。

## 历史演变

以下日期取自当前 git 历史，均按提交日期记录。

### 2026-02-12：Agent 工具初版

提交 `76d6234de V4.14.7 features (#6406)` 引入独立 Agent 表单和工作流节点。

当时 `selectedTools` 的直接值很薄：

```ts
{
  id: tool.pluginId,
  config: {
    [input.key]: input.value
  }
}
```

初版的 `config` 来自完整输入值的 reduce，工具身份主要依赖 `id`；还没有统一的 `{ key, mode }`。这与后来“配置值”和“输入来源”分开的模型不同。

### 2026-07 至 2026-08：模式成为持久化协议

`AgentToolInputModeEnum` 首次出现在 `9bb6b82cf 4.16 tmp (#7404)`；`07e49cde0 refactor(tool): unify tool input runtime compilation (#7419)` 随后统一工具运行时编译，明确把模型可见参数和固定绑定分开。两条路径共同把输入协议收敛为 `{ key, mode }`。

关键提交：

- `0c1f1d71d refactor(workflow): stop writing legacy input state`：新数据改用 `selectedType`，同时保留 legacy schema 和读时归一化；已经明确写出 sparse `{ key, mode }` 语义。
- `31f303a0f feat(workflow): preserve invalid tool nodes`：工具定义不可用时保留可恢复输入来源，而不是把旧定义误当成当前定义。
- `19f3aeba7 fix(workflow): normalize agent tool inputs`：新增 `serializeAgentTool`，把完整 NodeIO 投影为 sparse 输入；同时关闭 `unresolvedInputs` 兼容分支。
- `eb8e0bc49 fix(workflow): normalize agent tool inputs`（rebase 版本）：延续 sparse 输入与不可用工具边界。

这些提交之后，正常情况下保存的 `inputs` 是 `{ key, mode }`，完整 NodeIO 只作为编辑详情和迁移输入出现。

### 2026-11-05：统一工作流 Agent 节点

提交 `e9f9a140e feat(workflow): standardize workflow agent node and unify tool status validation (#8213)` 把独立 Agent 能力纳入工作流标准节点。

设计文档 `.agents/design/core/workflow/agent-node.md` 明确：

- `AgentToolSchema.inputs` 是 `{ key, mode }[]`；
- 工具定义负责最新 NodeIO、控件和 schema；
- `config` 是固定参数值；
- 工具加载失败时 `rawInputs` 保留原始输入来源，只用于恢复；
- 画布保存区分展开态完整 NodeIO 与存储态 sparse 工具。

因此“存储完整节点”是编辑器和旧快照的输入形态；工作流 Agent 标准化后的目标存储形态仍是 sparse 配置。

这次提交同时修改了画布保存时的工具识别规则：

```ts
// 11/5 之前：只接受完整 SelectedToolItemType，解析失败直接跳过
const parsed = SelectedToolItemTypeSchema.safeParse(tool);
if (parsed.success) serializedTools.push(serializeAgentTool({ tool: parsed.data }));

// 11/5 之后：展开态工具序列化，非展开态原样保留
selectedToolsInput.value = selectedToolsInput.value.map((tool) =>
  'flowNodeType' in tool ? serializeAgentTool({ tool }) : tool
);
```

后者的目的是允许画布直接保存从外部导入的 sparse `AgentTool`，避免旧逻辑把所有缺少完整模板字段的工具删掉。它的判断条件是“是否有 `flowNodeType`”，而完整 NodeIO 快照是否带 `flowNodeType` 取决于来源：

- 编辑器正常加载的完整工具模板带 `flowNodeType`，会进入 `serializeAgentTool`；
- 已持久化的 sparse 工具不带 `flowNodeType`，会原样保留；
- 旧版独立 Agent、旧客户端或其它预览/导入路径可能只带完整 `inputs` 而无 `flowNodeType`，这时会被误认为 sparse 记录并原样通过。

因此 11/5 的统一节点本身没有把“完整节点”重新定义为持久化格式；它让流程 Agent 复用了画布保存路径，并把“非完整模板”的输入原样透传。异常窗口出现在完整快照缺少 `flowNodeType` 的情况，后续由 strict canonical schema 暴露。

### 2026-11-10：旧完整快照重新进入迁移

提交 `7a2cf8b70 fix(workflow): migrate legacy agent tool inputs` 恢复了历史完整 NodeIO 的 `key/mode` 转换和手动值回填逻辑。这说明生产数据中确实可能残留：

```ts
inputs: [
  {
    key: 'query',
    renderTypeList: ['agentGenerated', 'textarea'],
    selectedType: 'textarea',
    value: 'fixed'
  }
]
```

当时的实现通过 legacy schema 预处理，但工作流迁移中已有的 `inputs` 数组仍可能被直接透传，导致后续 strict schema 校验失败。

## PR #8346 修改内容

PR 只有一个提交：

- `fd30ebdd0 fix(workflow): normalize legacy agent tool inputs at the migration boundary`

修改两个文件：

- `packages/global/core/workflow/migration/migrate.ts`
- `packages/global/test/core/workflow/migration/schema.test.ts`

PR 没有修改持久化 schema、数据库字段、依赖、权限、计费或 Pro 指针；它修正的是进入 strict schema 前的迁移投影。

### 修改前

迁移只在 `inputs` 缺失时用 `config` 推导 `{ key, mode }`；`inputs` 已经是数组时直接保留。只要数组中的元素是完整 NodeIO，后续 `CanonicalSelectedToolsValueSchema` 就可能在 `inputs[].mode` 上失败：

```text
Zod validation error: expected one of "agentGenerated" | "manual"
```

影响入口包括保存/发布工作流和依赖迁移的服务端读取路径。PR 描述中提到的 `/api/core/chat/chatTest` 是额外症状；其请求 schema 当前仍先对 tool inputs 做 canonical 校验，迁移没有覆盖该入口，见“遗留风险”。

### 修改后

新增 `normalizeAgentToolInputs`，对每个工具输入统一归一：

1. 保留合法的 `key`，按 key 去重并丢弃非法项；
2. `mode` 优先使用已保存的合法值；
3. 没有合法 mode 时，根据历史 `selectedType` 或 `renderTypeList` 调用现有 `getAgentToolInputMode`，显式 manual 不会被值推断覆盖；
4. 没有来源类型时，才通过 `isToolInputValueConfigured` 和已有 `config` 判断是否 manual；
5. manual 的 `input.value` 搬入 `config[key]`，已有非空 config 优先，空字符串、`false` 和 `0` 保留；
6. 其余 NodeIO 字段丢弃；
7. 通过定义属性写入 `config`，保护 `__proto__` 等特殊参数名；用 `Object.hasOwn` 避免读到 `toString` 等原型成员；
8. 如果 `selectedTools` 是 `[nodeId, outputId]` 引用二元组，原样保留。

最终结果符合当前持久化契约：

```ts
{
  inputs: [{ key: 'query', mode: 'manual' }],
  config: { query: 'saved value' }
}
```

迁移是幂等的：canonical 记录再次迁移结果不变。

### 测试覆盖

PR 的 `schema.test.ts` 覆盖：

- 完整 NodeIO 转换为 `{ key, mode }`；
- 手动值搬入 `config`；
- 已有 config 优先；
- 显式 manual 和 agentGenerated；
- 无来源类型时按 config 判断；
- 非法 mode 和枚举值修复；
- `null` config 回退到旧 `value`；
- 参数名 `toString` 的原型成员边界；
- canonical 数据重复迁移幂等。

本地执行：

```text
pnpm test packages/global/test/core/workflow/migration/schema.test.ts
Test Files  1 passed (1)
Tests       74 passed (74)
```

`git diff --check main...HEAD` 通过。PR 原始 head 的两个改动文件未通过 Prettier `--check`；本地已通过 Prettier 格式化，格式化只调整换行和测试 describe 的缩进嵌套，之后测试仍为 74/74。

## 遗留风险

### chatTest 的 API 校验入口

PR 描述提到 `POST /api/core/chat/chatTest` 的静默 400，但 `ChatTestPropsSchema` 在 handler 开始处由 `parseApiInput` 直接校验，尚未调用 `migrateWorkflowToCurrent`。因此：

- 通过 publish/version 等 migration 路径提交的旧快照可以在 pr-8346 修复；
- 直接把原始完整 NodeIO 快照发给 chatTest，仍可能先被 request schema 拒绝；
- 这是 PR 前的既有入口边界，PR 代码没有新增该拒绝行为。

需要作者二选一：给 chatTest 增加显式迁移边界，或收窄 PR 描述，明确 chatTest 仅属于迁移后请求场景。

### 旧 NodeIO 的敏感值

PR 会把 manual 输入中的 `value` 搬到 `config`。如果旧快照中包含密码、密钥或其它敏感值，迁移负责值搬运，真实工具定义、加密和脱敏仍由既有保存边界处理。不能只因为字段叫 `value` 就跳过回填，否则会静默丢失用户配置；也不能把旧 NodeIO 的所有字段当作可信定义。

### 加载失败工具

`rawInputs` 是服务端对无法加载工具的临时恢复载体，不属于正常持久化契约。迁移必须在工具定义尚未水合时保留可恢复来源，等工具再次可用后再按当前定义投影。

### 新增 Agent 节点后的异常链路

更准确地说，这不是 Agent 节点模板本身直接写出了错误形状，而是新增流程 Agent 复用了画布保存和工具归一化路径后，出现以下组合：

1. 画布上的 Agent 工具带完整 NodeIO，但缺少 `flowNodeType`，或者来自旧版独立 Agent 的预览快照；
2. 11/5 的保存逻辑按 `'flowNodeType' in tool` 判断，将该工具原样保留；
3. 保存/发布进入 `migrateWorkflowToCurrent`，旧迁移只处理“缺少 `inputs`”的工具，已有完整 `inputs` 数组直接透传；
4. `CanonicalSelectedToolsValueSchema` 要求 `inputs[].mode` 为 `agentGenerated | manual`，完整 NodeIO 的 `selectedType` 不是该枚举，抛出校验错误；
5. PR #8346 在迁移边界统一投影为 `{ key, mode }`，同时保留手动固定值到 `config`。

这个判断与 commit diff、类型契约和 PR 描述中的 500/400 症状一致。若要把它升级成生产事故结论，还应抽样确认实际异常工作流中工具快照是否确实缺少 `flowNodeType`；仅从代码路径可以确认“该形状会触发异常”，不能替代线上数据统计。

## 判断标准

后续修改 Agent 工具输入时，按以下边界判断：

- 编辑期完整 NodeIO：可以包含 `renderTypeList`、`selectedType`、`label`、`valueType`、`value`、`defaultValue`；
- 持久化工具配置：工具元数据可保留展示快照，工具输入只保留 `{ key, mode }`，固定值放在 `config`；
- 工作流迁移：负责把历史快照投影为持久化工具配置，并保持幂等；
- 服务端详情/运行时：按当前工具定义水合，不依赖旧快照的展示字段；
- `selectedTools` 二元组：按变量引用处理；
- 任何新入口如果接受外部 workflow：先进入统一迁移，再做 strict canonical 校验。
