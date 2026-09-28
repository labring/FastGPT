import dynamic from 'next/dynamic';
import ButtonEdge, { CustomConnectionLine } from './components/ButtonEdge';
import NodeTemplatesModal from './NodeTemplatesModal';
import 'reactflow/dist/style.css';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { defaultEdgeOptions, maxZoom, minZoom } from '../constants';
import 'reactflow/dist/style.css';
import { useContextSelector } from 'use-context-selector';
import NodeTemplatesPopover from './NodeTemplatesPopover';
import SearchButton from '../../Workflow/components/SearchButton';
import SystemConfigDrawer from './SystemConfigDrawer';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { WorkflowCanvasContext } from './context/workflowCanvasContext';
import ContextMenu from './components/ContextMenu';
import FlowController from './components/FlowController';
import HelperLines, { type HelperLinesController } from './components/HelperLines';
import { useWorkflow } from './hooks/useWorkflow';
import { EDGE_TYPE, FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { NodeProps } from 'reactflow';
import ReactFlow, { SelectionMode, useReactFlow } from 'reactflow';
import { Box, IconButton, useDisclosure } from '@chakra-ui/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { WorkflowUIContext } from './context/workflowUIContext';
import { WorkflowSelectionProvider } from './context/workflowSelectionContext';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { WorkflowHostContext } from '@/web/core/workflow/editor/host';

const NodeSimple = dynamic(() => import('./nodes/NodeSimple'));
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
  [FlowNodeTypeEnum.workflowStart]: dynamic(() => import('./nodes/NodeWorkflowStart')),
  [FlowNodeTypeEnum.chatNode]: NodeSimple,
  [FlowNodeTypeEnum.readFiles]: NodeSimple,
  [FlowNodeTypeEnum.datasetSearchNode]: NodeSimple,
  [FlowNodeTypeEnum.datasetConcatNode]: dynamic(() => import('./nodes/NodeDatasetConcat')),
  [FlowNodeTypeEnum.answerNode]: dynamic(() => import('./nodes/NodeAnswer')),
  [FlowNodeTypeEnum.classifyQuestion]: dynamic(() => import('./nodes/NodeCQNode')),
  [FlowNodeTypeEnum.contentExtract]: dynamic(() => import('./nodes/NodeExtract')),
  [FlowNodeTypeEnum.httpRequest468]: dynamic(() => import('./nodes/NodeHttp')),
  [FlowNodeTypeEnum.runApp]: NodeSimple,
  [FlowNodeTypeEnum.appModule]: NodeSimple,
  [FlowNodeTypeEnum.pluginInput]: dynamic(() => import('./nodes/NodePluginIO/PluginInput')),
  [FlowNodeTypeEnum.pluginOutput]: dynamic(() => import('./nodes/NodePluginIO/PluginOutput')),
  [FlowNodeTypeEnum.pluginModule]: NodeSimple,
  [FlowNodeTypeEnum.queryExtension]: NodeSimple,
  [FlowNodeTypeEnum.stopTool]: NodeStopTool,
  [FlowNodeTypeEnum.agent]: dynamic(() => import('./nodes/NodeAgent')),
  [FlowNodeTypeEnum.toolCall]: dynamic(() => import('./nodes/NodeToolCall')),
  [FlowNodeTypeEnum.tool]: NodeSimple,
  [FlowNodeTypeEnum.toolSet]: dynamic(() => import('./nodes/NodeToolSet')),
  [FlowNodeTypeEnum.toolParams]: dynamic(() => import('./nodes/NodeToolParams')),
  [FlowNodeTypeEnum.ifElseNode]: dynamic(() => import('./nodes/NodeIfElse')),
  [FlowNodeTypeEnum.variableUpdate]: dynamic(() => import('./nodes/NodeVariableUpdate')),
  [FlowNodeTypeEnum.code]: dynamic(() => import('./nodes/NodeCode')),
  [FlowNodeTypeEnum.userSelect]: dynamic(() => import('./nodes/NodeUserSelect')),
  [FlowNodeTypeEnum.loop]: dynamic(() => import('./nodes/Loop/NodeLoop')),
  [FlowNodeTypeEnum.parallelRun]: dynamic(() => import('./nodes/Loop/NodeParallelRun')),
  [FlowNodeTypeEnum.loopRun]: dynamic(() => import('./nodes/Loop/NodeLoopRun')),
  [FlowNodeTypeEnum.loopRunStart]: dynamic(() => import('./nodes/Loop/NodeLoopRunStart')),
  [FlowNodeTypeEnum.loopRunBreak]: dynamic(() => import('./nodes/Loop/NodeLoopRunBreak')),
  [FlowNodeTypeEnum.nestedStart]: dynamic(() => import('./nodes/Loop/NodeLoopStart')),
  [FlowNodeTypeEnum.nestedEnd]: dynamic(() => import('./nodes/Loop/NodeLoopEnd')),
  [FlowNodeTypeEnum.formInput]: dynamic(() => import('./nodes/NodeFormInput')),
  [FlowNodeTypeEnum.comment]: dynamic(() => import('./nodes/NodeComment'))
};

const MeasuredNode = React.memo(
  ({
    nodeComponent,
    ...props
  }: NodeProps<FlowNodeItemType> & {
    nodeComponent: CanvasNodeComponent;
  }) => {
    const registerNodeMeasurement = useContextSelector(
      WorkflowCanvasContext,
      (v) => v.registerNodeMeasurement
    );
    const wrapperRef = useRef<HTMLDivElement>(null);
    const nodeId = props.id;
    const measurementIdentity = props.data;

    useEffect(() => {
      const wrapper = wrapperRef.current;
      const registration = registerNodeMeasurement(nodeId);
      if (!wrapper) return registration.dispose;

      let target: HTMLElement | null = null;
      let resizeObserver: ResizeObserver | undefined;
      let mutationObserver: MutationObserver | undefined;

      const findTarget = () => wrapper.querySelector<HTMLElement>('[data-workflow-node-card]');

      const reportSize = () => {
        if (!target) return;
        const rect = target.getBoundingClientRect();
        registration.report({ width: rect.width, height: rect.height });
      };

      const observeTarget = () => {
        const nextTarget = findTarget();
        if (!nextTarget || nextTarget === target) return !!nextTarget;

        resizeObserver?.disconnect();
        target = nextTarget;
        reportSize();

        if (typeof ResizeObserver === 'function') {
          resizeObserver = new ResizeObserver(reportSize);
          resizeObserver.observe(nextTarget);
        }
        return true;
      };

      if (!observeTarget() && typeof MutationObserver === 'function') {
        mutationObserver = new MutationObserver(() => {
          if (observeTarget()) mutationObserver?.disconnect();
        });
        mutationObserver.observe(wrapper, { childList: true, subtree: true });
      }

      return () => {
        mutationObserver?.disconnect();
        resizeObserver?.disconnect();
        registration.dispose();
      };
    }, [measurementIdentity, nodeId, registerNodeMeasurement]);

    return (
      <div ref={wrapperRef} style={{ display: 'contents' }}>
        {React.createElement(nodeComponent, props)}
      </div>
    );
  }
);
MeasuredNode.displayName = 'MeasuredNode';

const nodeTypes = Object.fromEntries(
  Object.entries(baseNodeTypes).map(([type, nodeComponent]) => {
    const MeasuredNodeType = React.memo((props: NodeProps<FlowNodeItemType>) => (
      <MeasuredNode nodeComponent={nodeComponent} {...props} />
    ));
    MeasuredNodeType.displayName = `MeasuredNodeType(${type})`;
    return [type, MeasuredNodeType];
  })
);

const edgeTypes = {
  [EDGE_TYPE]: ButtonEdge
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
  const nodes = useContextSelector(WorkflowCanvasContext, (v) => v.nodes);
  const edges = useContextSelector(WorkflowCanvasContext, (v) => v.edges);
  const helperLinesRef = useRef<HelperLinesController>(null);
  // 按字段订阅：整体订阅会让 hover / 鼠标进出画布带动整个画布组件重渲染，
  // 而这里只需要一个稳定 callback ref、一个原始值和一个菜单坐标。
  const reactFlowWrapperCallback = useContextSelector(
    WorkflowUIContext,
    (v) => v.reactFlowWrapperCallback
  );
  const workflowControlMode = useContextSelector(WorkflowUIContext, (v) => v.workflowControlMode);
  const menu = useContextSelector(WorkflowUIContext, (v) => v.menu);

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
  } = useWorkflow({ helperLinesRef });

  const {
    isOpen: isOpenTemplate,
    onOpen: onOpenTemplate,
    onClose: onCloseTemplate
  } = useDisclosure();

  const [movingCanvas, setMovingCanvas] = useState(false);
  // 手势起止只改一个 className 字符串，提成稳定引用后 ZoomPane 的 props 不再每帧换身份。
  const onMoveStart = useCallback(() => setMovingCanvas(true), []);
  const onMoveEnd = useCallback(() => setMovingCanvas(false), []);

  const { fitView } = useReactFlow();
  const fitViewDone = useRef(false);
  const reactFlowInitialized = useRef(false);

  const onInit = useCallback(() => {
    reactFlowInitialized.current = true;
  }, []);

  useEffect(() => {
    // 自动定位画布：需等待 ReactFlow 初始化完成(onInit) + 节点数据加载并渲染出宽高后执行，仅执行一次
    if (
      !reactFlowInitialized.current ||
      fitViewDone.current ||
      !nodes.length ||
      !nodes.every((node) => node.width && node.height)
    )
      return;

    fitViewDone.current = true;
    setTimeout(() => fitView({ padding: 0.3, nodes }), 0);
  }, [nodes, fitView]);

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
          nodes={nodes}
          edges={edges}
          minZoom={minZoom}
          maxZoom={maxZoom}
          onInit={onInit}
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
          {!!menu && <ContextMenu />}
          <FlowController />
          <HelperLines ref={helperLinesRef} />
        </ReactFlow>
      </Box>
    </>
  );
};

/**
 * 画布入口：选中态属于 renderer 交互层，Provider 挂在画布组件之上，
 * 覆盖 useWorkflow 与节点/边渲染器（Handle、ButtonEdge）等全部消费者。
 */
const Flow = () => (
  <WorkflowRuntimeGate>
    <WorkflowSelectionProvider>
      <WorkflowCanvas />
    </WorkflowSelectionProvider>
  </WorkflowRuntimeGate>
);

/** Runtime hydrate 前保留数据层初始化，但延迟挂载会调用 adapter hooks 的画布子树。 */
const WorkflowRuntimeGate = ({ children }: { children: React.ReactNode }) => {
  const runtime = useContextSelector(WorkflowHostContext, (v) => v.runtime);
  return runtime ? children : null;
};

export default React.memo(Flow);
