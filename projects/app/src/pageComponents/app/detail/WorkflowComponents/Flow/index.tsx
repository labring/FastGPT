import dynamic from 'next/dynamic';
import ButtonEdge, { CustomConnectionLine } from './components/ButtonEdge';
import NodeTemplatesModal from './NodeTemplatesModal';
import '@xyflow/react/dist/style.css';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { defaultEdgeOptions, maxZoom, minZoom } from '../constants';
import { useContextSelector } from 'use-context-selector';
import NodeTemplatesPopover from './NodeTemplatesPopover';
import SearchButton from '../../Workflow/components/SearchButton';
import SystemConfigDrawer from './SystemConfigDrawer';
import MyIcon from '@fastgpt/web/components/common/Icon';
import ContextMenu from './components/ContextMenu';
import { useWorkflowStore } from '../store/useWorkflowStore';
import FlowController from './components/FlowController';
import HelperLines, { type HelperLinesController } from './components/HelperLines';
import { useWorkflow } from './hooks/useWorkflow';
import { EDGE_TYPE, FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  ReactFlow,
  SelectionMode,
  useReactFlow,
  type Node,
  type NodeProps,
  type NodeTypes,
  type EdgeTypes
} from '@xyflow/react';
import { Box, IconButton, useDisclosure } from '@chakra-ui/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { WorkflowUIContext } from '../context/workflowUIContext';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';

const NodeSimple = dynamic(() => import('./nodes/NodeSimple'));
const NodeStopTool = React.memo((props: NodeProps<Node<FlowNodeItemType>>) => (
  <NodeSimple {...props} minW={'100px'} maxW={'300px'} />
));
NodeStopTool.displayName = 'NodeStopTool';

const nodeTypes: NodeTypes = {
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
const edgeTypes: EdgeTypes = {
  [EDGE_TYPE]: ButtonEdge
};

const Workflow = () => {
  const { t } = useTranslation();
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const helperLinesRef = useRef<HelperLinesController>(null);
  const reactFlowWrapperCallback = useContextSelector(
    WorkflowUIContext,
    (v) => v.reactFlowWrapperCallback
  );
  const workflowControlMode = useWorkflowStore((s) => s.workflowControlMode);
  const menu = useWorkflowStore((s) => s.menu);

  const onFlowError = useCallback((id: string, message: string) => {
    // 忽略首屏节点测量完成前或动态调整 handle 时产生的瞬态 008 警告
    if (id === '008') return;
    console.warn(`[React Flow]: ${message} (${id})`);
  }, []);

  const {
    handleNodesChange,
    handleEdgeChange,
    onConnectStart,
    onConnectEnd,
    customOnConnect,
    isValidConnection,
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

  const { fitView } = useReactFlow();
  const fitViewDone = useRef(false);

  useEffect(() => {
    if (fitViewDone.current || !nodes.length) return;
    fitViewDone.current = true;

    // 优先自动聚焦到首个错误节点
    const errorNode = nodes.find((n) => n.data?.isError);
    if (errorNode) {
      fitView({
        nodes: [{ id: errorNode.id }],
        includeHiddenNodes: true,
        padding: 0.3,
        minZoom: 0.7,
        maxZoom: 1
      });
      return;
    }

    if (nodes.length <= 15) {
      fitView({ padding: 0.3, includeHiddenNodes: true, minZoom: 0.6, maxZoom: 1 });
    } else {
      const startNode = nodes.find((n) => n.data?.flowNodeType === FlowNodeTypeEnum.workflowStart);
      if (startNode) {
        fitView({
          nodes: [{ id: startNode.id }],
          includeHiddenNodes: true,
          padding: 0.4,
          minZoom: 0.8,
          maxZoom: 1
        });
      } else {
        fitView({
          nodes: [{ id: nodes[0].id }],
          includeHiddenNodes: true,
          padding: 0.4,
          minZoom: 0.8,
          maxZoom: 1
        });
      }
    }
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
                onClick={() => {
                  if (isOpenTemplate) {
                    onCloseTemplate();
                  } else {
                    onOpenTemplate();
                  }
                }}
              />
            </MyTooltip>
          </Box>
          <SearchButton />
          <SystemConfigDrawer />
          <NodeTemplatesModal isOpen={isOpenTemplate} onClose={onCloseTemplate} />
          <NodeTemplatesPopover />
        </>

        <ReactFlow
          ref={reactFlowWrapperCallback}
          nodes={nodes}
          edges={edges}
          onError={onFlowError}
          onlyRenderVisibleElements={true}
          minZoom={minZoom}
          maxZoom={maxZoom}
          defaultEdgeOptions={defaultEdgeOptions}
          elevateEdgesOnSelect
          connectionLineComponent={CustomConnectionLine}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionRadius={50}
          connectionDragThreshold={0}
          isValidConnection={isValidConnection}
          defaultViewport={{ x: 100, y: 100, zoom: 0.8 }}
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
          {!!menu && <ContextMenu />}
          <FlowController />
          <HelperLines ref={helperLinesRef} />
        </ReactFlow>
      </Box>
    </>
  );
};

export default React.memo(Workflow);
