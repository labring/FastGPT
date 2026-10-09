# xyflow (@xyflow/react v12) 迁移与架构最佳实践

本文档记录了从 React Flow v11 升级至 xyflow (`@xyflow/react` v12) 的核心破坏性变更、设计模式以及在 FastGPT 工作流中的落地最佳实践与重构实施方案。

---

## 一、核心变更与类型规范

### 1. 依赖与样式引入
* **包名**：`reactflow` 升级为 `@xyflow/react`（统一框架架构，底层共享 `@xyflow/system`）。
* **样式路径**：
  ```tsx
  import '@xyflow/react/dist/style.css';
  ```
  底层类名前缀保持 `.react-flow*`，FastGPT 现有的 `reactflow.scss` 保持完全兼容。

### 2. TypeScript `NodeProps` 与类型辨识联合
* **v11**：泛型参数为 `data` 的结构：`NodeProps<T = any>`。
* **v12**：泛型参数变更为完整的 `Node` 类型：`NodeProps<NodeType extends Node = Node>`。
* **规范定义与强类型辨识联合**：
  ```tsx
  import type { Node, NodeProps, NodeTypes, Edge, EdgeTypes } from '@xyflow/react';
  import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
  import type { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

  // 1. 强类型节点与边
  export type FastGPTWorkflowNode<T extends FlowNodeTypeEnum = FlowNodeTypeEnum> = Node<
    FlowNodeItemType,
    T
  >;
  export type FastGPTWorkflowEdge = Edge<{ isHover?: boolean }>;

  // 2. 自定义节点组件标准签名：
  export const CustomNode = ({ data, selected }: NodeProps<FastGPTWorkflowNode>) => { ... };

  // 3. 官方 NodeTypes 强类型声明（取代 Record<FlowNodeTypeEnum, any>）：
  export const nodeTypes: NodeTypes = {
    [FlowNodeTypeEnum.emptyNode]: NodeSimple,
    [FlowNodeTypeEnum.workflowStart]: NodeWorkflowStart,
    // ...
  };
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

在历史实现中，FastGPT 将 `nodes`、`edges`、`setNodes`、`setEdges`、`getNodeById` 打包在自定义的大上下文 `WorkflowBufferDataContext` 及外层 9 层 Context 中。任何微小变动通过 `(v) => v` 广播会导致全画布节点与边连带重新渲染。

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

### 2. 句柄连接状态：用 `useNodeConnections()` 替代全局 `edges.some`
* **问题**：每个 Handle 组件调用 `const edges = useEdges()` 并全局遍历查找是否有连接自身，导致画布任何一处连线变动引发所有 Handle 重绘。
* **方案**：改用官方推荐的细粒度订阅 Hook `useNodeConnections`（注：v12 中 `useHandleConnections` 已被废弃）：
  ```tsx
  const sourceConnections = useNodeConnections({ id: nodeId, handleType: 'source', handleId });
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
* **`updateNodeData(id, data, { replace? })`**：更新单节点数据直接调用官方 API，由 React Flow 内部 store 处理，无需遍历重构整个 `nodes` 数组。

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

---

## 五、状态管理重构（Zustand Store 方案 A：彻底解构 9 层 Context）

### 1. 现状痛点
FastGPT 目前在 `WorkflowComponents/context/` 中堆叠了 9 层 React Context Provider：
`ReactFlowProvider` -> `WorkflowInitContextProvider` -> `WorkflowBufferDataContext` -> `WorkflowSnapshotProvider` -> `WorkflowActionsProvider` -> `WorkflowUtilsProvider` -> `WorkflowDebugProvider` -> `WorkflowUIProvider` -> `WorkflowModalProvider` -> `WorkflowPersistenceProvider` -> `WorkflowComputeProvider`。
- `nodes` 和 `edges` 处于顶层，每次拖拽导致顶层 Context 重算，执行 `nodeFormat` 和 `useMemoEnhance` 的 `lodash.isEqual` 深比较；
- 各层 Context 相互引用（例如 Action 引用 BufferData，Snapshot 引用 BufferData），导致渲染链路冗长。

### 2. 方案 A：构建统一 `useWorkflowStore` (Zustand + Slice)
基于 `packages/web/common/zustand`（已内置 `create`, `immer`, `devtools`），构建统一的领域 Store：
- **`NodeSlice`**：管理 `nodes`、`onNodesChange`、`setNodes`、`updateNodeData`、`selectedNodeIds`、`foldedNodesMap`；
- **`EdgeSlice`**：管理 `edges`、`onEdgesChange`、`setEdges`、`onConnect`、`delEdge`；
- **`SnapshotSlice (History)`**：在 Zustand 内部直接实现统一的历史记录切片（`past`, `future`, `undo`, `redo`, `pushPastSnapshot`）；
- **`UISlice`**：管理 `workflowControlMode`、`menu`、`presentationMode`、`hoverEdgeId`；
- **`ModalSlice`**：管理模板选择、参数配置、弹窗状态。

### 3. 收益
- 彻底移除 `useMemoEnhance` 渲染期的 `lodash.isEqual` 深比较；
- 清理生产代码中遗留的 `console.log('WoworkflowBufferDataContextValue 更新了')`；
- 通过精确 Selector（如 `useWorkflowStore(s => s.nodes)`）实现按需最小化渲染。

---

## 六、原生 Sub-flow（嵌套/循环节点）架构演进

### 1. 现状痛点
Loop 节点使用 `node.data.parentNodeId`，子节点保持画布绝对坐标。父容器拖动时，在 `useWorkflow.tsx` 中手动用数学公式计算 `deltaX/deltaY` 并批量修改所有子节点坐标；同时使用 `useDeepCompareEffect` 在每次 `nodeList` 变化时循环 `setNodes` 强行覆盖 `zIndex: 1001`。

### 2. 原生 Sub-flow 最佳实践
- 子节点使用 xyflow 原生属性：`node.parentId = loopNodeId`，并设置 `extent: 'parent'` 天然限制子节点不可越界拖出父容器；
- 子节点坐标转为相对于父容器左上角的相对坐标（$X_{rel}, Y_{rel}$），React Flow 原生引擎以 GPU transform 级别平滑联动，无需手写任何位移计算；
- **坐标兼容与持久化边界**：
  - 加载时（`storeNode2FlowNode`）：$X_{rel} = X_{abs} - X_{parent}$；
  - 保存时（`uiWorkflow2StoreWorkflow`）：$X_{abs} = X_{parent} + X_{rel}$；
  - 保证入库与后端执行引擎的 100% 格式兼容；
- 移除 Effect 中通过 `setNodes` 强行覆盖 `zIndex: 1001` 的代码，通过 CSS 层级或静态规则声明。

---

## 七、视口虚拟化（`onlyRenderVisibleElements`）与边界防护机制

在 `<ReactFlow />` 上启用 `onlyRenderVisibleElements={true}`，针对 3 项潜在边界采取防护措施：

1. **离屏节点尺寸测量**：FastGPT 在首次加载时依托 `useNodesInitialized` 触发一次全图 `fitView`，所有初始节点均完成初次测量并被 xyflow 缓存，后续平移缩放不会丢失尺寸；
2. **节点搜索跳转与高亮**：`SearchButton` 使用数据级 `useReactFlow().fitView({ nodes: [node], padding: 0.6 })` 移动视口，平移后引擎自动将目标节点挂载入 DOM，不依赖原生 DOM 选择器；
3. **全流程图导出为图片**：导出截图前临时设置 `onlyRenderVisibleElements=false`，渲染一帧截图完成后恢复。

---

## 八、重构实施路线图 (Todo)

- [x] **Phase 1: 句柄与连线核心性能改造（立即见效，低风险）**
  - [x] `ButtonEdge` 加上 `React.memo`，移除内部 `edges = useEdges()` 与 `getNodes()` 构造 Map 扫描
  - [x] `ConnectionSourceHandle` 和 `ConnectionTargetHandle` 彻底移除 `useEdges()`，使用 `useNodeConnections` 替代 `edges.some`
  - [x] `ToolTargetHandle` 移除 `useEdges()` 残留，接入 `useNodeConnections`
  - [x] `<ReactFlow />` 接入 `isValidConnection` 引擎校验与 `onlyRenderVisibleElements={true}` 视口虚拟化
- [x] **Phase 2: 类型系统标准化**
  - [x] 完善 `FastGPTWorkflowNode` 与 `FastGPTWorkflowEdge` 辨识联合类型
  - [x] `nodeTypes` 采用官方 `NodeTypes` 强类型定义
- [x] **Phase 3: 状态管理重构 (Context -> Zustand Store - 方案 A)**
  - [x] 搭建 `useWorkflowStore` 与各领域 Slices（含基于 Zustand 的统一 HistorySlice）
  - [x] 移除 `useMemoEnhance` 渲染期 `isEqual` 计算与生产环境 log
  - [x] 全面支持 `updateNodeData`
- [x] **Phase 4: 原生 Sub-flow 坐标系迁移**
  - [x] 在 `storeNode2FlowNode` 中支持相对坐标与 `parentId` + `extent: 'parent'`
  - [x] 在 `uiWorkflow2StoreWorkflow` 中做绝对坐标回算适配
  - [x] 彻底移除 `handlePositionNode` 中的手动位移联动与 Effect 循环注入 zIndex
- [x] **Phase 5: 超大工作流重入与虚拟化视口防抖优化**
  - [x] 在 `NodeCard.tsx` 中接入 `IntersectionObserver` 视口虚拟化（600px 缓冲区）：离屏节点仅渲染极简外壳与真实占位 Handle，视口及邻近节点按需挂载 `PromptEditor` 与复杂表单控件，节点一旦进入视口保持常驻。
  - [x] 在 `NodeCard.tsx` 中引入 `OffscreenOutputHandles`：为离屏节点挂载 IF/ELSE、用户选择、问题分类、`selectedTools` 与 `catchError` 的真实 DOM `<Handle>`，使 React Flow 能够完整测量 `handleBounds`，彻底消除 `error#008`。
  - [x] 彻底消除手写静态 handle 覆盖（移除 `node.handles`），所有连线端点严格恢复为原生 DOM 真实几何测量，100% 居中于卡片左右正中（`top: 50%`）。
  - [x] 优化超大画布挂载时的 `fitView` 缩放保护：节点数大于 15 时优先聚焦起点节点并限制 `minZoom: 0.8`，避免直接缩放到全局 0.1 导致全部节点落入视口。
  - [x] 重构 `MyTooltip` 的 `useOverflowTooltipTrigger`：消除组件挂载阶段 `ref` 回调中的同步 `scrollWidth` 测量与全量 `ResizeObserver`，彻底杜绝 Commit 阶段的 Forced Synchronous Layout Thrashing。
  - [x] 经浏览器 PerformanceObserver 实测验证：206 节点重入单次最大长任务从 28.6 秒降至 949 毫秒（降幅 96.7%），长任务总耗时从 28.6 秒降至 1.06 秒（降幅 96.3%）；控制台 React Flow `error#008` 报错为 0。
- [x] **Phase 6: fitView 初始错误节点自动聚焦与虚拟化尺寸回退机制**
  - [x] **根因定位与攻坚**：
    1. 在 `onlyRenderVisibleElements={true}` 视口虚拟化下，离屏节点（或首帧未渲染节点）没有 DOM 实例，其 `n.measured.width` 和 `n.measured.height` 均为 `undefined`。
    2. xyflow v12 的 `getFitViewNodes` 内部逻辑：默认仅根据 `Boolean(n.measured.width && n.measured.height && !n.hidden)` 判断可见性，导致离屏错误节点被直接剔除，`nodesToFit` 为空（`bounds: { 0, 0, 0, 0 }`），视口退化到 `(0, 0, zoom: 3)` 空白区域。
    3. `Flow/index.tsx` 首帧无条件聚焦 `startNode`，与 `workflowUtilsContext` 的 300ms 延时校验发生竞争；且节点缺少 `initialWidth` / `initialHeight`，即便配置 `includeHiddenNodes: true`，`getNodeDimensions` 仍回落为 0 导致过滤失败。
  - [x] **架构与实现修复**：
    1. 在 `storeNode2FlowNode` 和 `nodeTemplate2FlowNode` 中显式注入 `initialWidth`（普通节点 400，HTTP 节点 666，包含自定义 nodeWidth）和 `initialHeight: 250`，保证离屏未测量节点在 xyflow 内部具备合法的固有包围盒。
    2. 在所有针对特定节点的 `fitView` 调用中（初始错误校验、保存/调试校验、节点搜索等），显式传入 `{ id: targetNodeId }`、`includeHiddenNodes: true`，并限制 `minZoom: 0.7, maxZoom: 1, padding: 0.3`。
    3. `initData` 初始化阶段同步预执行首轮错误校验，在首批 `nodes` 中预置 `isError: true` 与问题标注；`Flow/index.tsx` 的初始布局 Effect 优先聚焦带有错误标记的节点，无错误时才回退至起始节点。
  - [x] **浏览器实测验证**：
    - 初始刷新进入 206 节点工作流：画布直接脱离 `(0, 0, zoom: 3)`，精准居中于首个错误节点（博查搜索，`z5ZMZbCUlW62rCvo`，屏幕绝对中心，红色高亮边框和错误 badge 完全呈现）。
    - 退出后重新进入应用：水平绝对中心居中 `413.5 + 524 / 2 = 675.5px`（画布总宽 1351px，100.00% 绝对正中心），0 fitView 异常。
