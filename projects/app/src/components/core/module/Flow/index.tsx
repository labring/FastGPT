import React, { useCallback, useMemo } from 'react';
import ReactFlow, { Background, Connection, Controls, ReactFlowProvider } from 'reactflow';
import { Box, Flex, IconButton, useDisclosure } from '@chakra-ui/react';
import { SmallCloseIcon } from '@chakra-ui/icons';
import { EDGE_TYPE, FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';

import dynamic from 'next/dynamic';

import ButtonEdge from './components/modules/ButtonEdge';
import ModuleTemplateList, { type ModuleTemplateProps } from './ModuleTemplateList';
import { useFlowProviderStore } from './FlowProvider';

import 'reactflow/dist/style.css';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';

const NodeSimple = dynamic(() => import('./components/nodes/NodeSimple'));
const nodeTypes: Record<`${FlowNodeTypeEnum}`, any> = {
  [FlowNodeTypeEnum.userGuide]: dynamic(() => import('./components/nodes/NodeUserGuide')),
  [FlowNodeTypeEnum.questionInput]: dynamic(() => import('./components/nodes/NodeQuestionInput')),
  [FlowNodeTypeEnum.historyNode]: NodeSimple,
  [FlowNodeTypeEnum.chatNode]: NodeSimple,
  [FlowNodeTypeEnum.datasetSearchNode]: NodeSimple,
  [FlowNodeTypeEnum.datasetConcatNode]: dynamic(
    () => import('./components/nodes/NodeDatasetConcat')
  ),
  [FlowNodeTypeEnum.answerNode]: dynamic(() => import('./components/nodes/NodeAnswer')),
  [FlowNodeTypeEnum.classifyQuestion]: dynamic(() => import('./components/nodes/NodeCQNode')),
  [FlowNodeTypeEnum.contentExtract]: dynamic(() => import('./components/nodes/NodeExtract')),
  [FlowNodeTypeEnum.httpRequest468]: dynamic(() => import('./components/nodes/NodeHttp')),
  [FlowNodeTypeEnum.httpRequest]: NodeSimple,
  [FlowNodeTypeEnum.runApp]: NodeSimple,
  [FlowNodeTypeEnum.pluginInput]: dynamic(() => import('./components/nodes/NodePluginInput')),
  [FlowNodeTypeEnum.pluginOutput]: dynamic(() => import('./components/nodes/NodePluginOutput')),
  [FlowNodeTypeEnum.pluginModule]: NodeSimple,
  [FlowNodeTypeEnum.cfr]: NodeSimple
};
const edgeTypes = {
  [EDGE_TYPE]: ButtonEdge
};

const Container = React.memo(function Container() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { reactFlowWrapper, nodes, onNodesChange, edges, onEdgesChange, onConnect } =
    useFlowProviderStore();

  const memoRenderTools = useMemo(
    () => (
      <>
        <Background />
        <Controls position={'bottom-right'} style={{ display: 'flex' }} showInteractive={false} />
      </>
    ),
    []
  );

  const customOnConnect = useCallback(
    (connect: Connection) => {
      if (!connect.sourceHandle || !connect.targetHandle) {
        return;
      }
      if (connect.source === connect.target) {
        return toast({
          status: 'warning',
          title: t('core.module.Can not connect self')
        });
      }
      onConnect({
        connect
      });
    },
    [onConnect, t, toast]
  );

  return (
    <ReactFlow
      ref={reactFlowWrapper}
      fitView
      nodes={nodes}
      edges={edges}
      minZoom={0.1}
      maxZoom={1.5}
      defaultEdgeOptions={{
        animated: true,
        zIndex: 0
      }}
      elevateEdgesOnSelect
      connectionLineStyle={{ strokeWidth: 2, stroke: '#5A646Es' }}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={customOnConnect}
    >
      {memoRenderTools}
    </ReactFlow>
  );
});

const Flow = ({
  Header,
  templates,
  ...data
}: ModuleTemplateProps & { Header: React.ReactNode }) => {
  const {
    isOpen: isOpenTemplate,
    onOpen: onOpenTemplate,
    onClose: onCloseTemplate
  } = useDisclosure();

  const memoRenderContainer = useMemo(() => {
    return (
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

        <Container {...data} />

        <ModuleTemplateList
          templates={templates}
          isOpen={isOpenTemplate}
          onClose={onCloseTemplate}
        />
      </Box>
    );
  }, [data, isOpenTemplate, onCloseTemplate, onOpenTemplate, templates]);

  return (
    <Box h={'100%'} position={'fixed'} zIndex={999} top={0} left={0} right={0} bottom={0}>
      <ReactFlowProvider>
        <Flex h={'100%'} flexDirection={'column'} bg={'#fff'}>
          {Header}
          {memoRenderContainer}
        </Flex>
      </ReactFlowProvider>
    </Box>
  );
};

export default React.memo(Flow);
