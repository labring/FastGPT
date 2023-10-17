import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, { Background, Controls, ReactFlowProvider } from 'reactflow';
import { Box, Flex, IconButton, useTheme, useDisclosure } from '@chakra-ui/react';
import { SmallCloseIcon } from '@chakra-ui/icons';
import {
  edgeOptions,
  connectionLineStyle,
  FlowModuleTypeEnum,
  FlowInputItemTypeEnum
} from '@/constants/flow';
import { FlowOutputTargetItemType } from '@/types/core/app/flow';
import { AppModuleItemType } from '@/types/app';
import { useRequest } from '@/web/common/hooks/useRequest';
import type { AppSchema } from '@/types/mongoSchema';
import { useUserStore } from '@/web/support/store/user';
import { useTranslation } from 'next-i18next';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import dynamic from 'next/dynamic';
import styles from './index.module.scss';
import { AppTypeEnum } from '@/constants/app';

import MyIcon from '@/components/Icon';
import ButtonEdge from './components/modules/ButtonEdge';
import MyTooltip from '@/components/MyTooltip';
import TemplateList from './components/TemplateList';
import ChatTest, { type ChatTestComponentRef } from './components/ChatTest';
import FlowProvider, { useFlowStore } from './components/Provider';
import Header from './components/Header';

const ImportSettings = dynamic(() => import('./components/ImportSettings'));
const NodeChat = dynamic(() => import('./components/Nodes/NodeChat'));
const NodeKbSearch = dynamic(() => import('./components/Nodes/NodeKbSearch'));
const NodeHistory = dynamic(() => import('./components/Nodes/NodeHistory'));
const NodeTFSwitch = dynamic(() => import('./components/Nodes/NodeTFSwitch'));
const NodeAnswer = dynamic(() => import('./components/Nodes/NodeAnswer'));
const NodeQuestionInput = dynamic(() => import('./components/Nodes/NodeQuestionInput'));
const NodeCQNode = dynamic(() => import('./components/Nodes/NodeCQNode'));
const NodeVariable = dynamic(() => import('./components/Nodes/NodeVariable'));
const NodeUserGuide = dynamic(() => import('./components/Nodes/NodeUserGuide'));
const NodeExtract = dynamic(() => import('./components/Nodes/NodeExtract'));
const NodeHttp = dynamic(() => import('./components/Nodes/NodeHttp'));
const NodeAPP = dynamic(() => import('./components/Nodes/NodeAPP'));

import 'reactflow/dist/style.css';

const nodeTypes = {
  [FlowModuleTypeEnum.userGuide]: NodeUserGuide,
  [FlowModuleTypeEnum.variable]: NodeVariable,
  [FlowModuleTypeEnum.questionInput]: NodeQuestionInput,
  [FlowModuleTypeEnum.historyNode]: NodeHistory,
  [FlowModuleTypeEnum.chatNode]: NodeChat,
  [FlowModuleTypeEnum.kbSearchNode]: NodeKbSearch,
  [FlowModuleTypeEnum.tfSwitchNode]: NodeTFSwitch,
  [FlowModuleTypeEnum.answerNode]: NodeAnswer,
  [FlowModuleTypeEnum.classifyQuestion]: NodeCQNode,
  [FlowModuleTypeEnum.contentExtract]: NodeExtract,
  [FlowModuleTypeEnum.httpRequest]: NodeHttp,
  [FlowModuleTypeEnum.app]: NodeAPP
  // [FlowModuleTypeEnum.empty]: EmptyModule
};
const edgeTypes = {
  buttonedge: ButtonEdge
};
type Props = { app: AppSchema; onCloseSettings: () => void };

const AppEdit = React.memo(function AppEdit(props: Props) {
  const { app } = props;

  const {
    isOpen: isOpenTemplate,
    onOpen: onOpenTemplate,
    onClose: onCloseTemplate
  } = useDisclosure();

  const { reactFlowWrapper, nodes, onNodesChange, edges, onEdgesChange, onConnect, initData } =
    useFlowStore();

  useEffect(() => {
    initData(JSON.parse(JSON.stringify(app.modules)));
  }, [app.modules]);

  return (
    <>
      {/* header */}
      <Header app={app} onCloseSettings={props.onCloseSettings} />
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
          className={styles.panel}
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
        <FlowProvider appId={data?.app?._id}>
          <Flex h={'100%'} flexDirection={'column'} bg={'#fff'}>
            {!!data.app._id && <AppEdit {...data} />}
          </Flex>
        </FlowProvider>
      </ReactFlowProvider>
    </Box>
  );
};

export default React.memo(Flow);
