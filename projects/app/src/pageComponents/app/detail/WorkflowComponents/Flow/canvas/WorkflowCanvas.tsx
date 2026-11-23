import dynamic from 'next/dynamic';
import ButtonEdge, { CustomConnectionLine } from '../components/ButtonEdge';
import NodeTemplatesModal, { sliderWidth } from '../NodeTemplatesModal';
import '@xyflow/react/dist/style.css';
import { defaultEdgeOptions, maxZoom, minZoom } from '../../constants';
import NodeTemplatesPopover from '../NodeTemplatesPopover';
import SearchButton from '../../../Workflow/components/SearchButton';
import SystemConfigDrawer, { SystemConfigButton } from '../SystemConfigDrawer';
import WorkflowBuilderEntry from '../../WorkflowBuilder/WorkflowBuilderEntry';
import { useWorkflowBuilderUI } from '../../WorkflowBuilder/hooks/useWorkflowBuilderUI';
import WorkflowToolbarTooltip from '../../WorkflowBuilder/presentation/WorkflowToolbarTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useWorkflowCanvasRendererValue, useWorkflowCanvasValue } from './workflowCanvasContext';
import ContextMenu from '../components/ContextMenu';
import FlowController from '../components/FlowController';
import HelperLines, { type HelperLinesController } from '../components/HelperLines';
import { useCanvasController } from './useCanvasController';
import { useWorkflowAutoLayout } from '../hooks/useWorkflowAutoLayout';
import { EDGE_TYPE, FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import {
  ReactFlow,
  SelectionMode,
  type NodeTypes,
  type OnMoveStart,
  useStore,
  useUpdateNodeInternals,
  useViewport
} from '@xyflow/react';
import {
  Box,
  Flex,
  IconButton,
  useBreakpointValue,
  usePrefersReducedMotion
} from '@chakra-ui/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkflowUIValue } from './canvasState';
import { WorkflowSelectionProvider } from '../context/workflowSelectionContext';
import { useTranslation } from 'next-i18next';
import {
  useWorkflowIssueFocusNodeId,
  useWorkflowRuntime
} from '@/web/core/workflow/editor/session/workflowSession';
import { getLayoutDimension, WORKFLOW_NODE_MEASUREMENT_ESTIMATE } from './nodeDimensions';
import {
  ConnectionTargetHandle,
  NodeShellSourceHandles
} from '../nodes/render/Handle/ConnectionHandle';
import {
  WorkflowHandleRenderContext,
  WorkflowNodeOffscreenMeasurementContext
} from '../nodes/render/Handle/handleRenderContext';
import { ToolSourceHandle, ToolTargetHandle } from '../nodes/render/Handle/ToolHandle';
import { useIsToolNode } from '../nodes/render/useWorkflowDocument';
import {
  getNodeHandleRenderMode,
  getNodeSourceHandleCenters,
  getNodeShellHandleModel,
  type NodeShellHandleModel
} from '../utils/nodeHandle';
import { type CanvasNodeProps } from '@/web/core/workflow/editor/canvas/canvasTypes';
import { useNode } from '@/web/core/workflow/editor/react/useNode';
import { useWorkflowModalValue } from '../panels/workflowPanelState';
import { APP_DETAIL_PANEL_WIDTH_PX } from '../../../components/AppDetailPanelModal';

// region nodeTypes Canvas node type registration

const NodeSimple = dynamic(() => import('../nodes/NodeSimple'));
const NodeStopTool = React.memo((props: CanvasNodeProps) => (
  <NodeSimple {...props} minW={'100px'} maxW={'300px'} />
));
NodeStopTool.displayName = 'NodeStopTool';

type CanvasNodeComponent = React.ComponentType<CanvasNodeProps>;

type WorkflowNodeRenderers = {
  [T in FlowNodeTypeEnum]: CanvasNodeComponent;
};

const baseNodeTypes = {
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
} satisfies WorkflowNodeRenderers;

// endregion

// region nodeRendering Canvas node measurement and virtualization

const MeasuredNode = React.memo(
  ({
    nodeComponent,
    handleModel,
    renderHandles = true,
    offscreenMeasurement = false,
    ...props
  }: CanvasNodeProps & {
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

      const node = wrapper.closest('.react-flow__node') ?? wrapper;
      let targets: [HTMLElement, HTMLElement] | undefined;

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
        registration.report({
          card: getLayoutDimension(card),
          occupied: getLayoutDimension(occupied),
          sourceHandleCenters: renderHandles
            ? getNodeSourceHandleCenters(card, expectedDynamicHandleIds)
            : undefined,
          ...(content && contentRect
            ? {
                containerContentSize: getLayoutDimension(content),
                containerContentOffset: {
                  x: (contentRect.left - cardRect.left) / scaleX,
                  y: (contentRect.top - cardRect.top) / scaleY
                }
              }
            : {})
        });
      };

      const resizeObserver =
        typeof ResizeObserver === 'function' ? new ResizeObserver(reportSize) : undefined;
      const observeTargets = () => {
        const nextTargets = findTargets();
        if (!nextTargets) return;
        if (nextTargets[0] !== targets?.[0] || nextTargets[1] !== targets?.[1]) {
          resizeObserver?.disconnect();
          targets = nextTargets;
          targets.forEach((target) => resizeObserver?.observe(target));
        }
        reportSize();
      };

      observeTargets();
      const watchHandles = renderHandles && expectedDynamicHandleIds.length > 0;
      const mutationObserver =
        (!targets || watchHandles) && typeof MutationObserver === 'function'
          ? new MutationObserver(observeTargets)
          : undefined;
      // Portal 与卡片同属 React Flow 节点；行重排和端口位置变化无需等卡片改变尺寸。
      if (mutationObserver) {
        mutationObserver.observe(watchHandles ? node : wrapper, {
          childList: true,
          subtree: true,
          attributes: watchHandles,
          ...(watchHandles && { attributeFilter: ['style'] })
        });
      }

      return () => {
        mutationObserver?.disconnect();
        resizeObserver?.disconnect();
        registration.dispose();
      };
    }, [
      expectedDynamicHandleIds,
      measurementIdentity,
      nodeId,
      registerNodeMeasurement,
      renderHandles
    ]);

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
    isFolded,
    ...props
  }: CanvasNodeProps & {
    handleModel: NodeShellHandleModel;
    overlay?: boolean;
    renderHandles?: boolean;
    isFolded: boolean;
  }) => {
    // 按节点订阅尺寸：getter 身份稳定，单独订阅 getter 不会在测量结果更新时重渲染 shell。
    const dimensions =
      useWorkflowCanvasValue((v) => v.nodeDimensions.get(props.id)) ??
      WORKFLOW_NODE_MEASUREMENT_ESTIMATE;
    const containerWidth = useWorkflowCanvasValue(
      (v) => v.containerLayouts.get(props.id)?.childWidth
    );
    const containerHeight = useWorkflowCanvasValue(
      (v) => v.containerLayouts.get(props.id)?.childHeight
    );
    const updateNodeInternals = useUpdateNodeInternals();
    const isToolNode = useIsToolNode(props.id);
    const canBeTool = moduleTemplatesFlat.some(
      (template) => template.flowNodeType === props.data.flowNodeType && template.isTool
    );
    const showToolSource = props.data.flowNodeType === FlowNodeTypeEnum.toolCall;
    const sourceHandleCenters = dimensions.sourceHandleCenters;

    useEffect(() => {
      // 壳节点尺寸或 handle 拓扑变化后，只刷新 React Flow 的几何缓存，不改业务状态。
      updateNodeInternals(props.id);
    }, [
      dimensions.card.height,
      dimensions.card.width,
      dimensions.occupied.height,
      dimensions.occupied.width,
      containerWidth,
      containerHeight,
      handleModel,
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
              <ToolTargetHandle show={isToolNode || canBeTool} nodeId={props.id} />
              <NodeShellSourceHandles
                nodeId={props.id}
                model={handleModel}
                isFolded={isFolded}
                centers={sourceHandleCenters}
              />
              <ConnectionTargetHandle nodeId={props.id} />
              {showToolSource && <ToolSourceHandle nodeId={props.id} />}
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
  }: CanvasNodeProps & {
    nodeComponent: CanvasNodeComponent;
  }) => {
    const mode = useWorkflowCanvasValue((v) => v.renderModes.get(props.id) ?? 'shell');
    const runtime = useWorkflowRuntime();
    // Runtime 可以在下一帧投影之前删除记录，先卸载仍持有旧画布 props 的节点。
    const exists = useNode(props.id, Boolean);
    const node = exists ? runtime?.getNode(props.id) : undefined;
    const showSourceHandle = props.data.showSourceHandle;
    const handleModel = useMemo(
      () => (node ? getNodeShellHandleModel({ ...node, showSourceHandle }) : undefined),
      [node, showSourceHandle]
    );
    const isMeasurement = mode === 'measurement';
    const renderFull = mode !== 'shell';
    const isFolded = props.data.isFolded === true;
    const { renderShellHandles, renderFullHandles } = getNodeHandleRenderMode({
      isFolded,
      renderFull
    });
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
        onBlur={handleBlur}
      >
        <NodeShell
          {...props}
          handleModel={handleModel}
          overlay={renderFull}
          renderHandles={renderShellHandles}
          isFolded={isFolded}
        />
        {renderFull && (
          <MeasuredNode
            nodeComponent={nodeComponent}
            handleModel={handleModel}
            renderHandles={renderFullHandles}
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
    const VirtualizedNodeType = React.memo((props: CanvasNodeProps) => (
      <VirtualizedNode nodeComponent={nodeComponent} {...props} />
    ));
    VirtualizedNodeType.displayName = `VirtualizedNodeType(${type})`;
    return [type, VirtualizedNodeType];
  })
) satisfies NodeTypes;

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

/** 鼠标模式依赖 Shift 临时框选，触摸板模式改为直接拖动框选。 */
export const getCanvasSelectionProps = (mode: 'drag' | 'select') =>
  mode === 'select'
    ? {
        selectionMode: SelectionMode.Full,
        selectNodesOnDrag: false,
        selectionOnDrag: true,
        selectionKeyCode: null,
        panOnDrag: false,
        panOnScroll: true
      }
    : {
        selectionKeyCode: 'Shift'
      };

/** 画布工具栏共享 Builder 面板开合状态，同时把搜索层挂到画布容器。 */
export const CanvasOverlays = React.memo(() => {
  const { t } = useTranslation();
  const { activeLeftPanel, closeLeftPanel, toggleLeftPanel, workflowCanvasRef } =
    useWorkflowBuilderUI();
  const prefersReducedMotion = usePrefersReducedMotion();
  const isLeftPanelOpen = Boolean(activeLeftPanel);
  // React 18 会丢弃 Chakra 类型声明里的布尔 inert，用 HTML 属性传空字符串。
  const inertAttribute: Record<string, ''> = isLeftPanelOpen ? { inert: '' } : {};
  const isOpenTemplate = activeLeftPanel === 'nodeTemplates';
  const isDesktop = useBreakpointValue({ base: false, sm: true });
  const toolbarRef = useRef<HTMLDivElement>(null);
  const setDebugLeftBoundary = useWorkflowModalValue((value) => value.setDebugLeftBoundary);

  useEffect(() => {
    const canvas = workflowCanvasRef.current;
    const toolbar = toolbarRef.current;

    // 工具栏收起时有位移动画，仍按原布局测量热区；侧栏展开时保留其横向空间。
    const updateBoundary = () => {
      const gap = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const toolbarRight =
        (canvas?.getBoundingClientRect().left ?? 0) +
        (toolbar?.offsetLeft ?? 20) +
        (toolbar?.offsetWidth ?? 48);
      const panelRight = (() => {
        if (activeLeftPanel && !isDesktop) return window.innerWidth;
        if (activeLeftPanel === 'nodeTemplates') return sliderWidth;
        if (activeLeftPanel === 'systemConfig') return APP_DETAIL_PANEL_WIDTH_PX;
        if (activeLeftPanel === 'workflowBuilder') return Math.max(488, window.innerWidth / 3);
        return 0;
      })();
      setDebugLeftBoundary(Math.max(toolbarRight, panelRight) + gap);
    };
    updateBoundary();
    window.addEventListener('resize', updateBoundary);
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(updateBoundary);
    if (canvas) observer?.observe(canvas);
    return () => {
      window.removeEventListener('resize', updateBoundary);
      observer?.disconnect();
    };
  }, [activeLeftPanel, isDesktop, setDebugLeftBoundary, workflowCanvasRef]);

  return (
    <>
      <Flex
        ref={toolbarRef}
        position={'absolute'}
        top={'50%'}
        left={5}
        zIndex={2}
        transform={isLeftPanelOpen ? 'translate(calc(-100% - 24px), -50%)' : 'translate(0, -50%)'}
        opacity={isLeftPanelOpen ? 0 : 1}
        pointerEvents={isLeftPanelOpen ? 'none' : 'auto'}
        aria-hidden={isLeftPanelOpen}
        {...inertAttribute}
        transition={prefersReducedMotion ? 'none' : 'transform 200ms ease, opacity 160ms ease'}
        w={'40px'}
        px={1}
        py={2}
        direction={'column'}
        alignItems={'center'}
        gap={2}
        bg={'white'}
        borderRadius={'8px'}
        boxShadow={'0 0 1px rgba(19, 51, 107, 0.10), 0 4px 10px rgba(19, 51, 107, 0.10)'}
      >
        <WorkflowBuilderEntry />
        <WorkflowToolbarTooltip label={t('workflow:to_add_node')}>
          <IconButton
            icon={<MyIcon name="core/app/workflowToolbarAdd" boxSize={'18px'} color={'white'} />}
            w={8}
            minW={8}
            h={8}
            p={'7px'}
            borderRadius={'6px'}
            bg={'black'}
            _hover={{ bg: '#1D2532' }}
            aria-label={t('workflow:to_add_node')}
            border={'none'}
            onClick={() => toggleLeftPanel('nodeTemplates')}
          />
        </WorkflowToolbarTooltip>
        <Box w={'20px'} h={'1px'} flexShrink={0} bg={'#E8EBF0'} />
        <SystemConfigButton />
        <Box w={'20px'} h={'1px'} flexShrink={0} bg={'#E8EBF0'} />
        <SearchButton inToolbar portalContainerRef={workflowCanvasRef} />
      </Flex>
      <SystemConfigDrawer />
      <NodeTemplatesModal isOpen={isOpenTemplate} onClose={() => closeLeftPanel('nodeTemplates')} />
      <NodeTemplatesPopover />
    </>
  );
});
CanvasOverlays.displayName = 'CanvasOverlays';

const WorkflowCanvas = () => {
  const nodes = useWorkflowCanvasRendererValue((v) => v.nodes);
  const renderedNodes = useWorkflowCanvasRendererValue((v) => v.renderedNodes);
  const focusNodes = useWorkflowCanvasValue((v) => v.focusNodes);
  const fitNodes = useWorkflowCanvasValue((v) => v.fitNodes);
  const renderedEdges = useWorkflowCanvasRendererValue((v) => v.renderedEdges);
  const runtime = useWorkflowRuntime();
  const helperLinesRef = useRef<HelperLinesController>(null);
  // 按字段订阅：整体订阅会让 hover / 鼠标进出画布带动整个画布组件重渲染，
  // 而这里只需要一个稳定 callback ref、一个原始值和一个菜单坐标。
  const reactFlowWrapperCallback = useWorkflowUIValue((v) => v.reactFlowWrapperCallback);
  const workflowControlMode = useWorkflowUIValue((v) => v.workflowControlMode);
  const menu = useWorkflowUIValue((v) => v.menu);
  const { autoLayout } = useWorkflowAutoLayout();
  const onAutoLayout = useCallback(() => {
    void autoLayout({ allowFallbackDimensions: true }).catch((error) => {
      console.warn('[Workflow auto layout] Failed to align nodes:', error);
    });
  }, [autoLayout]);
  const issueFocusNodeId = useWorkflowIssueFocusNodeId();

  const {
    handleNodesChange,
    handleEdgeChange,
    onConnectStart,
    onClickConnectStart,
    onConnectEnd,
    customOnConnect,
    onEdgeMouseEnter,
    onEdgeMouseLeave,
    onNodeDragStart,
    onNodeDragStop,
    onPaneContextMenu,
    onPaneClick
  } = useCanvasController({ helperLinesRef });

  const { workflowCanvasRef } = useWorkflowBuilderUI();

  const [movingCanvas, setMovingCanvas] = useState(false);
  const cancelPendingViewport = useWorkflowCanvasValue((v) => v.cancelPendingViewport);
  const onMoveStart = useCallback<OnMoveStart>(
    (event) => {
      if (event) cancelPendingViewport();
      setMovingCanvas(true);
    },
    [cancelPendingViewport]
  );
  const onMoveEnd = useCallback(() => setMovingCanvas(false), []);

  const startNodeId = nodes.find(
    (node) =>
      node.data.flowNodeType === FlowNodeTypeEnum.workflowStart ||
      node.data.flowNodeType === FlowNodeTypeEnum.pluginInput
  )?.id;
  const fittedStartRuntimeRef = useRef<unknown>();

  useEffect(() => {
    if (!runtime || nodes.length === 0) return;
    if (fittedStartRuntimeRef.current === runtime) return;
    if (startNodeId) {
      focusNodes([startNodeId], { padding: 0.3 });
    } else {
      fitNodes(undefined, { padding: 0.3 });
    }
    fittedStartRuntimeRef.current = runtime;
  }, [fitNodes, focusNodes, nodes.length, runtime, startNodeId]);

  useEffect(() => {
    if (!issueFocusNodeId) return;
    focusNodes([issueFocusNodeId], { padding: 0.3, minZoom: 0.6 });
  }, [focusNodes, issueFocusNodeId]);

  return (
    <>
      <Box
        ref={workflowCanvasRef}
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
        <CanvasOverlays />

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
          onClickConnectStart={onClickConnectStart}
          onConnectEnd={onConnectEnd}
          onEdgeMouseEnter={onEdgeMouseEnter}
          onEdgeMouseLeave={onEdgeMouseLeave}
          panOnScrollSpeed={2}
          onPaneContextMenu={onPaneContextMenu}
          onPaneClick={onPaneClick}
          snapToGrid
          style={canvasStyle}
          multiSelectionKeyCode={['Meta', 'Control']}
          {...getCanvasSelectionProps(workflowControlMode)}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          noWheelClassName={
            !movingCanvas || workflowControlMode === 'drag' ? 'nowheel' : 'nowheel-moving'
          }
          onMoveStart={onMoveStart}
          onMoveEnd={onMoveEnd}
        >
          <ViewportObserver />
          {!!menu && <ContextMenu onAutoLayout={onAutoLayout} />}
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
