import React, { useEffect } from 'react';
import ReactFlow, { Background, Controls, ReactFlowProvider } from 'reactflow';
import { Box, Flex, IconButton, useDisclosure } from '@chakra-ui/react';
import { SmallCloseIcon } from '@chakra-ui/icons';
import { edgeOptions, connectionLineStyle, FlowModuleTypeEnum } from '@/constants/flow';

import dynamic from 'next/dynamic';

import ButtonEdge from './components/modules/ButtonEdge';
import TemplateList from './TemplateList';
import FlowProvider, { useFlowProviderStore } from './FlowProvider';

import 'reactflow/dist/style.css';
import { AppModuleItemType } from '@/types/app';

const nodeTypes = {
  [FlowModuleTypeEnum.userGuide]: dynamic(() => import('./components/nodes/NodeUserGuide')),
  [FlowModuleTypeEnum.variable]: dynamic(() => import('./components/nodes/NodeVariable')),
  [FlowModuleTypeEnum.questionInput]: dynamic(() => import('./components/nodes/NodeQuestionInput')),
  [FlowModuleTypeEnum.historyNode]: dynamic(() => import('./components/nodes/NodeHistory')),
  [FlowModuleTypeEnum.chatNode]: dynamic(() => import('./components/nodes/NodeChat')),
  [FlowModuleTypeEnum.datasetSearchNode]: dynamic(
    () => import('./components/nodes/NodeDatasetSearch')
  ),
  [FlowModuleTypeEnum.answerNode]: dynamic(() => import('./components/nodes/NodeAnswer')),
  [FlowModuleTypeEnum.classifyQuestion]: dynamic(() => import('./components/nodes/NodeCQNode')),
  [FlowModuleTypeEnum.contentExtract]: dynamic(() => import('./components/nodes/NodeExtract')),
  [FlowModuleTypeEnum.httpRequest]: dynamic(() => import('./components/nodes/NodeHttp')),
  [FlowModuleTypeEnum.runApp]: dynamic(() => import('./components/nodes/NodeRunAPP'))
};
const edgeTypes = {
  buttonedge: ButtonEdge
};
type Props = { modules: AppModuleItemType[]; filterAppIds?: string[]; Header: React.ReactNode };

const Container = React.memo(function Container(props: Props) {
  const { modules = [], Header } = props;

  const {
    isOpen: isOpenTemplate,
    onOpen: onOpenTemplate,
    onClose: onCloseTemplate
  } = useDisclosure();

  const { reactFlowWrapper, nodes, onNodesChange, edges, onEdgesChange, onConnect, initData } =
    useFlowProviderStore();

  useEffect(() => {
    initData(JSON.parse(JSON.stringify(modules)));
  }, [modules]);

  return (
    <>
      {/* header */}
      {Header}
      <Box
        minH={'400px'}
        flex={'1 0 0'}
        w={'100%'}
        h={0}
        position={'relative'}
        onContextMenu={(e) => {
          e.preventDefault();
          return false;
        }}
      >
        {/* open module template */}
        <IconButton
          position={'absolute'}
          top={5}
          left={5}
          w={'38px'}
          h={'38px'}
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

        <ReactFlow
          ref={reactFlowWrapper}
          fitView
          nodes={nodes}
          edges={edges}
          minZoom={0.1}
          maxZoom={1.5}
          defaultEdgeOptions={edgeOptions}
          connectionLineStyle={connectionLineStyle}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={(connect) => {
            connect.sourceHandle &&
              connect.targetHandle &&
              onConnect({
                connect
              });
          }}
        >
          <Background />
          <Controls position={'bottom-right'} style={{ display: 'flex' }} showInteractive={false} />
        </ReactFlow>

        <TemplateList isOpen={isOpenTemplate} onClose={onCloseTemplate} />
      </Box>
    </>
  );
});

const Flow = (data: Props) => {
  return (
    <Box h={'100%'} position={'fixed'} zIndex={999} top={0} left={0} right={0} bottom={0}>
      <ReactFlowProvider>
        <FlowProvider filterAppIds={data.filterAppIds}>
          <Flex h={'100%'} flexDirection={'column'} bg={'#fff'}>
            <Container {...data} />
          </Flex>
        </FlowProvider>
      </ReactFlowProvider>
    </Box>
  );
};

export default React.memo(Flow);
