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
import {
  edgeOptions,
  connectionLineStyle,
  FlowModuleTypeEnum,
  FlowInputItemTypeEnum,
  FlowValueTypeEnum
} from '@/constants/flow';
import { appModule2FlowNode, appModule2FlowEdge } from '@/utils/adapt';
import {
  FlowModuleItemType,
  FlowModuleTemplateType,
  FlowOutputTargetItemType,
  type FlowModuleItemChangeProps
} from '@/types/flow';
import { AppModuleItemType } from '@/types/app';
import { customAlphabet } from 'nanoid';
import { useRequest } from '@/hooks/useRequest';
import type { AppSchema } from '@/types/mongoSchema';
import { useUserStore } from '@/store/user';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useCopyData } from '@/hooks/useCopyData';
import dynamic from 'next/dynamic';

import MyIcon from '@/components/Icon';
import ButtonEdge from './components/modules/ButtonEdge';
import MyTooltip from '@/components/MyTooltip';
import TemplateList from './components/TemplateList';
import ChatTest, { type ChatTestComponentRef } from './components/ChatTest';

const ImportSettings = dynamic(() => import('./components/ImportSettings'), {
  ssr: false
});
const NodeChat = dynamic(() => import('./components/Nodes/NodeChat'), {
  ssr: false
});
const NodeKbSearch = dynamic(() => import('./components/Nodes/NodeKbSearch'), {
  ssr: false
});
const NodeHistory = dynamic(() => import('./components/Nodes/NodeHistory'), {
  ssr: false
});
const NodeTFSwitch = dynamic(() => import('./components/Nodes/NodeTFSwitch'), {
  ssr: false
});
const NodeAnswer = dynamic(() => import('./components/Nodes/NodeAnswer'), {
  ssr: false
});
const NodeQuestionInput = dynamic(() => import('./components/Nodes/NodeQuestionInput'), {
  ssr: false
});
const NodeCQNode = dynamic(() => import('./components/Nodes/NodeCQNode'), {
  ssr: false
});
const NodeVariable = dynamic(() => import('./components/Nodes/NodeVariable'), {
  ssr: false
});
const NodeUserGuide = dynamic(() => import('./components/Nodes/NodeUserGuide'), {
  ssr: false
});
const NodeExtract = dynamic(() => import('./components/Nodes/NodeExtract'), {
  ssr: false
});
const NodeHttp = dynamic(() => import('./components/Nodes/NodeHttp'), {
  ssr: false
});

import 'reactflow/dist/style.css';
import styles from './index.module.scss';
import { AppTypeEnum } from '@/constants/app';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);

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

const AppEdit = ({ app, onCloseSettings }: Props) => {
  const theme = useTheme();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { copyData } = useCopyData();

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const ChatTestRef = useRef<ChatTestComponentRef>(null);

  const { updateAppDetail } = useUserStore();
  const { x, y, zoom } = useViewport();
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowModuleItemType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const {
    isOpen: isOpenTemplate,
    onOpen: onOpenTemplate,
    onClose: onCloseTemplate
  } = useDisclosure();
  const { isOpen: isOpenImport, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();

  const [testModules, setTestModules] = useState<AppModuleItemType[]>();

  const onFixView = useCallback(() => {
    const btn = document.querySelector('.react-flow__controls-fitview') as HTMLButtonElement;

    setTimeout(() => {
      btn && btn.click();
    }, 100);
  }, []);

  const onAddNode = useCallback(
    ({ template, position }: { template: FlowModuleTemplateType; position: XYPosition }) => {
      if (!reactFlowWrapper.current) return;
      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const mouseX = (position.x - reactFlowBounds.left - x) / zoom - 100;
      const mouseY = (position.y - reactFlowBounds.top - y) / zoom;

      setNodes((state) =>
        state.concat(
          appModule2FlowNode({
            item: {
              ...template,
              moduleId: nanoid(),
              position: { x: mouseX, y: mouseY }
            },
            onChangeNode,
            onDelNode,
            onDelEdge,
            onCopyNode,
            onCollectionNode
          })
        )
      );
    },
    [x, zoom, y]
  );
  const onDelNode = useCallback(
    (nodeId: string) => {
      setNodes((state) => state.filter((item) => item.id !== nodeId));
      setEdges((state) => state.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    },
    [setEdges, setNodes]
  );
  const onDelEdge = useCallback(
    ({
      moduleId,
      sourceHandle,
      targetHandle
    }: {
      moduleId: string;
      sourceHandle?: string;
      targetHandle?: string;
    }) => {
      if (!sourceHandle && !targetHandle) return;
      setEdges((state) =>
        state.filter((edge) => {
          if (edge.source === moduleId && edge.sourceHandle === sourceHandle) return false;
          if (edge.target === moduleId && edge.targetHandle === targetHandle) return false;

          return true;
        })
      );
    },
    [setEdges]
  );
  const onCopyNode = useCallback(
    (nodeId: string) => {
      setNodes((nodes) => {
        const node = nodes.find((node) => node.id === nodeId);
        if (!node) return nodes;
        const template = {
          logo: node.data.logo,
          name: node.data.name,
          intro: node.data.intro,
          description: node.data.description,
          flowType: node.data.flowType,
          inputs: node.data.inputs,
          outputs: node.data.outputs,
          showStatus: node.data.showStatus
        };
        return nodes.concat(
          appModule2FlowNode({
            item: {
              ...template,
              moduleId: nanoid(),
              position: { x: node.position.x + 200, y: node.position.y + 50 }
            },
            onChangeNode,
            onDelNode,
            onDelEdge,
            onCopyNode,
            onCollectionNode
          })
        );
      });
    },
    [setNodes]
  );
  const onCollectionNode = useCallback(
    (nodeId: string) => {
      console.log(nodes.find((node) => node.id === nodeId));
    },
    [nodes]
  );

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
  const onChangeNode = useCallback(
    ({ moduleId, key, type = 'inputs', value }: FlowModuleItemChangeProps) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== moduleId) return node;

          const updateObj: Record<string, any> = {};

          if (type === 'inputs') {
            updateObj.inputs = node.data.inputs.map((item) => (item.key === key ? value : item));
          } else if (type === 'addInput') {
            const input = node.data.inputs.find((input) => input.key === value.key);
            if (input) {
              toast({
                status: 'warning',
                title: 'key 重复'
              });
              updateObj.inputs = node.data.inputs;
            } else {
              updateObj.inputs = node.data.inputs.concat(value);
            }
          } else if (type === 'delInput') {
            onDelEdge({ moduleId, targetHandle: key });
            updateObj.inputs = node.data.inputs.filter((item) => item.key !== key);
          } else if (type === 'attr') {
            updateObj[key] = value;
          } else if (type === 'outputs') {
            // del output connect
            const delOutputs = node.data.outputs.filter(
              (item) => !value.find((output: FlowOutputTargetItemType) => output.key === item.key)
            );
            delOutputs.forEach((output) => {
              onDelEdge({ moduleId, sourceHandle: output.key });
            });
            updateObj.outputs = value;
          }

          return {
            ...node,
            data: {
              ...node.data,
              ...updateObj
            }
          };
        })
      );
    },
    []
  );

  const onDelConnect = useCallback((id: string) => {
    setEdges((state) => state.filter((item) => item.id !== id));
  }, []);
  const onConnect = useCallback(
    ({ connect }: { connect: Connection }) => {
      const source = nodes.find((node) => node.id === connect.source)?.data;
      const sourceType = (() => {
        if (source?.flowType === FlowModuleTypeEnum.classifyQuestion) {
          return FlowValueTypeEnum.boolean;
        }
        return source?.outputs.find((output) => output.key === connect.sourceHandle)?.valueType;
      })();

      const targetType = nodes
        .find((node) => node.id === connect.target)
        ?.data?.inputs.find((input) => input.key === connect.targetHandle)?.valueType;

      if (!sourceType || !targetType) {
        return toast({
          status: 'warning',
          title: t('app.Connection is invalid')
        });
      }
      if (
        sourceType !== FlowValueTypeEnum.any &&
        targetType !== FlowValueTypeEnum.any &&
        sourceType !== targetType
      ) {
        return toast({
          status: 'warning',
          title: t('app.Connection type is different')
        });
      }

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
    [nodes]
  );

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

  const initData = useCallback(
    (modules: AppModuleItemType[]) => {
      const edges = appModule2FlowEdge({
        modules,
        onDelete: onDelConnect
      });
      setEdges(edges);

      setNodes(
        modules.map((item) =>
          appModule2FlowNode({
            item,
            onChangeNode,
            onDelNode,
            onDelEdge,
            onCopyNode,
            onCollectionNode
          })
        )
      );

      onFixView();
    },
    [
      onDelConnect,
      setEdges,
      setNodes,
      onFixView,
      onChangeNode,
      onDelNode,
      onDelEdge,
      onCopyNode,
      onCollectionNode
    ]
  );

  useEffect(() => {
    initData(JSON.parse(JSON.stringify(app.modules)));
  }, [app.modules]);

  return (
    <>
      {/* header */}
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

        <TemplateList
          isOpen={isOpenTemplate}
          nodes={nodes}
          onAddNode={onAddNode}
          onClose={onCloseTemplate}
        />
        <ChatTest
          ref={ChatTestRef}
          modules={testModules}
          app={app}
          onClose={() => setTestModules(undefined)}
        />
      </Box>
      {isOpenImport && (
        <ImportSettings
          onClose={onCloseImport}
          onSuccess={(data) => {
            setEdges([]);
            setNodes([]);
            setTimeout(() => {
              initData(data);
            }, 10);
          }}
        />
      )}
    </>
  );
};

const Flow = (data: Props) => (
  <Box h={'100%'} position={'fixed'} zIndex={999} top={0} left={0} right={0} bottom={0}>
    <ReactFlowProvider>
      <Flex h={'100%'} flexDirection={'column'} bg={'#fff'}>
        {!!data.app._id && <AppEdit {...data} />}
      </Flex>
    </ReactFlowProvider>
  </Box>
);

export default React.memo(Flow);
