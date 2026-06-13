# Workflow 变量替换 CPU 阻塞分析

## 背景

本分析只关注工作流变量替换里的 **CPU 阻塞** 问题，尤其是 Node.js 主线程被同步字符串扫描、正则替换、JSON 序列化卡住的风险。

当前先只考虑三个低风险优化点：

1. 公共 `replaceVariable`
2. `replaceEditorVariable`
3. workflow 调度 `getNodeRunParams`

暂不处理：

- HTTP JSON body 结构化替换
- Laf 节点局部替换
- 大对象 ref / lazy load
- 节点输出存储策略
- worker 化大文本替换

目标不是完全避免 `replace`，而是减少无意义的变量遍历、无意义的 `JSON.stringify` 和重复全文扫描。

## 问题判断

变量替换目前的主要风险不是单次 `String.prototype.replace`，而是：

- 模板只引用少量变量，但代码遍历了全部变量。
- 变量里有大对象，即使模板没引用，也可能被提前 `JSON.stringify`。
- 每个变量都构造正则并扫描完整文本。
- 每个 workflow node 运行前都构造完整 `runtimeVariables`。
- 每个 input 都尝试做文本替换，即使不是字符串或不包含变量占位符。

这些操作都发生在主线程。如果变量数量大、节点数量多、某些变量值很大，就可能造成 event loop 卡顿。

## 1. 公共 `replaceVariable`

文件：

- `packages/global/common/string/tools.ts`

主要调用点：

- `packages/service/core/workflow/dispatch/tools/textEditor.ts`
- `packages/global/core/workflow/runtime/utils.ts`
- `packages/service/core/workflow/dispatch/ai/chat.ts`
- `packages/service/core/workflow/dispatch/ai/utils.ts`

当前逻辑概要：

```ts
export function replaceVariable(text: any, obj: Record<string, any>, depth = 0) {
  if (typeof text !== 'string') return text;

  const replacements: { pattern: string; replacement: string }[] = [];

  for (const key in obj) {
    const val = obj[key];
    const formatVal = valToStr(val);
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    replacements.push({
      pattern: `{{${escapedKey}}}`,
      replacement: formatVal
    });
  }

  replacements.forEach(({ pattern, replacement }) => {
    result = result.replace(new RegExp(pattern, 'g'), () => replacement);
  });
}
```

### 当前问题

这个函数是变量替换的公共入口，被多个工作流路径复用。当前实现是“变量驱动”：

```txt
遍历所有变量 -> 每个变量格式化 -> 每个变量扫描全文替换
```

风险点：

- 即使文本没有 `{{xxx}}`，也会进入完整逻辑。
- 即使模板只引用 1 个变量，也会遍历 `obj` 里的所有变量。
- `valToStr` 遇到 object 会同步 `JSON.stringify`。
- 每个变量都新建一个正则并扫描一遍完整文本。
- 递归替换最多 10 层，会放大扫描成本。

复杂度接近：

```txt
变量数量 * 文本长度 + 所有变量 stringify 成本
```

更合理的复杂度应接近：

```txt
文本长度 + 实际出现变量数量 + 实际出现变量 stringify 成本
```

### 优化方向

改成“模板驱动”：

```txt
扫描模板里实际出现的 placeholder -> 只解析命中的变量
```

建议逻辑：

```ts
if (typeof text !== 'string') return text;
if (!text.includes('{{')) return text;

return text.replace(/{{([^}]+)}}/g, (match, key) => {
  if (!(key in obj)) return match;
  return valToStr(obj[key]);
});
```

实际实现需要继续保留现有语义：

- 未命中变量的处理方式要与现有行为对齐。
- replacement 中包含 `$1`、`$&`、`$'` 等特殊字符时，不能被 `replace` 当作替换语法。
- 嵌套变量替换语义保留，但不再递归调用自身。
- 使用 `while + depth` 处理嵌套变量，每轮没有变化时提前退出。
- 仍要保留最大深度保护。

建议结构：

```ts
let result = text;
let depth = 0;

while (depth <= MAX_REPLACEMENT_DEPTH && result.includes('{{')) {
  let changed = false;

  result = result.replace(/{{([^}]+)}}/g, (match, key) => {
    if (!(key in obj)) return match;

    const replacement = valToStr(obj[key]);
    if (replacement === match) return match;

    changed = true;
    return replacement;
  });

  if (!changed) break;
  depth++;
}
```

这样做的原因：

- 避免递归调用栈。
- 每轮扫描、替换、退出条件更清晰。
- 更容易统计每轮 placeholder 数量、stringify 次数和耗时。
- 后续加最大输出长度、最大替换次数等保护更方便。
- 循环引用仍由最大深度和 `changed` 判断兜底。

### 预期收益

- 未引用的大对象不会再触发 `JSON.stringify`。
- 模板短、变量多的场景明显减少 CPU。
- 多节点 workflow 中，公共替换成本整体下降。

### TextEditor 调用点

TextEditor 节点会直接调用公共 `replaceVariable`：

```ts
const textResult = replaceVariable(text, {
  ...customVariables,
  ...variableState.toRuntimeRecord()
});
```

当前 TextEditor 还有一个额外成本：

```ts
Object.keys(customVariables).forEach((key) => {
  let val = customVariables[key];

  if (typeof val === 'object') {
    val = JSON.stringify(val, null, 2);
  }

  customVariables[key] = val;
});
```

这会提前 stringify 所有 `customVariables` 里的 object，即使模板没有引用对应变量。

第一阶段可以先不单独重构 TextEditor，但公共 `replaceVariable` 优化后，TextEditor 仍建议同步做一个低风险调整：

- 不提前 stringify 全部 `customVariables`。
- 保留 TextEditor 当前展示格式需要时，再对实际命中的变量做 stringify。
- `variableState.toRuntimeRecord()` 后续可结合第 3 点一起 lazy 化。

这仍属于第 1 点的调用点优化，不单独扩展为新的优化范围。

### 风险

风险相对低，但需要测试覆盖：

- 普通变量替换。
- 未命中变量。
- 变量值为 `undefined`、`null`、object、array。
- replacement 包含 `$1`、`$&`、`$'`、``$` ``。
- 递归变量。
- 循环引用变量。

已有测试位置：

- `packages/global/test/common/string/tools.test.ts`

## 2. `replaceEditorVariable`

文件：

- `packages/global/core/workflow/runtime/utils.ts`

当前逻辑中，处理 `{{$node.output$}}` 前会先执行：

```ts
text = replaceVariable(text, variables);
```

随后再处理节点引用：

```ts
const variablePattern = /\{\{\$([^.]+)\.([^$]+)\$\}\}/g;
const matches = [...text.matchAll(variablePattern)];
```

### 当前问题

`replaceEditorVariable` 是 workflow input 处理的核心函数。它的问题主要在两个方面。

第一，普通变量替换会先对完整 `variables` 调用公共 `replaceVariable`：

- 如果文本只包含 `{{$node.output$}}`，也会先处理普通变量。
- 如果 `variables` 中有大对象，可能触发无意义 `JSON.stringify`。
- 这个问题会随公共 `replaceVariable` 优化而缓解，但这里仍应加快速路径。

第二，节点引用替换目前是：

```txt
matchAll 收集引用 -> 生成 replacements -> 每个 replacement 扫描全文
```

如果同一段文本里有多个节点引用，会重复扫描。

### 优化方向

建议分两层优化。

第一层：快速跳过。

```ts
if (typeof text !== 'string') return text;
if (text === '') return text;
if (!text.includes('{{')) return text;
```

第二层：避免对完整变量表做无意义处理。

普通变量：

- 依赖优化后的 `replaceVariable`。
- 或者新增 resolver 版本，只在扫描到 `{{key}}` 时读取 `variables[key]`。

节点引用：

- 从“收集 replacements 后逐个 replace”改成单次 `replace(variablePattern, callback)`。
- callback 中解析 `nodeId` 和 `outputId`。
- 只取实际命中的 node/output。
- 只对实际命中的值调用 `formatVariableValByType` 和 `valToStr`。

示意：

```ts
result = result.replace(variablePattern, (match, nodeId, id) => {
  const variableVal = resolveNodeOutput(nodeId, id);
  if (shouldSkipCircularReference(variableVal, `${nodeId}.${id}`)) {
    return match;
  }
  return valToStr(variableVal);
});
```

### 预期收益

- 不含变量的 input 直接跳过。
- 只含节点引用的文本，不再无意义处理全部普通变量。
- 多个节点引用时减少重复全文扫描。
- 未命中的大变量不会被 stringify。

### 风险

需要重点保护兼容行为：

- `{{key}}` 和 `{{$node.output$}}` 混合出现。
- 节点 output 不存在时的返回行为。
- 节点 input 作为变量值的兼容逻辑。
- 循环引用保护。
- 递归替换语义。

已有测试位置：

- `packages/global/test/core/workflow/runtime/utils.test.ts`

## 3. workflow 调度 `getNodeRunParams`

文件：

- `packages/service/core/workflow/dispatch/index.ts`

当前逻辑概要：

```ts
const runtimeVariables = this.data.variableState.toRuntimeRecord();

node.inputs.forEach((input) => {
  let value = replaceEditorVariable({
    text: input.value,
    nodesMap: this.runtimeNodesMap,
    variables: runtimeVariables
  });

  value = getReferenceVariableValue({
    value,
    nodesMap: this.runtimeNodesMap,
    variables: runtimeVariables,
    isReferenceVal: nodeInputIsReference(input)
  });

  params[input.key] = valueTypeFormat(value, input.valueType);
});
```

### 当前问题

这是 workflow 的调度热路径。每个节点运行前都会执行。

当前成本来源：

- 每个节点都会调用 `variableState.toRuntimeRecord()`。
- `toRuntimeRecord()` 会把变量 Map 转成普通对象。
- 每个 input 都会调用 `replaceEditorVariable`。
- 非 string input 也会进入 `replaceEditorVariable`，只是函数内部再返回。
- 不包含变量占位符的 string input 也会进入替换函数。
- 纯引用 input 先做文本替换，再做引用解析。

节点数量多时，这些成本会被放大。

### 优化方向

#### 3.1 runtimeVariables lazy 化

将：

```ts
const runtimeVariables = this.data.variableState.toRuntimeRecord();
```

改成按需获取：

```ts
let runtimeVariables: Record<string, unknown> | undefined;

const getRuntimeVariables = () => {
  runtimeVariables ??= this.data.variableState.toRuntimeRecord();
  return runtimeVariables;
};
```

只有在以下情况才调用：

- input 是变量引用，需要 `getReferenceVariableValue`。
- input 是包含 `{{` 的字符串，需要 `replaceEditorVariable`。

#### 3.2 非字符串跳过文本替换

调度层先判断：

```ts
const rawValue = input.value;
const needTextReplace = typeof rawValue === 'string' && rawValue.includes('{{');
```

不满足时不调用 `replaceEditorVariable`。

#### 3.3 纯引用优先解析

如果 `nodeInputIsReference(input)` 为 true，可以优先调用：

```ts
getReferenceVariableValue({
  value: input.value,
  nodesMap: this.runtimeNodesMap,
  variables: getRuntimeVariables(),
  isReferenceVal: true
});
```

这样纯引用值不需要先走文本替换。

需要注意：

- 如果某些历史 input 同时表现为 reference 和 string template，需要测试确认。
- 动态 input 的处理逻辑要保持现有行为。

### 预期收益

- 不使用变量的节点不再构造完整 runtimeVariables。
- 大量静态 input 不再进入替换逻辑。
- 纯引用 input 避免一次不必要的字符串替换流程。
- workflow 节点越多，收益越稳定。

### 风险

风险主要来自兼容性：

- plugin input 特殊路径。
- dynamic input。
- reference array。
- 变量节点引用。
- input valueType 格式化顺序。
- 节点 input 自引用或引用其他节点 input 的历史行为。

建议补充 dispatch 层单测，覆盖：

- 无变量 input 不调用 `toRuntimeRecord()`。
- 普通 `{{key}}` 变量仍能替换。
- `{{$node.output$}}` 变量仍能替换。
- 纯引用 input 仍能解析原始对象。
- dynamic input 行为不变。

## 建议落地顺序

### Step 1：优化公共 `replaceVariable`

优先原因：

- 覆盖面最大。
- 风险最低。
- 可以直接减少未引用变量的 `JSON.stringify`。
- TextEditor 等直接调用点可以同时受益。

完成标准：

- 改为 placeholder-driven。
- 用 `while + depth` 替代递归调用自身。
- 保留嵌套变量替换语义和循环保护。
- 补充单测。
- TextEditor 不再提前 stringify 未引用的 `customVariables` object。

### Step 2：优化 `replaceEditorVariable`

优先原因：

- workflow input 热路径依赖它。
- 可减少普通变量和节点引用的重复扫描。

完成标准：

- 加无占位符快速返回。
- 减少对完整变量表的无意义处理。
- 节点引用替换尽量单次扫描。
- 补充 runtime utils 单测。

### Step 3：优化 `getNodeRunParams`

优先原因：

- 每个 workflow node 都会经过。
- lazy 化后可以让完全不使用变量的节点直接避开变量表构造。

完成标准：

- `runtimeVariables` 按需构造。
- 非字符串 input 跳过文本替换。
- 无 `{{` 字符串跳过文本替换。
- 纯引用 input 优先走引用解析。
- 补充 dispatch 单测。

## 建议观测

为了确认优化效果，建议在后续实现中保留或增加轻量观测：

- `replaceVariable` 耗时
- `replaceEditorVariable` 耗时
- `toRuntimeRecord()` 耗时
- placeholder 数量
- 是否触发 object stringify
- stringify 输出长度

这些观测用于确认是否仍存在主线程同步热点。

## 结论

第一阶段只做 1、2、3：

1. 公共 `replaceVariable` 从变量驱动改成模板驱动。
2. `replaceEditorVariable` 增加快速跳过，并减少重复全文扫描。
3. workflow 调度 `getNodeRunParams` lazy 构造 runtimeVariables，并跳过不需要替换的 input。

这三项都属于低风险热路径优化，目标是减少无意义 CPU 消耗，不改变 HTTP JSON body、Laf 等兼容风险更高的逻辑。

## 实施记录

本次实现按上述三个低风险优化点落地，并额外把字符串同步处理上限改成系统级配置。

### 1. `replaceVariable` 实际优化

已将公共变量替换从“变量驱动”改成“模板驱动”：

- 无 `{{` 的字符串直接返回。
- 每一轮通过 `/\{\{([^}]+)\}\}/g` 扫描模板中的 placeholder。
- 只读取模板实际引用的 key。
- 只对实际命中的变量执行 `valToStr`。
- 同一轮内相同 key 使用 cache，避免重复 `JSON.stringify`。
- 保留嵌套变量替换，使用 `while + max depth` 替代递归调用。
- 保留未命中变量原样、`undefined` 转空字符串、`null` 转 `"null"`、object JSON 化等兼容语义。

复杂度从接近：

```txt
变量数量 * 文本长度 + 所有变量 stringify 成本
```

降为接近：

```txt
文本长度 + 实际命中 placeholder 数量 + 实际命中变量 stringify 成本
```

因此 `obj` key 越多、文本实际引用越少，新方案优势越明显。

### 2. `replaceEditorVariable` 实际优化

已做的调整：

- 非字符串、空字符串、无 `{{` 的文本直接返回。
- 继续复用优化后的 `replaceVariable` 处理普通变量，避免未引用变量 stringify。
- 节点引用从 `matchAll + 每个引用 replace 全文` 改成单轮 `replace` 扫描。
- 同一轮相同 `nodeId.outputId` 使用 cache。
- 保留 `VARIABLE_NODE_ID`、节点 output、节点 input 引用、`Map`/object `nodesMap` 等兼容行为。
- 保留最大深度保护和直接自引用保护。

### 3. dispatch `getNodeRunParams` 实际优化

已抽出 `getWorkflowNodeRunParams` 便于单测，并在调度热路径做 lazy 化：

- `runtimeVariables` 延迟到实际需要变量替换或引用解析时才调用 `variableState.toRuntimeRecord()`。
- 非字符串 input 不进入文本替换。
- 无 `{{` 的静态字符串不进入文本替换。
- 纯引用 input 优先直接解析引用值。
- 保留 `pluginInput`、dynamic input、`childrenNodeIdList`、`httpJsonBody` 和 `valueTypeFormat` 行为。

### 4. TextEditor 调用点优化

TextEditor 不再预先遍历并 stringify 所有 `customVariables`。当前通过 lazy `Proxy` 保留旧优先级和格式化行为：

- runtime variables 优先级高于 custom variables。
- custom object 只有在模板实际引用时才 `JSON.stringify(val, null, 2)`。
- number、boolean 保留原有字符串化行为。

### 5. 系统级字符串上限

原有 `checkStrOversize` 写死 `100,000,000` 字符。本次改成系统级环境变量：

```bash
SYSTEM_MAX_STRING_LENGTH_M=100
```

含义：

- 单位是 M，`1` 表示 `1,000,000` 字符。
- 有效范围是 `1 ~ 100`，由 `serviceEnv` 初始化时校验；非法值直接启动失败。
- 默认 `100`，也就是 `100,000,000` 字符。
- 该限制是系统级同步字符串处理保护，不只属于工作流；目前主要由工作流变量替换路径使用。
- 变量替换工具已从 `@fastgpt/global` 移到 `@fastgpt/service`，内部直接使用 `serviceEnv` 初始化后导出的 `SYSTEM_MAX_STRING_LENGTH`；调用方不再传递 `maxStringLength`。
- `@fastgpt/global` 只保留纯工具和 workflow runtime 数据格式化逻辑，避免 global 反向依赖 service。

部署模板、Helm values 和中文/英文环境变量文档已同步。

## 性能对比

使用独立 `node --expose-gc` 脚本对比旧逻辑和新逻辑，结果取多轮中位数。测试重点是大字符串、变量多但实际引用少、以及大对象未引用/少量引用场景。

### 5MB 文本

| 场景 | 旧方案 | 新方案 | 提升 |
| --- | ---: | ---: | ---: |
| 5MB，无占位符，1000 个 primitive 变量 | 80.89ms | 0.09ms | 880x |
| 5MB，引用 1 个 primitive，1000 个变量 | 99.28ms | 21.90ms | 4.53x |
| 5MB，引用 10 个 primitive，1000 个变量 | 161.39ms | 60.67ms | 2.66x |

### 10MB 稀疏占位符文本

| 场景 | 旧方案 | 新方案 | 提升 | stringify 次数（旧/新） |
| --- | ---: | ---: | ---: | ---: |
| 10MB，引用 1 个 primitive，1000 个变量 | 167.33ms | 2.33ms | 71.7x | 0 / 0 |
| 10MB，引用 5 个 primitive，1000 个变量 | 170.61ms | 2.23ms | 76.4x | 0 / 0 |
| 10MB，引用 1 个 10KB object，1000 个 object 变量 | 171.96ms | 2.29ms | 75.2x | 1000 / 1 |
| 10MB，引用 5 个 10KB object，1000 个 object 变量 | 174.64ms | 2.19ms | 79.9x | 1000 / 5 |

### 100,000,000 字符

`100,000,000` 字符约等于 `95.37MB` ASCII 文本。该长度是默认上限，超过才会被 `checkStrOversize` 拦截。

| 场景 | 旧方案 | 新方案 | 提升 | stringify 次数（旧/新） |
| --- | ---: | ---: | ---: | ---: |
| 100M，无占位符，1000 个 primitive 变量 | 1638.16ms | 1.64ms | 998.88x | 0 / 0 |
| 100M，稀疏 1 个 primitive 引用，1000 个变量 | 1614.71ms | 25.75ms | 62.71x | 0 / 0 |
| 100M，稀疏 5 个 primitive 引用，1000 个变量 | 1734.82ms | 27.57ms | 62.92x | 0 / 0 |
| 100M，稀疏 1 个 10KB object 引用，1000 个 object 变量 | 1636.83ms | 29.17ms | 56.11x | 1000 / 1 |

结论：

- 旧方案在大文本下会稳定造成秒级 event loop 阻塞。
- 新方案把常见稀疏引用场景降到几十毫秒以内。
- 100M 量级字符串本身仍然不适合在主请求线程同步处理；后续如线上仍频繁出现，应继续推进大值引用化、分块处理或 worker 化。

## Review 关注点

本次改动需要重点关注以下兼容点：

- 未命中变量是否仍保持原占位符。
- `undefined`、`null`、object、array 的输出是否与旧逻辑一致。
- replacement 里包含 `$1`、`$&`、`$'`、``$` `` 时是否按字面量输出。
- 嵌套变量是否仍能展开。
- 直接自引用是否不会死循环。
- `replaceEditorVariable` 的节点 output/input 引用是否保持旧行为。
- dynamic input 是否仍同时写入动态参数对象和顶层参数。
- `SYSTEM_MAX_STRING_LENGTH_M` 是否按 M 单位在 `serviceEnv` 初始化时校验为 `1 ~ 100`。
