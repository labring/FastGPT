import dynamic from 'next/dynamic';
import ButtonEdge, { CustomConnectionLine } from './components/ButtonEdge';
import NodeTemplatesModal from './NodeTemplatesModal';
import 'reactflow/dist/style.css';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { defaultEdgeOptions, maxZoom, minZoom } from '../constants';
import 'reactflow/dist/style.css';
import { useContextSelector } from 'use-context-selector';
import NodeTemplatesPopover from './NodeTemplatesPopover';
import SearchButton from '../../Workflow/components/SearchButton';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { WorkflowInitContext, WorkflowBufferDataContext } from '../context/workflowInitContext';
import ContextMenu from './components/ContextMenu';
import FlowController from './components/FlowController';
import HelperLines from './components/HelperLines';
import { useWorkflow } from './hooks/useWorkflow';
import { EDGE_TYPE, FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { NodeProps } from 'reactflow';
import ReactFlow, { SelectionMode } from 'reactflow';
import { Box, IconButton, useDisclosure } from '@chakra-ui/react';
import React from 'react';
import { WorkflowUIContext } from '../context/workflowUIContext';

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
  [FlowNodeTypeEnum.systemConfig]: dynamic(() => import('./nodes/NodeSystemConfig')),
  [FlowNodeTypeEnum.pluginConfig]: dynamic(() => import('./nodes/NodePluginIO/NodePluginConfig')),
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
  [FlowNodeTypeEnum.agent]: dynamic(() => import('./nodes/NodeAgent')),
  [FlowNodeTypeEnum.stopTool]: NodeStopTool,
  [FlowNodeTypeEnum.tool]: NodeSimple,
  [FlowNodeTypeEnum.toolSet]: dynamic(() => import('./nodes/NodeToolSet')),
  [FlowNodeTypeEnum.toolParams]: dynamic(() => import('./nodes/NodeToolParams')),
  [FlowNodeTypeEnum.lafModule]: dynamic(() => import('./nodes/NodeLaf')),
  [FlowNodeTypeEnum.ifElseNode]: dynamic(() => import('./nodes/NodeIfElse')),
  [FlowNodeTypeEnum.variableUpdate]: dynamic(() => import('./nodes/NodeVariableUpdate')),
  [FlowNodeTypeEnum.code]: dynamic(() => import('./nodes/NodeCode')),
  [FlowNodeTypeEnum.userSelect]: dynamic(() => import('./nodes/NodeUserSelect')),
  [FlowNodeTypeEnum.loop]: dynamic(() => import('./nodes/Loop/NodeLoop')),
  [FlowNodeTypeEnum.loopStart]: dynamic(() => import('./nodes/Loop/NodeLoopStart')),
  [FlowNodeTypeEnum.loopEnd]: dynamic(() => import('./nodes/Loop/NodeLoopEnd')),
  [FlowNodeTypeEnum.formInput]: dynamic(() => import('./nodes/NodeFormInput')),
  [FlowNodeTypeEnum.comment]: dynamic(() => import('./nodes/NodeComment'))
};
const edgeTypes = {
  [EDGE_TYPE]: ButtonEdge
};

const Workflow = () => {
  const nodes = useContextSelector(WorkflowInitContext, (v) => v.nodes);
  const edges = useContextSelector(WorkflowBufferDataContext, (v) => v.edges);
  const { reactFlowWrapperCallback, workflowControlMode, menu } = useContextSelector(
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
    helperLineHorizontal,
    helperLineVertical,
    onNodeDragStop,
    onPaneContextMenu,
    onPaneClick
  } = useWorkflow();

  const {
    isOpen: isOpenTemplate,
    onOpen: onOpenTemplate,
    onClose: onCloseTemplate
  } = useDisclosure();

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
            <IconButton
              icon={<MyIcon name="common/addLight" w={6} />}
              w={9}
              h={9}
              borderRadius={'50%'}
              bg={'black'}
              _hover={{ bg: 'myGray.700' }}
              aria-label={''}
              boxShadow={'0 4px 10px 0 rgba(19, 51, 107, 0.20), 0 0 1px 0 rgba(19, 51, 107, 0.50)'}
              onClick={() => {
                isOpenTemplate ? onCloseTemplate() : onOpenTemplate();
              }}
            />
          </Box>
          <SearchButton />
          <NodeTemplatesModal isOpen={isOpenTemplate} onClose={onCloseTemplate} />
          <NodeTemplatesPopover />
        </>

        <ReactFlow
          ref={reactFlowWrapperCallback}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          nodes={nodes}
          edges={edges}
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
        >
          {!!menu && <ContextMenu />}
          <FlowController />
          <HelperLines horizontal={helperLineHorizontal} vertical={helperLineVertical} />
        </ReactFlow>
      </Box>
    </>
  );
};

export default React.memo(Workflow);
