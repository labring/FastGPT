import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  XYPosition,
  Connection,
  useViewport
} from 'reactflow';
import { Box, Flex, IconButton, useTheme, useDisclosure } from '@chakra-ui/react';
import { SmallCloseIcon } from '@chakra-ui/icons';
import { edgeOptions, connectionLineStyle, FlowModuleTypeEnum } from '@/constants/flow';
import { appModule2FlowNode, appModule2FlowEdge } from '@/utils/adapt';
import {
  FlowModuleItemType,
  FlowOutputTargetItemType,
  type FlowModuleItemChangeProps
} from '@/types/flow';
import { customAlphabet } from 'nanoid';
import { putAppById } from '@/api/app';
import { useRequest } from '@/hooks/useRequest';
import type { AppSchema } from '@/types/mongoSchema';
import dynamic from 'next/dynamic';

import MyIcon from '@/components/Icon';
import ButtonEdge from './components/modules/ButtonEdge';
import MyTooltip from '@/components/MyTooltip';
import TemplateList from './components/TemplateList';
import ChatTest, { type ChatTestComponentRef } from './components/ChatTest';

const NodeChat = dynamic(() => import('./components/NodeChat'), {
  ssr: false
});
const NodeKbSearch = dynamic(() => import('./components/NodeKbSearch'), {
  ssr: false
});
const NodeHistory = dynamic(() => import('./components/NodeHistory'), {
  ssr: false
});
const NodeTFSwitch = dynamic(() => import('./components/NodeTFSwitch'), {
  ssr: false
});
const NodeAnswer = dynamic(() => import('./components/NodeAnswer'), {
  ssr: false
});
const NodeQuestionInput = dynamic(() => import('./components/NodeQuestionInput'), {
  ssr: false
});
const NodeCQNode = dynamic(() => import('./components/NodeCQNode'), {
  ssr: false
});
const NodeUserGuide = dynamic(() => import('./components/NodeUserGuide'), {
  ssr: false
});

import 'reactflow/dist/style.css';
import styles from './index.module.scss';
import { AppModuleItemType, AppModuleTemplateItemType } from '@/types/app';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);

const nodeTypes = {
  [FlowModuleTypeEnum.userGuide]: NodeUserGuide,
  [FlowModuleTypeEnum.questionInputNode]: NodeQuestionInput,
  [FlowModuleTypeEnum.historyNode]: NodeHistory,
  [FlowModuleTypeEnum.chatNode]: NodeChat,
  [FlowModuleTypeEnum.kbSearchNode]: NodeKbSearch,
  [FlowModuleTypeEnum.tfSwitchNode]: NodeTFSwitch,
  [FlowModuleTypeEnum.answerNode]: NodeAnswer,
  [FlowModuleTypeEnum.classifyQuestionNode]: NodeCQNode
};
const edgeTypes = {
  buttonedge: ButtonEdge
};
type Props = { app: AppSchema; onBack: () => void };

const AppEdit = ({ app, onBack }: Props) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const ChatTestRef = useRef<ChatTestComponentRef>(null);
  const theme = useTheme();
  const { x, y, zoom } = useViewport();
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowModuleItemType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const {
    isOpen: isOpenTemplate,
    onOpen: onOpenTemplate,
    onClose: onCloseTemplate
  } = useDisclosure();
  const [testModules, setTestModules] = useState<AppModuleItemType[]>();

  const onChangeNode = useCallback(
    ({ moduleId, key, type = 'inputs', value, valueKey = 'value' }: FlowModuleItemChangeProps) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== moduleId) return node;
          if (type === 'inputs') {
            return {
              ...node,
              data: {
                ...node.data,
                inputs: node.data.inputs.map((item) => {
                  if (item.key === key) {
                    return {
                      ...item,
                      [valueKey]: value
                    };
                  }
                  return item;
                })
              }
            };
          }

          return {
            ...node,
            data: {
              ...node.data,
              outputs: value
            }
          };
        })
      );
    },
    [setNodes]
  );
  const onDelNode = useCallback(
    (nodeId: string) => {
      setNodes((state) => state.filter((item) => item.id !== nodeId));
      setEdges((state) => state.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    },
    [setEdges, setNodes]
  );
  const onAddNode = useCallback(
    ({ template, position }: { template: AppModuleTemplateItemType; position: XYPosition }) => {
      if (!reactFlowWrapper.current) return;
      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const mouseX = (position.x - reactFlowBounds.left - x) / zoom - 100;
      const mouseY = (position.y - reactFlowBounds.top - y) / zoom;

      setNodes((state) =>
        state.concat(
          appModule2FlowNode({
            item: {
              ...template,
              position: { x: mouseX, y: mouseY },
              moduleId: nanoid()
            },
            onChangeNode,
            onDelNode
          })
        )
      );
    },
    [onChangeNode, onDelNode, setNodes, x, y, zoom]
  );
  const flow2Modules = useCallback(() => {
    const modules: AppModuleItemType[] = nodes.map((item) => ({
      ...item.data,
      position: item.position,
      onChangeNode: undefined,
      onDelNode: undefined,
      outputs: item.data.outputs.map((output) => ({
        ...output,
        targets: [] as FlowOutputTargetItemType[]
      }))
    }));

    // update inputs and outputs
    modules.forEach((module) => {
      module.inputs.forEach((input) => {
        input.connected = !!edges.find(
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

  const onDelConnect = useCallback(
    (id: string) => {
      setEdges((state) => state.filter((item) => item.id !== id));
    },
    [setEdges]
  );
  const onConnect = useCallback(
    ({ connect }: { connect: Connection }) => {
      setEdges((state) =>
        addEdge(
          {
            ...connect,
            type: 'buttonedge',
            animated: true,
            data: {
              onDelete: onDelConnect
            }
          },
          state
        )
      );
    },
    [onDelConnect, setEdges]
  );

  const { mutate: onclickSave, isLoading } = useRequest({
    mutationFn: () => {
      return putAppById(app._id, {
        modules: flow2Modules()
      });
    },
    successToast: '保存配置成功',
    errorToast: '保存配置异常',
    onSuccess() {
      ChatTestRef.current?.resetChatTest();
    }
  });

  const initData = useCallback(
    (app: AppSchema) => {
      console.log('init');

      const edges = appModule2FlowEdge({
        modules: app.modules,
        onDelete: onDelConnect
      });
      setEdges(edges);

      setNodes(
        app.modules.map((item) =>
          appModule2FlowNode({
            item,
            onChangeNode,
            onDelNode
          })
        )
      );
    },
    [onDelConnect, setEdges, setNodes, onChangeNode, onDelNode]
  );

  useEffect(() => {
    initData(JSON.parse(JSON.stringify(app)));
  }, [app, initData]);

  return (
    <Flex h={'100%'} flexDirection={'column'} bg={'#fff'}>
      {/* header */}
      <Flex py={3} px={5} borderBottom={theme.borders.base} alignItems={'center'}>
        <IconButton
          size={'sm'}
          icon={<MyIcon name={'back'} w={'14px'} />}
          w={'28px'}
          h={'28px'}
          borderRadius={'md'}
          borderColor={'myGray.300'}
          variant={'base'}
          aria-label={''}
          onClick={onBack}
        />
        <Box ml={5} fontSize={'xl'} flex={1}>
          {app.name}
        </Box>
        {testModules ? (
          <IconButton
            mr={6}
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
              mr={6}
              icon={<MyIcon name={'chatLight'} w={'16px'} />}
              borderRadius={'lg'}
              aria-label={'save'}
              variant={'base'}
              onClick={() => {
                setTestModules(flow2Modules());
              }}
            />
          </MyTooltip>
        )}

        <MyTooltip label={'保存配置'}>
          <IconButton
            icon={<MyIcon name={'save'} w={'16px'} />}
            borderRadius={'lg'}
            isLoading={isLoading}
            aria-label={'save'}
            onClick={onclickSave}
          />
        </MyTooltip>
      </Flex>
      <Box
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
          nodes={nodes}
          edges={edges}
          minZoom={0.4}
          maxZoom={1.5}
          fitView
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
          <Controls
            position={'bottom-center'}
            style={{ display: 'flex' }}
            showInteractive={false}
          />
        </ReactFlow>

        <TemplateList isOpen={isOpenTemplate} onAddNode={onAddNode} onClose={onCloseTemplate} />
        <ChatTest
          ref={ChatTestRef}
          modules={testModules}
          app={app}
          onClose={() => setTestModules(undefined)}
        />
      </Box>
    </Flex>
  );
};

const Flow = (data: Props) => (
  <ReactFlowProvider>
    <AppEdit {...data} />
  </ReactFlowProvider>
);

export default React.memo(Flow);
