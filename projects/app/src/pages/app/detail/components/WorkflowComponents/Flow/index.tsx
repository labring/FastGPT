import React, { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  ControlButton,
  MiniMap,
  NodeProps,
  ReactFlowProvider,
  useReactFlow
} from 'reactflow';
import { Box, IconButton, useDisclosure } from '@chakra-ui/react';
import { SmallCloseIcon } from '@chakra-ui/icons';
import { EDGE_TYPE, FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

import dynamic from 'next/dynamic';

import ButtonEdge from './components/ButtonEdge';
import NodeTemplatesModal from './NodeTemplatesModal';

import 'reactflow/dist/style.css';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { connectionLineStyle, defaultEdgeOptions } from '../constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../context';
import { useWorkflow } from './hooks/useWorkflow';

const NodeSimple = dynamic(() => import('./nodes/NodeSimple'));
const nodeTypes: Record<FlowNodeTypeEnum, any> = {
  [FlowNodeTypeEnum.emptyNode]: NodeSimple,
  [FlowNodeTypeEnum.globalVariable]: NodeSimple,
  [FlowNodeTypeEnum.systemConfig]: dynamic(() => import('./nodes/NodeSystemConfig')),
  [FlowNodeTypeEnum.workflowStart]: dynamic(() => import('./nodes/NodeWorkflowStart')),
  [FlowNodeTypeEnum.chatNode]: NodeSimple,
  [FlowNodeTypeEnum.datasetSearchNode]: NodeSimple,
  [FlowNodeTypeEnum.datasetConcatNode]: dynamic(() => import('./nodes/NodeDatasetConcat')),
  [FlowNodeTypeEnum.answerNode]: dynamic(() => import('./nodes/NodeAnswer')),
  [FlowNodeTypeEnum.classifyQuestion]: dynamic(() => import('./nodes/NodeCQNode')),
  [FlowNodeTypeEnum.contentExtract]: dynamic(() => import('./nodes/NodeExtract')),
  [FlowNodeTypeEnum.httpRequest468]: dynamic(() => import('./nodes/NodeHttp')),
  [FlowNodeTypeEnum.runApp]: NodeSimple,
  [FlowNodeTypeEnum.pluginInput]: dynamic(() => import('./nodes/NodePluginInput')),
  [FlowNodeTypeEnum.pluginOutput]: dynamic(() => import('./nodes/NodePluginOutput')),
  [FlowNodeTypeEnum.pluginModule]: NodeSimple,
  [FlowNodeTypeEnum.queryExtension]: NodeSimple,
  [FlowNodeTypeEnum.tools]: dynamic(() => import('./nodes/NodeTools')),
  [FlowNodeTypeEnum.stopTool]: (data: NodeProps<FlowNodeItemType>) => (
    <NodeSimple {...data} minW={'100px'} maxW={'300px'} />
  ),
  [FlowNodeTypeEnum.lafModule]: dynamic(() => import('./nodes/NodeLaf')),
  [FlowNodeTypeEnum.ifElseNode]: dynamic(() => import('./nodes/NodeIfElse')),
  [FlowNodeTypeEnum.variableUpdate]: dynamic(() => import('./nodes/NodeVariableUpdate')),
  [FlowNodeTypeEnum.code]: dynamic(() => import('./nodes/NodeCode'))
};
const edgeTypes = {
  [EDGE_TYPE]: ButtonEdge
};

const Workflow = () => {
  const { nodes, edges, reactFlowWrapper } = useContextSelector(WorkflowContext, (v) => v);

  const {
    ConfirmDeleteModal,
    handleNodesChange,
    handleEdgeChange,
    onConnectStart,
    onConnectEnd,
    customOnConnect,
    onEdgeMouseEnter,
    onEdgeMouseLeave
  } = useWorkflow();

  const {
    isOpen: isOpenTemplate,
    onOpen: onOpenTemplate,
    onClose: onCloseTemplate
  } = useDisclosure();

  return (
    <ReactFlowProvider>
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
          <IconButton
            position={'absolute'}
            top={5}
            left={5}
            size={'mdSquare'}
            borderRadius={'50%'}
            icon={<SmallCloseIcon fontSize={'26px'} />}
            transform={isOpenTemplate ? '' : 'rotate(135deg)'}
            transition={'0.2s ease'}
            aria-label={''}
            zIndex={1}
            boxShadow={'2px 2px 6px #85b1ff'}
            onClick={() => {
              isOpenTemplate ? onCloseTemplate() : onOpenTemplate();
            }}
          />
          <NodeTemplatesModal isOpen={isOpenTemplate} onClose={onCloseTemplate} />
        </>

        <ReactFlow
          ref={reactFlowWrapper}
          fitView
          nodes={nodes}
          edges={edges}
          minZoom={0.1}
          maxZoom={1.5}
          defaultEdgeOptions={defaultEdgeOptions}
          elevateEdgesOnSelect
          connectionLineStyle={connectionLineStyle}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgeChange}
          onConnect={customOnConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onEdgeMouseEnter={onEdgeMouseEnter}
          onEdgeMouseLeave={onEdgeMouseLeave}
        >
          <FlowController />
        </ReactFlow>
      </Box>

      <ConfirmDeleteModal />
    </ReactFlowProvider>
  );
};

export default React.memo(Workflow);

const FlowController = React.memo(function FlowController() {
  const { fitView } = useReactFlow();

  const Render = useMemo(() => {
    return (
      <>
        <MiniMap
          style={{
            height: 78,
            width: 126,
            marginBottom: 35
          }}
          pannable
        />
        <Controls
          position={'bottom-right'}
          style={{
            display: 'flex',
            marginBottom: 5,
            background: 'white',
            borderRadius: '6px',
            overflow: 'hidden',
            boxShadow:
              '0px 0px 1px 0px rgba(19, 51, 107, 0.20), 0px 12px 16px -4px rgba(19, 51, 107, 0.20)'
          }}
          showInteractive={false}
          showFitView={false}
        >
          <MyTooltip label={'页面居中'}>
            <ControlButton className="custom-workflow-fix_view" onClick={() => fitView()}>
              <MyIcon name={'core/modules/fixview'} w={'14px'} />
            </ControlButton>
          </MyTooltip>
        </Controls>
        <Background />
      </>
    );
  }, [fitView]);

  return Render;
});
