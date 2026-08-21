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
import SystemConfigDrawer, { SystemConfigButton } from './SystemConfigDrawer';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { WorkflowInitContext, WorkflowBufferDataContext } from '../context/workflowInitContext';
import ContextMenu from './components/ContextMenu';
import FlowController from './components/FlowController';
import HelperLines, { type HelperLinesController } from './components/HelperLines';
import { useWorkflow } from './hooks/useWorkflow';
import { EDGE_TYPE, FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { NodeProps } from 'reactflow';
import ReactFlow, { SelectionMode, useReactFlow } from 'reactflow';
import { Box, Flex, IconButton, usePrefersReducedMotion } from '@chakra-ui/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { WorkflowUIContext } from '../context/workflowUIContext';
import { useTranslation } from 'next-i18next';
import WorkflowBuilderEntry from '../WorkflowBuilder/WorkflowBuilderEntry';
import { useWorkflowBuilderUI } from '../WorkflowBuilder/context';
import WorkflowToolbarTooltip from '../WorkflowBuilder/WorkflowToolbarTooltip';

const NodeSimple = dynamic(() => import('./nodes/NodeSimple'));
const NodeStopTool = React.memo((props: NodeProps<FlowNodeItemType>) => (
  <NodeSimple {...props} minW={'100px'} maxW={'300px'} />
));
NodeStopTool.displayName = 'NodeStopTool';

const nodeTypes: Record<FlowNodeTypeEnum, any> = {
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
const edgeTypes = {
  [EDGE_TYPE]: ButtonEdge
};

const Workflow = () => {
  const { t } = useTranslation();
  const nodes = useContextSelector(WorkflowInitContext, (v) => v.nodes);
  const edges = useContextSelector(WorkflowBufferDataContext, (v) => v.edges);
  const helperLinesRef = useRef<HelperLinesController>(null);
  const { reactFlowWrapperCallback, workflowControlMode } = useContextSelector(
    WorkflowUIContext,
    (v) => v
  );

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

  const { workflowCanvasRef, activeLeftPanel, closeLeftPanel, toggleLeftPanel } =
    useWorkflowBuilderUI();
  const isOpenTemplate = activeLeftPanel === 'nodeTemplates';
  const isLeftPanelOpen = Boolean(activeLeftPanel);
  const prefersReducedMotion = usePrefersReducedMotion();

  const [movingCanvas, setMovingCanvas] = useState(false);

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
        {/* 非搜索入口打开面板时保留工具栏节点并向左退出，避免条件卸载造成图标逐个跳动。 */}
        <>
          <Flex
            position={'absolute'}
            top={'50%'}
            left={5}
            zIndex={2}
            transform={
              isLeftPanelOpen ? 'translate(calc(-100% - 24px), -50%)' : 'translate(0, -50%)'
            }
            opacity={isLeftPanelOpen ? 0 : 1}
            pointerEvents={isLeftPanelOpen ? 'none' : 'auto'}
            aria-hidden={isLeftPanelOpen}
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
            <Box w={'20px'} h={'1px'} flexShrink={0} bg={'#E8EBF0'} />
            <WorkflowToolbarTooltip label={t('workflow:to_add_node')}>
              <IconButton
                icon={
                  <MyIcon name="core/app/workflowToolbarAdd" boxSize={'18px'} color={'white'} />
                }
                w={8}
                minW={8}
                h={8}
                p={'7px'}
                borderRadius={'6px'}
                bg={'black'}
                _hover={{ bg: '#1D2532' }}
                aria-label={t('workflow:to_add_node')}
                border={'none'}
                onClick={() => {
                  toggleLeftPanel('nodeTemplates');
                }}
              />
            </WorkflowToolbarTooltip>
            <Box w={'20px'} h={'1px'} flexShrink={0} bg={'#E8EBF0'} />
            <SystemConfigButton />
            <Box w={'20px'} h={'1px'} flexShrink={0} bg={'#E8EBF0'} />
            <SearchButton inToolbar portalContainerRef={workflowCanvasRef} />
          </Flex>
          <SystemConfigDrawer />
          <NodeTemplatesModal
            isOpen={isOpenTemplate}
            onClose={() => closeLeftPanel('nodeTemplates')}
          />
          <NodeTemplatesPopover />
        </>

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
          style={{ background: '#F7F8FA' }}
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
          onMoveStart={() => {
            setMovingCanvas(true);
          }}
          onMoveEnd={() => {
            setMovingCanvas(false);
          }}
        >
          <ContextMenu />
          <FlowController />
          <HelperLines ref={helperLinesRef} />
        </ReactFlow>
      </Box>
    </>
  );
};

export default React.memo(Workflow);
