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
import { useRequest } from '@/hooks/useRequest';
import type { AppSchema } from '@/types/mongoSchema';
import { useUserStore } from '@/store/user';
import { useTranslation } from 'next-i18next';
import { useCopyData } from '@/hooks/useCopyData';
import dynamic from 'next/dynamic';
import styles from './index.module.scss';
import { AppTypeEnum } from '@/constants/app';

import MyIcon from '@/components/Icon';
import ButtonEdge from './components/modules/ButtonEdge';
import MyTooltip from '@/components/MyTooltip';
import TemplateList from './components/TemplateList';
import ChatTest, { type ChatTestComponentRef } from './components/ChatTest';
import FlowProvider, { useFlowStore } from './components/Provider';

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
  [FlowModuleTypeEnum.httpRequest]: NodeHttp
  // [FlowModuleTypeEnum.empty]: EmptyModule
};
const edgeTypes = {
  buttonedge: ButtonEdge
};
type Props = { app: AppSchema; onCloseSettings: () => void };

function FlowHeader({ app, onCloseSettings }: Props & {}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const ChatTestRef = useRef<ChatTestComponentRef>(null);
  const { isOpen: isOpenImport, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();
  const { updateAppDetail } = useUserStore();
  const { nodes, edges, onFixView } = useFlowStore();

  const [testModules, setTestModules] = useState<AppModuleItemType[]>();

  const flow2AppModules = useCallback(() => {
    const modules: AppModuleItemType[] = nodes.map((item) => ({
      moduleId: item.data.moduleId,
      name: item.data.name,
      flowType: item.data.flowType,
      showStatus: item.data.showStatus,
      position: item.position,
      inputs: item.data.inputs.map((item) => ({
        ...item,
        connected: item.connected ?? item.type !== FlowInputItemTypeEnum.target
      })),
      outputs: item.data.outputs.map((item) => ({
        ...item,
        targets: [] as FlowOutputTargetItemType[]
      }))
    }));

    // update inputs and outputs
    modules.forEach((module) => {
      module.inputs.forEach((input) => {
        input.connected =
          input.connected ||
          !!edges.find(
            (edge) => edge.target === module.moduleId && edge.targetHandle === input.key
          );
      });
      module.outputs.forEach((output) => {
        output.targets = edges
          .filter(
            (edge) =>
              edge.source === module.moduleId &&
              edge.sourceHandle === output.key &&
              edge.targetHandle
          )
          .map((edge) => ({
            moduleId: edge.target,
            key: edge.targetHandle || ''
          }));
      });
    });
    return modules;
  }, [edges, nodes]);

  const { mutate: onclickSave, isLoading } = useRequest({
    mutationFn: () => {
      return updateAppDetail(app._id, {
        modules: flow2AppModules(),
        type: AppTypeEnum.advanced
      });
    },
    successToast: '保存配置成功',
    errorToast: '保存配置异常',
    onSuccess() {
      ChatTestRef.current?.resetChatTest();
    }
  });

  return (
    <>
      <Flex
        py={3}
        px={[2, 5, 8]}
        borderBottom={theme.borders.base}
        alignItems={'center'}
        userSelect={'none'}
      >
        <MyTooltip label={'返回'} offset={[10, 10]}>
          <IconButton
            size={'sm'}
            icon={<MyIcon name={'back'} w={'14px'} />}
            borderRadius={'md'}
            borderColor={'myGray.300'}
            variant={'base'}
            aria-label={''}
            onClick={() => {
              onCloseSettings();
              onFixView();
            }}
          />
        </MyTooltip>
        <Box ml={[3, 6]} fontSize={['md', '2xl']} flex={1}>
          {app.name}
        </Box>

        <MyTooltip label={t('app.Import Configs')}>
          <IconButton
            mr={[3, 6]}
            icon={<MyIcon name={'importLight'} w={['14px', '16px']} />}
            borderRadius={'lg'}
            variant={'base'}
            aria-label={'save'}
            onClick={onOpenImport}
          />
        </MyTooltip>
        <MyTooltip label={t('app.Export Configs')}>
          <IconButton
            mr={[3, 6]}
            icon={<MyIcon name={'export'} w={['14px', '16px']} />}
            borderRadius={'lg'}
            variant={'base'}
            aria-label={'save'}
            onClick={() =>
              copyData(
                JSON.stringify(flow2AppModules(), null, 2),
                t('app.Export Config Successful')
              )
            }
          />
        </MyTooltip>

        {testModules ? (
          <IconButton
            mr={[3, 6]}
            icon={<SmallCloseIcon fontSize={'25px'} />}
            variant={'base'}
            color={'myGray.600'}
            borderRadius={'lg'}
            aria-label={''}
            onClick={() => setTestModules(undefined)}
          />
        ) : (
          <MyTooltip label={'测试对话'}>
            <IconButton
              mr={[3, 6]}
              icon={<MyIcon name={'chat'} w={['14px', '16px']} />}
              borderRadius={'lg'}
              aria-label={'save'}
              variant={'base'}
              onClick={() => {
                setTestModules(flow2AppModules());
              }}
            />
          </MyTooltip>
        )}

        <MyTooltip label={'保存配置'}>
          <IconButton
            icon={<MyIcon name={'save'} w={['14px', '16px']} />}
            borderRadius={'lg'}
            isLoading={isLoading}
            aria-label={'save'}
            onClick={onclickSave}
          />
        </MyTooltip>
      </Flex>
      {isOpenImport && <ImportSettings onClose={onCloseImport} />}
      <ChatTest
        ref={ChatTestRef}
        modules={testModules}
        app={app}
        onClose={() => setTestModules(undefined)}
      />
    </>
  );
}
const Header = React.memo(FlowHeader);

const AppEdit = (props: Props) => {
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
      <Header {...props} />
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

        <TemplateList isOpen={isOpenTemplate} nodes={nodes} onClose={onCloseTemplate} />
      </Box>
    </>
  );
};

const Flow = (data: Props) => {
  return (
    <Box h={'100%'} position={'fixed'} zIndex={999} top={0} left={0} right={0} bottom={0}>
      <ReactFlowProvider>
        <FlowProvider>
          <Flex h={'100%'} flexDirection={'column'} bg={'#fff'}>
            {!!data.app._id && <AppEdit {...data} />}
          </Flex>
        </FlowProvider>
      </ReactFlowProvider>
    </Box>
  );
};

export default React.memo(Flow);
