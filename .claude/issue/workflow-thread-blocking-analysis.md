# 工作流 CPU 阻塞模块分析

> 从 `packages/service/core/workflow/dispatch/index.ts` 入口出发，排查所有**同步占用 CPU、阻塞整个进程**的模块。

Node.js 单线程模型下，CPU 阻塞指：在当前调用栈未让出事件循环（无 `await`）的情况下执行大量计算，导致其他请求无法被处理。

---

## 一、`WorkflowQueue` 构造函数——图算法批量同步执行

**文件**: `packages/service/core/workflow/dispatch/index.ts:348`

每次创建工作流实例时，构造函数**同步**依次执行：

```ts
constructor(...) {
  // 1. O(E) 构建边索引
  this.edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges });

  // 2. O(N+E) DFS 边分类  ← 递归，全同步
  // 3. O(N+E) Tarjan SCC  ← 递归，全同步
  // 4. O(N²) BFS per node ← 每个节点一次 BFS 回溯
  this.nodeEdgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({ ... });
}
```

三个算法全部是纯同步的 CPU 密集计算，无任何 `await` 让出点。

---

## 二、Tarjan SCC 算法——递归 DFS，无让出

**文件**: `packages/service/core/workflow/utils/tarjan.ts:31`

```ts
function tarjan(nodeId: string) {
  // ...
  for (const edge of outEdges) {
    if (!discoveryTime.has(targetId)) {
      tarjan(targetId);  // ⚠️ 同步递归，无 await
    }
  }
}
for (const node of runtimeNodes) {
  tarjan(node.nodeId);   // 对每个未访问节点启动递归
}
```

**问题**：
- 纯同步递归，执行期间完全占用 Event Loop。
- 节点数 N 较大（如 100+ 节点）时，递归深度 = 工作流拓扑深度，调用栈可能很深。
- 同文件 `classifyEdgesByDFS` 也是完全相同的递归 DFS 结构，与 Tarjan 串行执行，等于一次工作流启动 **做两遍图遍历**。

---

## 三、`findBranchHandle`——每节点一次 BFS，合计 O(N²)

**文件**: `packages/service/core/workflow/dispatch/index.ts:543`

```ts
private static buildNodeEdgeGroupsMap(...) {
  runtimeNodes.forEach((targetNode) => {
    // 对每个节点的每条边，调用 findBranchHandle
    const branchGroups = this.groupEdgesByBranch(nonBackEdges, ...);
  });
}

private static findBranchHandle(edge, ...) {
  const queue = [{ nodeId: edge.source, ... }];
  while (queue.length > 0) {
    // BFS 向上回溯，最坏遍历所有节点  ← 纯同步
    const inEdges = edgeIndex.byTarget.get(nodeId) || [];
    for (const inEdge of inEdges) {
      queue.push({ nodeId: inEdge.source, ... });
    }
  }
}
```

**问题**：
- `buildNodeEdgeGroupsMap` 在构造函数中对每个节点调用，每次调用又做一次 BFS。
- 最坏复杂度 O(N × (N + E))，对于 100 节点、200 边的工作流约为 30000 次循环迭代，全同步。

---

## 四、`replaceEditorVariable`——每节点每输入做正则+递归，全同步

**文件**: `packages/global/core/workflow/runtime/utils.ts:372`

每次节点运行前，`getNodeRunParams` 对每个 input 都调用：

```ts
node.inputs.forEach((input) => {
  // 每个 input 都调用一次 replaceEditorVariable
  let value = replaceEditorVariable({
    text: input.value,
    nodes: this.data.runtimeNodes,  // 传入所有节点
    variables: this.data.variables
  });
  value = getReferenceVariableValue({ value, nodes, variables });
});
```

`replaceEditorVariable` 内部：

```ts
// 1. 全局正则匹配，提取所有变量引用
const matches = [...text.matchAll(variablePattern)];

for (const match of matches) {
  // 2. nodes.find() O(N) 线性扫描
  const node = nodes.find((node) => node.nodeId === nodeId);
  // 3. 每个变量编译一次新 RegExp ← 正则编译有 CPU 开销
  replacements.push({ pattern: `\\{\\{\\$${escapedNodeId}...`, replacement: formatVal });
}

// 4. 如果有嵌套变量，递归调用自身（最多 depth=10）
if (hasReplacements && /\{\{\$[^.]+\.[^$]+\$\}\}/.test(result)) {
  result = replaceEditorVariable({ text: result, nodes, variables, depth: depth + 1 });
}
```

**问题**：
- **每次 `nodes.find()`** 是 O(N) 线性扫描，完全没有缓存。一个节点有 10 个 input、每个 input 引用 5 个变量、工作流有 50 个节点 → **2500 次 O(N) 扫描**。
- **每个变量引用** `new RegExp(pattern)` 一次，正则编译有 CPU 成本。
- **最多 10 层递归**，每层都重复上述过程。
- 整个函数链（`replaceEditorVariable` + `getReferenceVariableValue`）全同步，**每个节点运行前都会触发，且节点越多调用越频繁**。

---

## 五、`getReferenceVariableValue`——O(N) 数组扫描，无缓存

**文件**: `packages/global/core/workflow/runtime/utils.ts:297`

```ts
const node = nodes.find((node) => node.nodeId === sourceNodeId);  // O(N)
return node.outputs.find((output) => output.id === outputId)?.value;  // O(outputs)
```

**问题**：
- 每次调用都线性扫描整个 `nodes` 数组。
- 被 `replaceEditorVariable` 频繁调用（每个变量引用一次）。
- `nodes` 数组在运行时不会变化（节点结构固定），却没有预建索引，每次都从头扫。

---

## 汇总

| 位置 | 函数 | 复杂度 | 触发时机 | 是否有让出点 |
|------|------|--------|---------|------------|
| `dispatch/index.ts` 构造函数 | `buildEdgeIndex` | O(E) | 每次工作流启动 | ❌ 无 |
| `utils/tarjan.ts` | `classifyEdgesByDFS` | O(N+E) 递归 | 每次工作流启动 | ❌ 无 |
| `utils/tarjan.ts` | `findSCCs (tarjan)` | O(N+E) 递归 | 每次工作流启动 | ❌ 无 |
| `dispatch/index.ts` | `buildNodeEdgeGroupsMap` + `findBranchHandle` | O(N²) | 每次工作流启动 | ❌ 无 |
| `runtime/utils.ts` | `replaceEditorVariable` | O(N × inputs × depth) | 每节点运行前 | ❌ 无 |
| `runtime/utils.ts` | `getReferenceVariableValue` | O(N) per call | 每 input 一次 | ❌ 无 |

**最严重的场景**：大型工作流（100+ 节点）并发启动时，构造函数中的图算法（第一~四项）全部同步执行，每个请求都会独占 Event Loop 若干毫秒，并发时互相堆叠，导致明显卡顿。

**最高频的场景**：Agent 节点有大量工具调用时，每轮工具调用后节点重新 resolve 触发下游节点的参数注入，`replaceEditorVariable` 被高频调用，且每次都对所有节点做线性扫描。
