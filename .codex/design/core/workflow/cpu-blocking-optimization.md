# 工作流 CPU 阻塞优化方案

> 基于 `.claude/issue/workflow-thread-blocking-analysis.md` 中的分析结论，给出逐项优化方案。

---

## 方案一：节点/输出 O(1) 索引（最高优先级）✅

### 问题

`replaceEditorVariable` 和 `getReferenceVariableValue` 每次调用都用 `nodes.find()` O(N) 线性扫描，在大型工作流（50节点 × 10输入 × 5引用）中产生 2500 次 O(N) 扫描，全部同步。

### 方案

**在 `WorkflowQueue` 构造时，一次性建立两级 Map 索引**，然后向下传递，替换所有 `nodes.find()`。

#### 1.1 新增 OutputIndex 类型

```ts
// packages/global/core/workflow/runtime/type.ts 新增
export type NodeOutputIndex = Map<string, Map<string, NodeOutputItemType>>;
// key: nodeId → Map<outputId → output>
```

#### 1.2 构造函数建立索引

```ts
// packages/service/core/workflow/dispatch/index.ts
constructor(...) {
  this.runtimeNodesMap = new Map(data.runtimeNodes.map((item) => [item.nodeId, item]));

  // 新增：输出值索引，O(1) 查找
  this.nodeOutputIndex = new Map(
    data.runtimeNodes.map((node) => [
      node.nodeId,
      new Map(node.outputs.map((output) => [output.id, output]))
    ])
  );

  // 已有的边/图算法...
}
```

#### 1.3 修改两个工具函数签名，增加可选 Map 参数

```ts
// getReferenceVariableValue 增加 nodesMap 参数
export const getReferenceVariableValue = ({
  value,
  nodes,
  nodesMap,       // 新增：优先使用 Map，无则降级到 nodes.find()
  variables
}: {
  value?: ReferenceValueType;
  nodes: RuntimeNodeItemType[];
  nodesMap?: Map<string, RuntimeNodeItemType>;
  variables: Record<string, any>;
}) => {
  // ...
  const node = nodesMap
    ? nodesMap.get(sourceNodeId)
    : nodes.find((n) => n.nodeId === sourceNodeId);
  // ...
};

// replaceEditorVariable 同理增加 nodesMap 参数
export function replaceEditorVariable({
  text, nodes, nodesMap, variables, depth = 0
}: {
  // ...
  nodesMap?: Map<string, RuntimeNodeItemType>;
}) {
  // nodes.find() 全部替换为 nodesMap?.get() ?? nodes.find()
}
```

#### 1.4 调用侧传入 Map

```ts
// packages/service/core/workflow/dispatch/index.ts - getNodeRunParams
node.inputs.forEach((input) => {
  let value = replaceEditorVariable({
    text: input.value,
    nodes: this.data.runtimeNodes,
    nodesMap: this.runtimeNodesMap,  // 传入预建 Map
    variables: this.data.variables
  });
  value = getReferenceVariableValue({
    value,
    nodes: this.data.runtimeNodes,
    nodesMap: this.runtimeNodesMap,  // 传入预建 Map
    variables: this.data.variables
  });
});
```

**预期效果**：每次 `nodes.find()` O(N) → O(1) Map 查找，高频节点运行场景效果最明显。

---

## 方案二：RegExp 编译缓存 ✅

### 问题

`replaceEditorVariable` 每次调用对每个变量引用执行 `new RegExp(escapedPattern)`，正则编译有 CPU 开销，且模式是 `nodeId.outputId` 的确定性字符串，完全可以缓存。

### 方案

**模块级 Map 缓存已编译的 RegExp**：

```ts
// packages/global/core/workflow/runtime/utils.ts

// 模块级缓存，跨调用复用
const regexCache = new Map<string, RegExp>();

function getCachedRegex(pattern: string): RegExp {
  let re = regexCache.get(pattern);
  if (!re) {
    re = new RegExp(pattern, 'g');
    // 防止缓存无限增长（工作流变量数量有限，但多租户场景下累积）
    if (regexCache.size > 10000) regexCache.clear();
    regexCache.set(pattern, re);
  }
  return re;
}

// 替换原有的
// result = result.replace(new RegExp(pattern, 'g'), replacement);
// 改为：
result = result.replace(getCachedRegex(pattern), replacement);
```

注意：`RegExp` 带 `g` flag 使用时有 `lastIndex` 状态，每次调用前需要 reset：

```ts
const re = getCachedRegex(pattern);
re.lastIndex = 0;  // 重置，防止 g flag 状态残留
result = result.replace(re, replacement);
```

**预期效果**：相同变量名（常见场景：同一个工作流内节点反复引用相同变量）完全跳过正则编译。

---

## 方案三：Tarjan / DFS 递归改迭代

### 问题

`findSCCs` 和 `classifyEdgesByDFS` 均使用递归 DFS，递归深度 = 工作流拓扑深度。节点数 100+ 时，同步递归阻塞事件循环；节点数 10000+ 时（极端场景）有栈溢出风险。

### 方案

**用显式栈替换递归**，保持算法语义不变：

#### 3.1 迭代版 Tarjan

```ts
export function findSCCs(runtimeNodes: RuntimeNodeItemType[], edgeIndex: EdgeIndex): SCCResult {
  const nodeToSCC = new Map<string, number>();
  const sccSizes = new Map<number, number>();
  let sccId = 0;

  const stack: string[] = [];
  const inStack = new Set<string>();
  const lowLink = new Map<string, number>();
  const discoveryTime = new Map<string, number>();
  let time = 0;

  // 迭代版：使用显式调用栈
  // 每个栈帧记录 { nodeId, edgeIndex(当前处理到第几条出边) }
  for (const startNode of runtimeNodes) {
    if (discoveryTime.has(startNode.nodeId)) continue;

    const callStack: Array<{ nodeId: string; edgeIdx: number }> = [
      { nodeId: startNode.nodeId, edgeIdx: 0 }
    ];

    discoveryTime.set(startNode.nodeId, time);
    lowLink.set(startNode.nodeId, time++);
    stack.push(startNode.nodeId);
    inStack.add(startNode.nodeId);

    while (callStack.length > 0) {
      const frame = callStack[callStack.length - 1];
      const { nodeId } = frame;
      const outEdges = edgeIndex.bySource.get(nodeId) || [];

      if (frame.edgeIdx < outEdges.length) {
        const targetId = outEdges[frame.edgeIdx++].target;

        if (!discoveryTime.has(targetId)) {
          // 未访问：入栈，相当于递归调用
          discoveryTime.set(targetId, time);
          lowLink.set(targetId, time++);
          stack.push(targetId);
          inStack.add(targetId);
          callStack.push({ nodeId: targetId, edgeIdx: 0 });
        } else if (inStack.has(targetId)) {
          lowLink.set(nodeId, Math.min(lowLink.get(nodeId)!, discoveryTime.get(targetId)!));
        }
      } else {
        // 当前节点所有出边处理完毕，相当于递归返回
        callStack.pop();
        if (callStack.length > 0) {
          const parentId = callStack[callStack.length - 1].nodeId;
          lowLink.set(parentId, Math.min(lowLink.get(parentId)!, lowLink.get(nodeId)!));
        }

        // 判断是否为 SCC 根节点
        if (lowLink.get(nodeId) === discoveryTime.get(nodeId)) {
          const sccNodes: string[] = [];
          let w: string;
          do {
            w = stack.pop()!;
            inStack.delete(w);
            nodeToSCC.set(w, sccId);
            sccNodes.push(w);
          } while (w !== nodeId);
          sccSizes.set(sccId++, sccNodes.length);
        }
      }
    }
  }

  return { nodeToSCC, sccSizes };
}
```

`classifyEdgesByDFS` 同理改为迭代版（结构更简单，一个 `while` 循环替换递归 `dfs()`）。

**预期效果**：消除调用栈深度限制，计算时间不变但不会有栈溢出风险；代码结构更清晰，更易分段插入 yield 点（见方案五）。

---

## 方案四：`findBranchHandle` BFS 结果缓存

### 问题

`buildNodeEdgeGroupsMap` 对每个节点的每条入边调用 `findBranchHandle`，做一次向上回溯 BFS。同一个 source 节点被多条边共享时，BFS 结果是相同的，重复计算。整体 O(N²)。

### 方案

**以 `(sourceNodeId + sourceHandle)` 为 key 缓存 BFS 结果**：

```ts
private static groupEdgesByBranch(
  edges: RuntimeEdgeItemType[],
  edgeIndex: ...,
  nodesMap: Map<string, RuntimeNodeItemType>,
  isBranchNode: ...
): RuntimeEdgeItemType[][] {
  // 新增：缓存本次 buildNodeEdgeGroupsMap 调用内的 BFS 结果
  const branchHandleCache = new Map<string, string>();

  const edgeBranchMap = new Map<RuntimeEdgeItemType, string>();
  edges.forEach((edge) => {
    const cacheKey = `${edge.source}::${edge.sourceHandle ?? 'default'}`;
    let branchHandle = branchHandleCache.get(cacheKey);
    if (branchHandle === undefined) {
      branchHandle = this.findBranchHandle(edge, edgeIndex, nodesMap, isBranchNode);
      branchHandleCache.set(cacheKey, branchHandle);
    }
    edgeBranchMap.set(edge, branchHandle);
  });
  // ...
}
```

注意：`branchHandleCache` 在单次 `buildNodeEdgeGroupsMap` 调用内有效，不跨工作流实例共享（不同工作流拓扑不同）。

**预期效果**：重复边的 BFS 结果直接复用，从 O(N²) 降至接近 O(N×平均扇入)，节点多、分支多的工作流效果最明显。

---

## 方案五：构造函数完成后让出事件循环

### 问题

`WorkflowQueue` 构造函数里的图算法（方案一~四优化后仍有固定开销）全部同步完成，多个并发工作流请求时，这些同步计算依次占用主线程，导致后续请求等待。

### 方案

`WorkflowQueue` 本身是同步构造的，无法在构造函数里 `await`。可以把构造拆成两步，或者在 `runWorkflow` 入口构造完成后立即让出：

```ts
// packages/service/core/workflow/dispatch/index.ts - runWorkflow 函数
export async function runWorkflow(props: RunWorkflowProps): Promise<WorkflowQueue> {
  return new Promise((resolve) => {
    const queue = new WorkflowQueue({
      data: props,
      maxConcurrency: 10,
      defaultSkipNodeQueue: props.defaultSkipNodeQueue,
      resolve
    });

    // 构造完成（图算法已执行）后，先让出一次事件循环
    // 让其他并发请求有机会执行，避免连续多个工作流启动时的 CPU 连续占用
    setImmediate(() => {
      queue.addActiveNode(entryNodeId);
    });
  });
}
```

实际上 `runWorkflow` 现有代码里有 `addActiveNode` 的调用，在那里加一个 `await surrenderProcess()` 即可。

**预期效果**：每次工作流启动后主动让出一次，高并发时多个工作流的图初始化计算被事件循环交错调度，而不是连续堵塞。

---

## 实施优先级

| 方案 | 改动量 | 风险 | 效果 | 优先级 |
|------|-------|------|------|-------|
| 方案一：节点 O(1) 索引 | 中（函数签名变化，调用侧修改） | 低（向后兼容，可选参数） | ⭐⭐⭐⭐ | P0 |
| 方案二：RegExp 缓存 | 小（本地改动） | 极低 | ⭐⭐⭐ | P1 |
| 方案三：递归改迭代 | 中（逻辑重写，需测试） | 中（算法正确性需验证） | ⭐⭐（防栈溢出） | P1 |
| 方案四：BFS 缓存 | 小（加 Map 缓存） | 极低 | ⭐⭐⭐ | P1 |
| 方案五：构造后让出 | 极小（加一行） | 极低 | ⭐⭐（并发公平性） | P2 |

**建议执行顺序**：方案一 → 方案二 + 方案四（可并行）→ 方案三（配套单测）→ 方案五

---

## 改动文件清单

```
packages/global/core/workflow/runtime/
  ├── utils.ts          方案一（函数签名）、方案二（RegExp 缓存）
  └── type.ts           方案一（新增 NodeOutputIndex 类型）

packages/service/core/workflow/
  ├── dispatch/index.ts 方案一（传 Map）、方案四（BFS缓存）、方案五（让出）
  └── utils/tarjan.ts   方案三（递归改迭代）
```
