# xyflow (@xyflow/react v12) 迁移与架构最佳实践

本文档记录了从 React Flow v11 升级至 xyflow (`@xyflow/react` v12) 的核心破坏性变更、设计模式以及在 FastGPT 工作流中的落地最佳实践。

---

## 一、核心变更与类型规范

### 1. 依赖与样式引入
* **包名**：`reactflow` 升级为 `@xyflow/react`（统一框架架构，底层共享 `@xyflow/system`）。
* **样式路径**：
  ```tsx
  import '@xyflow/react/dist/style.css';
  ```
  底层类名前缀保持 `.react-flow*`，FastGPT 现有的 `reactflow.scss` 保持完全兼容。

### 2. TypeScript `NodeProps` 泛型签名
* **v11**：泛型参数为 `data` 的结构：`NodeProps<T = any>`。
* **v12**：泛型参数变更为完整的 `Node` 类型：`NodeProps<NodeType extends Node = Node>`。
* **规范定义**：
  ```tsx
  import type { Node, NodeProps } from '@xyflow/react';
  import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';

  // 自定义节点组件标准签名：
  const CustomNode = ({ data, selected }: NodeProps<Node<FlowNodeItemType>>) => { ... };
  ```

---

## 二、尺寸机制：彻底拥抱 `node.measured`

在 v12 之前，DOM 测量尺寸会直接回写覆盖 `node.width` / `node.height`。而在 v12 中：
* **`node.measured.width` / `node.measured.height`**：表示节点在 DOM 中真实渲染计算出来的尺寸（只读）。
* **`node.width` / `node.height`**：仅代表用户显式锁定的固定尺寸或用于 SSR 首屏占位。

### 最佳实践规则
1. **禁止使用回退逻辑**（例如 `node.measured?.width ?? node.width`）：
   动态撑高或折叠卡片在画布渲染后，真实尺寸必然存于 `node.measured`。
   ```ts
   // 正确用法
   const width = node.measured?.width ?? 0;
   const height = node.measured?.height ?? 0;
   ```
2. **测试用例 Mock 规范**：
   在编写单元测试构造模拟节点时，需注入 `measured: { width, height }`，以贴合真实渲染运行时。
3. **嵌套容器尺寸计算**：
   嵌套容器（如 Loop、ParallelRun）测量子节点外包围盒时，直接读取子节点的 `node.measured` 坐标边界。

---

## 三、官方 Hooks 深度替代自定义 Context（去 Context 化）

在历史实现中，FastGPT 将 `nodes`、`edges`、`setNodes`、`setEdges`、`getNodeById` 打包在自定义的大上下文 `WorkflowBufferDataContext` 中。任何微小变动通过 `(v) => v` 广播会导致全画布节点与边连带重新渲染。

在 v12 中，应全面遵循以下替换原则：

### 1. 连线拖拽状态：用 `useConnection()` 替代上下文广播
* **问题**：过去通过上下文传递 `connectingEdge`，连线一开始就触发全画布 Handles 重新渲染。
* **方案**：改用官方原生 `useConnection()`：
  ```tsx
  const connection = useConnection();
  const isConnecting = connection.inProgress;
  const isConnectingThisHandle = isConnecting && connection.fromHandle?.id === handleId;
  const isConnectingFromThisNode = isConnecting && connection.fromNode?.id === nodeId;
  ```
  Handle 组件直接监听内部连线引擎，彻底解除对外部 Context 的依赖。

### 2. 句柄连接状态：用 `useHandleConnections()` 替代全局 `edges.some`
* **问题**：每个 Handle 组件遍历全局 `edges` 查找是否有连接自身。
* **方案**：改用官方细粒度订阅 Hook：
  ```tsx
  const sourceConnections = useHandleConnections({ type: 'source', id: handleId });
  const connected = sourceConnections.length > 0;
  ```
  仅在与当前 Handle 相关的 Edge 增删时才会触发该单个 Handle 的重渲染。

### 3. 跨节点数据读取：用 `useNodesData()` 替代 `getNodeById`
* **问题**：子节点频繁调用 Context 中的 `getNodeById` 轮询父节点状态。
* **方案**：采用响应式单向订阅：
  ```tsx
  const parentNode = useNodesData<Node<FlowNodeItemType>>(parentNodeId ?? '');
  const isParentFolded = !!parentNode?.data?.isFolded;
  ```
  只有目标节点的 `data` 发生改变时，订阅者才会响应更新。

### 4. 读写操作直接使用 `useReactFlow()`
* **`getNodes()` / `getEdges()`**：在事件回调（如点击、添加节点、自动排版）中按需命令式读取，不引入响应式渲染依赖。
* **`deleteElements()`**：删除连线或节点直接调用官方 API：
  ```tsx
  const { deleteElements } = useReactFlow();
  deleteElements({ edges: [{ id: edgeId }] });
  ```
* **`getNode(id)`**：取代自定义映射字典，直接按 ID 查询特定节点的内部数据。

### 5. 画布初始化居中：用 `useNodesInitialized()` 替代循环轮询
* **问题**：旧版依赖 `setTimeout` 加上手动 `nodes.every(n => n.width && n.height)` 检查节点是否就绪。
* **方案**：
  ```tsx
  const { fitView } = useReactFlow();
  const fitViewDone = useRef(false);
  const nodesInitialized = useNodesInitialized();

  useEffect(() => {
    if (!nodesInitialized || fitViewDone.current || !nodes.length) return;
    fitViewDone.current = true;
    fitView({ padding: 0.3 });
  }, [nodesInitialized, nodes, fitView]);
  ```

---

## 四、排版算法（Dagre）解耦最佳实践

在 `ContextMenu.tsx` 的自动排列排版中：
1. **禁止在 `setNodes` 内部嵌套调用 `setEdges`**。
2. 布局计算前直接通过 `getNodes()` 和 `getEdges()` 取当前快照：
   ```tsx
   const currentNodes = getNodes() as Node<FlowNodeItemType>[];
   const currentEdges = getEdges();
   const newNodes = cloneDeep(currentNodes);
   ```
3. 坐标计算后，仅触发一次单向状态更新：`setNodes(newNodes)`。
4. 视口居中交给 `window.requestAnimationFrame(() => fitView({ padding: 0.3 }))` 平滑调度。
