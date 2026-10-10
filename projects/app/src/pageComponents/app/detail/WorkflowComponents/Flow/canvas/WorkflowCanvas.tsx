import dynamic from 'next/dynamic';
import ButtonEdge, { CustomConnectionLine } from '../components/ButtonEdge';
import NodeTemplatesModal from '../NodeTemplatesModal';
import 'reactflow/dist/style.css';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { defaultEdgeOptions, maxZoom, minZoom } from '../../constants';
import 'reactflow/dist/style.css';
import NodeTemplatesPopover from '../NodeTemplatesPopover';
import SearchButton from '../../../Workflow/components/SearchButton';
import SystemConfigDrawer from '../SystemConfigDrawer';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useWorkflowCanvasRendererValue, useWorkflowCanvasValue } from './workflowCanvasContext';
import ContextMenu from '../components/ContextMenu';
import FlowController from '../components/FlowController';
import HelperLines, { type HelperLinesController } from '../components/HelperLines';
import { useCanvasController } from './useCanvasController';
import { EDGE_TYPE, FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { NodeProps } from 'reactflow';
import ReactFlow, {
  Position,
  SelectionMode,
  useStore,
  useUpdateNodeInternals,
  useViewport
} from 'reactflow';
import { Box, IconButton, useDisclosure } from '@chakra-ui/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkflowUIValue } from './canvasState';
import { WorkflowSelectionProvider } from '../context/workflowSelectionContext';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import {
  useWorkflowIssueFocusRef,
  useWorkflowIssueFocusTick,
  useWorkflowRuntime
} from '@/web/core/workflow/editor/session/workflowSession';
import {
  getLayoutDimension,
  hasValidSourceHandleMeasurement,
  WORKFLOW_NODE_MEASUREMENT_ESTIMATE
} from './nodeDimensions';
import {
  ConnectionSourceHandle,
  ConnectionTargetHandle
} from '../nodes/render/Handle/ConnectionHandle';
import { MySourceHandle } from '../nodes/render/Handle';
import {
  WorkflowHandleRenderContext,
  WorkflowNodeOffscreenMeasurementContext
} from '../nodes/render/Handle/handleRenderContext';
import { ToolSourceHandle, ToolTargetHandle } from '../nodes/render/Handle/ToolHandle';
import { useIsToolNode } from '../nodes/render/useWorkflowDocument';
import { getNodeShellHandleModel, type NodeShellHandleModel } from '../utils/nodeHandle';

// region nodeTypes Canvas node type registration

const NodeSimple = dynamic(() => import('../nodes/NodeSimple'));
const NodeStopTool = React.memo((props: NodeProps<FlowNodeItemType>) => (
  <NodeSimple {...props} minW={'100px'} maxW={'300px'} />
));
NodeStopTool.displayName = 'NodeStopTool';

type CanvasNodeComponent = React.ElementType<NodeProps<FlowNodeItemType>>;

const baseNodeTypes: Record<FlowNodeTypeEnum, CanvasNodeComponent> = {
  [FlowNodeTypeEnum.emptyNode]: NodeSimple,
  [FlowNodeTypeEnum.globalVariable]: NodeSimple,
  [FlowNodeTypeEnum.textEditor]: NodeSimple,
  [FlowNodeTypeEnum.customFeedback]: NodeSimple,
  [FlowNodeTypeEnum.workflowStart]: dynamic(() => import('../nodes/NodeWorkflowStart')),
  [FlowNodeTypeEnum.chatNode]: NodeSimple,
  [FlowNodeTypeEnum.readFiles]: NodeSimple,
  [FlowNodeTypeEnum.datasetSearchNode]: NodeSimple,
  [FlowNodeTypeEnum.datasetConcatNode]: dynamic(() => import('../nodes/NodeDatasetConcat')),
  [FlowNodeTypeEnum.answerNode]: dynamic(() => import('../nodes/NodeAnswer')),
  [FlowNodeTypeEnum.classifyQuestion]: dynamic(() => import('../nodes/NodeCQNode')),
  [FlowNodeTypeEnum.contentExtract]: dynamic(() => import('../nodes/NodeExtract')),
  [FlowNodeTypeEnum.httpRequest468]: dynamic(() => import('../nodes/NodeHttp')),
  [FlowNodeTypeEnum.runApp]: NodeSimple,
  [FlowNodeTypeEnum.appModule]: NodeSimple,
  [FlowNodeTypeEnum.pluginInput]: dynamic(() => import('../nodes/NodePluginIO/PluginInput')),
  [FlowNodeTypeEnum.pluginOutput]: dynamic(() => import('../nodes/NodePluginIO/PluginOutput')),
  [FlowNodeTypeEnum.pluginModule]: NodeSimple,
  [FlowNodeTypeEnum.queryExtension]: NodeSimple,
  [FlowNodeTypeEnum.stopTool]: NodeStopTool,
  [FlowNodeTypeEnum.agent]: dynamic(() => import('../nodes/NodeAgent')),
  [FlowNodeTypeEnum.toolCall]: dynamic(() => import('../nodes/NodeToolCall')),
  [FlowNodeTypeEnum.tool]: NodeSimple,
  [FlowNodeTypeEnum.toolSet]: dynamic(() => import('../nodes/NodeToolSet')),
  [FlowNodeTypeEnum.toolParams]: dynamic(() => import('../nodes/NodeToolParams')),
  [FlowNodeTypeEnum.ifElseNode]: dynamic(() => import('../nodes/NodeIfElse')),
  [FlowNodeTypeEnum.variableUpdate]: dynamic(() => import('../nodes/NodeVariableUpdate')),
  [FlowNodeTypeEnum.code]: dynamic(() => import('../nodes/NodeCode')),
  [FlowNodeTypeEnum.userSelect]: dynamic(() => import('../nodes/NodeUserSelect')),
  [FlowNodeTypeEnum.loop]: dynamic(() => import('../nodes/Loop/NodeLoop')),
  [FlowNodeTypeEnum.parallelRun]: dynamic(() => import('../nodes/Loop/NodeParallelRun')),
  [FlowNodeTypeEnum.loopRun]: dynamic(() => import('../nodes/Loop/NodeLoopRun')),
  [FlowNodeTypeEnum.loopRunStart]: dynamic(() => import('../nodes/Loop/NodeLoopRunStart')),
  [FlowNodeTypeEnum.loopRunBreak]: dynamic(() => import('../nodes/Loop/NodeLoopRunBreak')),
  [FlowNodeTypeEnum.nestedStart]: dynamic(() => import('../nodes/Loop/NodeLoopStart')),
  [FlowNodeTypeEnum.nestedEnd]: dynamic(() => import('../nodes/Loop/NodeLoopEnd')),
  [FlowNodeTypeEnum.formInput]: dynamic(() => import('../nodes/NodeFormInput')),
  [FlowNodeTypeEnum.comment]: dynamic(() => import('../nodes/NodeComment'))
};

// endregion

// region nodeRendering Canvas node measurement and virtualization

const MeasuredNode = React.memo(
  ({
    nodeComponent,
    handleModel,
    renderHandles = true,
    offscreenMeasurement = false,
    ...props
  }: NodeProps<FlowNodeItemType> & {
    nodeComponent: CanvasNodeComponent;
    handleModel: NodeShellHandleModel;
    renderHandles?: boolean;
    offscreenMeasurement?: boolean;
  }) => {
    const registerNodeMeasurement = useWorkflowCanvasValue((v) => v.registerNodeMeasurement);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const nodeId = props.id;
    const measurementIdentity = props.data;
    const expectedDynamicHandleIds = useMemo(
      () => handleModel.sourceHandles.map((handle) => handle.handleId),
      [handleModel]
    );

    useEffect(() => {
      const wrapper = wrapperRef.current;
      const registration = registerNodeMeasurement(nodeId);
      if (!wrapper) return registration.dispose;

      let targets: [HTMLElement, HTMLElement] | undefined;
      let resizeObserver: ResizeObserver | undefined;
      let mutationObserver: MutationObserver | undefined;

      const findTargets = (): [HTMLElement, HTMLElement] | undefined => {
        const occupied = wrapper.querySelector<HTMLElement>('[data-workflow-node-occupied]');
        const card = wrapper.querySelector<HTMLElement>('[data-workflow-node-card]');
        return occupied && card ? [occupied, card] : undefined;
      };

      const reportSize = () => {
        if (!targets) return;
        const [occupied, card] = targets;
        const cardRect = card.getBoundingClientRect();
        const scaleX = card.offsetWidth > 0 ? cardRect.width / card.offsetWidth : 1;
        const scaleY = card.offsetHeight > 0 ? cardRect.height / card.offsetHeight : 1;
        const content = card.querySelector<HTMLElement>('[data-workflow-container-content]');
        const contentRect = content?.getBoundingClientRect();
        const centers = new Map<string, { x: number; y: number }>();
        const expectedIds = new Set(expectedDynamicHandleIds);

        card.querySelectorAll<HTMLElement>('[data-workflow-source-handle-id]').forEach((handle) => {
          const handleId = handle.dataset.workflowSourceHandleId;
          if (!handleId || !expectedIds.has(handleId)) return;

          const handleRect = handle.getBoundingClientRect();
          centers.set(handleId, {
            x: (handleRect.left + handleRect.width / 2 - cardRect.left) / scaleX,
            y: (handleRect.top + handleRect.height / 2 - cardRect.top) / scaleY
          });
        });

        registration.report({
          card: getLayoutDimension(card),
          occupied: getLayoutDimension(occupied),
          sourceHandleCenters: centers,
          ...(contentRect
            ? {
                containerContentOffset: {
                  x: (contentRect.left - cardRect.left) / scaleX,
                  y: (contentRect.top - cardRect.top) / scaleY
                }
              }
            : {})
        });
      };

      const observeTargets = () => {
        const nextTargets = findTargets();
        if (!nextTargets) return false;

        resizeObserver?.disconnect();
        targets = nextTargets;
        reportSize();

        if (typeof ResizeObserver === 'function') {
          resizeObserver = new ResizeObserver(reportSize);
          targets.forEach((target) => resizeObserver?.observe(target));
        }
        return true;
      };

      if (!observeTargets() && typeof MutationObserver === 'function') {
        mutationObserver = new MutationObserver(() => {
          if (observeTargets()) mutationObserver?.disconnect();
        });
        mutationObserver.observe(wrapper, { childList: true, subtree: true });
      }

      return () => {
        mutationObserver?.disconnect();
        resizeObserver?.disconnect();
        registration.dispose();
      };
    }, [expectedDynamicHandleIds, measurementIdentity, nodeId, registerNodeMeasurement]);

    return (
      <div ref={wrapperRef} style={{ display: 'contents' }}>
        <WorkflowNodeOffscreenMeasurementContext.Provider value={offscreenMeasurement}>
          <WorkflowHandleRenderContext.Provider value={renderHandles}>
            {React.createElement(nodeComponent, props)}
          </WorkflowHandleRenderContext.Provider>
        </WorkflowNodeOffscreenMeasurementContext.Provider>
      </div>
    );
  }
);
MeasuredNode.displayName = 'MeasuredNode';

const NodeShell = React.memo(
  ({
    handleModel,
    overlay = false,
    renderHandles = true,
    ...props
  }: NodeProps<FlowNodeItemType> & {
    handleModel: NodeShellHandleModel;
    overlay?: boolean;
    renderHandles?: boolean;
  }) => {
    // 按节点订阅尺寸：getter 身份稳定，单独订阅 getter 不会在测量结果更新时重渲染 shell。
    const dimensions =
      useWorkflowCanvasValue((v) => v.nodeDimensions.get(props.id)) ??
      WORKFLOW_NODE_MEASUREMENT_ESTIMATE;
    const updateNodeInternals = useUpdateNodeInternals();
    const isToolNode = useIsToolNode(props.id);
    const showToolSource = props.data.flowNodeType === FlowNodeTypeEnum.toolCall;
    const { sourceHandles, hasCatchSource, replacesDefaultSource } = handleModel;
    const sourceHandleCenters = dimensions.sourceHandleCenters;

    useEffect(() => {
      // 壳节点尺寸或 handle 拓扑变化后，只刷新 React Flow 的几何缓存，不改业务状态。
      updateNodeInternals(props.id);
    }, [
      dimensions.card.height,
      dimensions.card.width,
      dimensions.occupied.height,
      dimensions.occupied.width,
      overlay,
      props.data,
      props.id,
      sourceHandleCenters,
      updateNodeInternals
    ]);

    return (
      <Box
        position={overlay ? 'absolute' : 'relative'}
        left={overlay ? 0 : undefined}
        top={overlay ? 0 : undefined}
        pointerEvents={overlay ? 'none' : undefined}
        w={`${dimensions.occupied.width}px`}
        h={`${dimensions.occupied.height}px`}
        overflow={'visible'}
      >
        <Box
          position={'relative'}
          w={`${dimensions.card.width}px`}
          h={`${dimensions.card.height}px`}
        >
          {renderHandles && (
            <>
              <ToolTargetHandle show={isToolNode} nodeId={props.id} />
              {!replacesDefaultSource && <ConnectionSourceHandle nodeId={props.id} />}
              <ConnectionTargetHandle nodeId={props.id} />
              {hasCatchSource && (
                <ConnectionSourceHandle nodeId={props.id} sourceType="source_catch" />
              )}
              {showToolSource && <ToolSourceHandle nodeId={props.id} />}
              {sourceHandles.map(({ handleId, topPercent, translate }) => {
                const center = sourceHandleCenters?.get(handleId);
                const top = center ? `${center.y}px` : `${topPercent}%`;
                return (
                  <Box key={handleId} position={'absolute'} top={top} right={0} w={0} h={0}>
                    <MySourceHandle
                      nodeId={props.id}
                      handleId={handleId}
                      position={Position.Right}
                      translate={translate}
                    />
                  </Box>
                );
              })}
            </>
          )}
        </Box>
      </Box>
    );
  }
);
NodeShell.displayName = 'NodeShell';

const VirtualizedNode = React.memo(
  ({
    nodeComponent,
    ...props
  }: NodeProps<FlowNodeItemType> & {
    nodeComponent: CanvasNodeComponent;
  }) => {
    const mode = useWorkflowCanvasValue((v) => v.renderModes.get(props.id) ?? 'shell');
    const dimension = useWorkflowCanvasValue((v) => v.nodeDimensions.get(props.id));
    const runtime = useWorkflowRuntime();
    const node = runtime?.getNode(props.id);
    const handleModel = useMemo(() => (node ? getNodeShellHandleModel(node) : undefined), [node]);
    const expectedDynamicHandleIds = useMemo(
      () => handleModel?.sourceHandles.map((handle) => handle.handleId) ?? [],
      [handleModel]
    );
    const hasMeasuredDynamicHandles = hasValidSourceHandleMeasurement({
      expectedHandleIds: expectedDynamicHandleIds,
      dimension
    });
    const isMeasurement = mode === 'measurement';
    const renderFull = mode !== 'shell' || !hasMeasuredDynamicHandles;
    const pinNodeFocus = useWorkflowCanvasValue((v) => v.pinNodeFocus);
    const unpinNodeFocus = useWorkflowCanvasValue((v) => v.unpinNodeFocus);
    const setHoverNodeId = useWorkflowUIValue((v) => v.setHoverNodeId);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const handleFocus = useCallback(() => pinNodeFocus(props.id), [pinNodeFocus, props.id]);
    const handleBlur = useCallback(
      (event: React.FocusEvent<HTMLDivElement>) => {
        if (event.relatedTarget && wrapperRef.current?.contains(event.relatedTarget as Node))
          return;
        unpinNodeFocus(props.id);
      },
      [props.id, unpinNodeFocus]
    );
    const handleMouseEnter = useCallback(
      () => setHoverNodeId(props.id),
      [props.id, setHoverNodeId]
    );
    const handleMouseLeave = useCallback(() => setHoverNodeId(undefined), [setHoverNodeId]);

    if (!handleModel) return null;

    return (
      <div
        ref={wrapperRef}
        aria-hidden={isMeasurement}
        style={{
          display: 'contents',
          visibility: isMeasurement ? 'hidden' : undefined,
          pointerEvents: isMeasurement ? 'none' : undefined
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocusCapture={handleFocus}
        onBlurCapture={handleBlur}
      >
        <NodeShell
          {...props}
          handleModel={handleModel}
          overlay={renderFull}
          renderHandles={!renderFull || (hasMeasuredDynamicHandles && !isMeasurement)}
        />
        {renderFull && (
          <MeasuredNode
            nodeComponent={nodeComponent}
            handleModel={handleModel}
            renderHandles={isMeasurement || !hasMeasuredDynamicHandles}
            offscreenMeasurement={isMeasurement}
            {...props}
          />
        )}
      </div>
    );
  }
);
VirtualizedNode.displayName = 'VirtualizedNode';

const nodeTypes = Object.fromEntries(
  Object.entries(baseNodeTypes).map(([type, nodeComponent]) => {
    const VirtualizedNodeType = React.memo((props: NodeProps<FlowNodeItemType>) => (
      <VirtualizedNode nodeComponent={nodeComponent} {...props} />
    ));
    VirtualizedNodeType.displayName = `VirtualizedNodeType(${type})`;
    return [type, VirtualizedNodeType];
  })
);

const edgeTypes = {
  [EDGE_TYPE]: ButtonEdge
};

// endregion

// region canvasView ReactFlow canvas and overlays

const ViewportObserver = () => {
  const onViewportChange = useWorkflowCanvasRendererValue((v) => v.onViewportChange);
  const { x, y, zoom } = useViewport();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);

  useEffect(() => {
    onViewportChange({ x, y, zoom, width, height });
  }, [height, onViewportChange, width, x, y, zoom]);

  return null;
};

/** 画布背景：写成模块常量，内联字面量会让 ReactFlow 每次渲染都收到新的 style 对象。 */
const canvasStyle = { background: '#F7F8FA' };

type CanvasOverlaysProps = {
  isOpenTemplate: boolean;
  onOpenTemplate: () => void;
  onCloseTemplate: () => void;
};

/**
 * 画布左上角按钮与三个侧边栏入口。
 *
 * 单独 memo 出来：`WorkflowCanvas` 会随每次投影（画布数组换身份）与手势起止重渲染，
 * 而这一层的输入只有「添加节点侧边栏开合」，不该跟着刷新。
 */
const CanvasOverlays = React.memo(
  ({ isOpenTemplate, onOpenTemplate, onCloseTemplate }: CanvasOverlaysProps) => {
    const { t } = useTranslation();

    return (
      <>
        <Box position={'absolute'} top={20} left={6} zIndex={1}>
          <MyTooltip shouldWrapChildren={false} label={t('workflow:to_add_node')}>
            <IconButton
              icon={<MyIcon name="core/app/workflowToolbarAdd" boxSize={6} color={'white'} />}
              w={9}
              minW={9}
              h={9}
              p={1.5}
              borderRadius={'50%'}
              bg={'black'}
              _hover={{ bg: 'myGray.700' }}
              aria-label={t('workflow:to_add_node')}
              border={'none'}
              boxShadow={'0 4px 5px rgba(19, 51, 107, 0.20), 0 0 0.5px rgba(19, 51, 107, 0.50)'}
              onClick={() => (isOpenTemplate ? onCloseTemplate() : onOpenTemplate())}
            />
          </MyTooltip>
        </Box>
        <SearchButton />
        <SystemConfigDrawer />
        <NodeTemplatesModal isOpen={isOpenTemplate} onClose={onCloseTemplate} />
        <NodeTemplatesPopover />
      </>
    );
  }
);
CanvasOverlays.displayName = 'CanvasOverlays';

const WorkflowCanvas = () => {
  const nodes = useWorkflowCanvasRendererValue((v) => v.nodes);
  const renderedNodes = useWorkflowCanvasRendererValue((v) => v.renderedNodes);
  const nodeDimensions = useWorkflowCanvasValue((v) => v.nodeDimensions);
  const fitNodes = useWorkflowCanvasValue((v) => v.fitNodes);
  const renderedEdges = useWorkflowCanvasRendererValue((v) => v.renderedEdges);
  const runtime = useWorkflowRuntime();
  const helperLinesRef = useRef<HelperLinesController>(null);
  // 按字段订阅：整体订阅会让 hover / 鼠标进出画布带动整个画布组件重渲染，
  // 而这里只需要一个稳定 callback ref、一个原始值和一个菜单坐标。
  const reactFlowWrapperCallback = useWorkflowUIValue((v) => v.reactFlowWrapperCallback);
  const workflowControlMode = useWorkflowUIValue((v) => v.workflowControlMode);
  const menu = useWorkflowUIValue((v) => v.menu);
  const issueFocusRef = useWorkflowIssueFocusRef();
  const issueFocusTick = useWorkflowIssueFocusTick();

  const {
    handleNodesChange,
    handleEdgeChange,
    onConnectStart,
    onConnectEnd,
    customOnConnect,
    onEdgeMouseEnter,
    onEdgeMouseLeave,
    onNodeDragStop,
    onPaneContextMenu,
    onPaneClick
  } = useCanvasController({ helperLinesRef });

  const {
    isOpen: isOpenTemplate,
    onOpen: onOpenTemplate,
    onClose: onCloseTemplate
  } = useDisclosure();

  const [movingCanvas, setMovingCanvas] = useState(false);
  // 手势起止只改一个 className 字符串，提成稳定引用后 ZoomPane 的 props 不再每帧换身份。
  const onMoveStart = useCallback(() => setMovingCanvas(true), []);
  const onMoveEnd = useCallback(() => setMovingCanvas(false), []);

  const canvasWidth = useStore((state) => state.width);
  const canvasHeight = useStore((state) => state.height);
  const startNodeId = nodes.find(
    (node) => node.data.flowNodeType === FlowNodeTypeEnum.workflowStart
  )?.id;
  const fittedStartRuntimeRef = useRef<unknown>();
  const fittedIssueNodeRef = useRef<string>();

  useEffect(() => {
    if (!runtime || !startNodeId) return;
    if (fittedStartRuntimeRef.current === runtime) return;
    if (!fitNodes([startNodeId], { padding: 0.3 })) return;
    fittedStartRuntimeRef.current = runtime;
  }, [canvasHeight, canvasWidth, nodeDimensions, fitNodes, nodes, runtime, startNodeId]);

  useEffect(() => {
    const focusedNodeId = issueFocusRef.current;
    if (!focusedNodeId) {
      fittedIssueNodeRef.current = undefined;
      return;
    }
    if (fittedIssueNodeRef.current === focusedNodeId) return;

    const focusedNode = nodes.find((node) => node.id === focusedNodeId);
    if (!focusedNode) return;
    if (!fitNodes([focusedNode.id], { padding: 0.3, minZoom: 0.6 })) return;
    fittedIssueNodeRef.current = focusedNodeId;
  }, [canvasHeight, canvasWidth, nodeDimensions, fitNodes, issueFocusTick, issueFocusRef, nodes]);

  return (
    <>
      <Box
        flex={'1 0 0'}
        h={0}
        w={'100%'}
        position={'relative'}
        onContextMenu={(e) => {
          e.preventDefault();
          return false;
        }}
      >
        {/* open module template */}
        <CanvasOverlays
          isOpenTemplate={isOpenTemplate}
          onOpenTemplate={onOpenTemplate}
          onCloseTemplate={onCloseTemplate}
        />

        <ReactFlow
          ref={reactFlowWrapperCallback}
          nodes={renderedNodes}
          edges={renderedEdges}
          minZoom={minZoom}
          maxZoom={maxZoom}
          defaultEdgeOptions={defaultEdgeOptions}
          elevateEdgesOnSelect
          connectionLineComponent={CustomConnectionLine}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionRadius={50}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgeChange}
          onConnect={customOnConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onEdgeMouseEnter={onEdgeMouseEnter}
          onEdgeMouseLeave={onEdgeMouseLeave}
          panOnScrollSpeed={2}
          onPaneContextMenu={onPaneContextMenu}
          onPaneClick={onPaneClick}
          snapToGrid
          style={canvasStyle}
          {...(workflowControlMode === 'select'
            ? {
                selectionMode: SelectionMode.Full,
                selectNodesOnDrag: false,
                selectionOnDrag: true,
                selectionKeyCode: null,
                panOnDrag: false,
                panOnScroll: true
              }
            : {})}
          onNodeDragStop={onNodeDragStop}
          noWheelClassName={
            !movingCanvas || workflowControlMode === 'drag' ? 'nowheel' : 'nowheel-moving'
          }
          onMoveStart={onMoveStart}
          onMoveEnd={onMoveEnd}
        >
          <ViewportObserver />
          {!!menu && <ContextMenu />}
          <FlowController />
          <HelperLines ref={helperLinesRef} />
        </ReactFlow>
      </Box>
    </>
  );
};

// endregion

// region canvasEntry Canvas provider and runtime gate

/**
 * 画布入口：选中态属于 renderer 交互层，Provider 挂在画布组件之上，
 * 覆盖 Canvas controller 与节点/边渲染器（Handle、ButtonEdge）等全部消费者。
 */
const WorkflowCanvasEntry = () => (
  <WorkflowRuntimeGate>
    <WorkflowSelectionProvider>
      <WorkflowCanvas />
    </WorkflowSelectionProvider>
  </WorkflowRuntimeGate>
);

/** Runtime hydrate 前保留数据层初始化，但延迟挂载会调用 adapter hooks 的画布子树。 */
const WorkflowRuntimeGate = ({ children }: { children: React.ReactNode }) => {
  const runtime = useWorkflowRuntime();
  return runtime ? children : null;
};

export default React.memo(WorkflowCanvasEntry);

// endregion
