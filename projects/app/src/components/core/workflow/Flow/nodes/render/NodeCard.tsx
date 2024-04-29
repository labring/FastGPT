import React, { useCallback, useMemo } from 'react';
import { Box, Button, Card, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@/components/Avatar';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';
import { useTranslation } from 'next-i18next';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { ToolTargetHandle } from './Handle/ToolHandle';
import { useEditTextarea } from '@fastgpt/web/hooks/useEditTextarea';
import { ConnectionSourceHandle, ConnectionTargetHandle } from './Handle/ConnectionHandle';
import { useDebug } from '../../hooks/useDebug';
import { ResponseBox } from '@/components/ChatBox/WholeResponseModal';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { getPreviewPluginModule } from '@/web/core/plugin/api';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { storeNode2FlowNode } from '@/web/core/workflow/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../context';

type Props = FlowNodeItemType & {
  children?: React.ReactNode | React.ReactNode[] | string;
  minW?: string | number;
  maxW?: string | number;
  selected?: boolean;
  menuForbid?: {
    debug?: boolean;
    rename?: boolean;
    copy?: boolean;
    delete?: boolean;
  };
};

const NodeCard = (props: Props) => {
  const { t } = useTranslation();
  const {
    children,
    avatar = LOGO_ICON,
    name = t('core.module.template.UnKnow Module'),
    intro,
    minW = '300px',
    maxW = '600px',
    nodeId,
    flowNodeType,
    inputs,
    selected,
    menuForbid,
    isTool = false,
    isError = false,
    debugResult,
    pluginId
  } = props;

  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const setHoverNodeId = useContextSelector(WorkflowContext, (v) => v.setHoverNodeId);
  const onUpdateNodeError = useContextSelector(WorkflowContext, (v) => v.onUpdateNodeError);

  const showToolHandle = useMemo(
    () => isTool && !!nodeList.find((item) => item?.flowNodeType === FlowNodeTypeEnum.tools),
    [isTool, nodeList]
  );

  /* Node header */
  const Header = useMemo(() => {
    return (
      <Box position={'relative'}>
        {/* debug */}
        <NodeDebugResponse nodeId={nodeId} debugResult={debugResult} />
        <Box className="custom-drag-handle" px={4} py={3}>
          {/* tool target handle */}
          {showToolHandle && <ToolTargetHandle nodeId={nodeId} />}

          {/* avatar and name */}
          <Flex alignItems={'center'}>
            <Avatar src={avatar} borderRadius={'0'} objectFit={'contain'} w={'30px'} h={'30px'} />
            <Box ml={3} fontSize={'lg'} fontWeight={'medium'}>
              {t(name)}
            </Box>
          </Flex>
          <MenuRender
            name={name}
            nodeId={nodeId}
            pluginId={pluginId}
            flowNodeType={flowNodeType}
            inputs={inputs}
            menuForbid={menuForbid}
          />
          <NodeIntro nodeId={nodeId} intro={intro} />
        </Box>
      </Box>
    );
  }, [
    nodeId,
    debugResult,
    showToolHandle,
    avatar,
    t,
    name,
    pluginId,
    flowNodeType,
    inputs,
    menuForbid,
    intro
  ]);

  return (
    <Box
      minW={minW}
      maxW={maxW}
      bg={'white'}
      borderWidth={'1px'}
      borderRadius={'md'}
      boxShadow={'1'}
      _hover={{
        boxShadow: '4',
        '& .controller-menu': {
          display: 'flex'
        },
        '& .controller-debug': {
          display: 'block'
        }
      }}
      onMouseEnter={() => setHoverNodeId(nodeId)}
      onMouseLeave={() => setHoverNodeId(undefined)}
      {...(isError
        ? {
            borderColor: 'red.500',
            onMouseDownCapture: () => onUpdateNodeError(nodeId, false)
          }
        : {
            borderColor: selected ? 'primary.600' : 'borderColor.base'
          })}
    >
      {Header}
      {children}
      <ConnectionSourceHandle nodeId={nodeId} />
      <ConnectionTargetHandle nodeId={nodeId} />
    </Box>
  );
};

export default React.memo(NodeCard);

const MenuRender = React.memo(function MenuRender({
  name,
  nodeId,
  pluginId,
  flowNodeType,
  inputs,
  menuForbid
}: {
  name: string;
  nodeId: string;
  pluginId?: string;
  flowNodeType: Props['flowNodeType'];
  inputs: Props['inputs'];
  menuForbid?: Props['menuForbid'];
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { setLoading } = useSystemStore();
  const { openDebugNode, DebugInputModal } = useDebug();

  const { openConfirm: onOpenConfirmSync, ConfirmModal: ConfirmSyncModal } = useConfirm({
    content: t('module.Confirm Sync Plugin')
  });
  // custom title edit
  const { onOpenModal: onOpenCustomTitleModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('common.Custom Title'),
    placeholder: t('app.module.Custom Title Tip') || ''
  });
  const { openConfirm: onOpenConfirmDeleteNode, ConfirmModal: ConfirmDeleteModal } = useConfirm({
    content: t('core.module.Confirm Delete Node'),
    type: 'delete'
  });

  const setNodes = useContextSelector(WorkflowContext, (v) => v.setNodes);
  const onResetNode = useContextSelector(WorkflowContext, (v) => v.onResetNode);
  const setEdges = useContextSelector(WorkflowContext, (v) => v.setEdges);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const onCopyNode = useCallback(
    (nodeId: string) => {
      setNodes((state) => {
        const node = state.find((node) => node.id === nodeId);
        if (!node) return state;
        const template = {
          avatar: node.data.avatar,
          name: node.data.name,
          intro: node.data.intro,
          flowNodeType: node.data.flowNodeType,
          inputs: node.data.inputs,
          outputs: node.data.outputs,
          showStatus: node.data.showStatus
        };
        return state.concat(
          storeNode2FlowNode({
            item: {
              name: template.name,
              intro: template.intro,
              nodeId: getNanoid(),
              position: { x: node.position.x + 200, y: node.position.y + 50 },
              flowNodeType: template.flowNodeType,
              showStatus: template.showStatus,
              inputs: template.inputs,
              outputs: template.outputs
            }
          })
        );
      });
    },
    [setNodes]
  );
  const onDelNode = useCallback(
    (nodeId: string) => {
      setNodes((state) => state.filter((item) => item.data.nodeId !== nodeId));
      setEdges((state) => state.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    },
    [setEdges, setNodes]
  );

  const Render = useMemo(() => {
    const menuList = [
      ...(menuForbid?.debug
        ? []
        : [
            {
              icon: 'core/workflow/debug',
              label: t('core.workflow.Debug'),
              variant: 'whiteBase',
              onClick: () => openDebugNode({ entryNodeId: nodeId })
            }
          ]),
      ...(flowNodeType === FlowNodeTypeEnum.pluginModule
        ? [
            {
              icon: 'common/refreshLight',
              label: t('plugin.Synchronous version'),
              variant: 'whiteBase',
              onClick: () => {
                if (!pluginId) return;
                onOpenConfirmSync(async () => {
                  try {
                    setLoading(true);
                    const pluginModule = await getPreviewPluginModule(pluginId);
                    onResetNode({
                      id: nodeId,
                      module: pluginModule
                    });
                  } catch (e) {
                    return toast({
                      status: 'error',
                      title: getErrText(e, t('plugin.Get Plugin Module Detail Failed'))
                    });
                  }
                  setLoading(false);
                })();
              }
            }
          ]
        : []),
      ...(menuForbid?.rename
        ? []
        : [
            {
              icon: 'edit',
              label: t('common.Rename'),
              variant: 'whiteBase',
              onClick: () =>
                onOpenCustomTitleModal({
                  defaultVal: name,
                  onSuccess: (e) => {
                    if (!e) {
                      return toast({
                        title: t('app.modules.Title is required'),
                        status: 'warning'
                      });
                    }
                    onChangeNode({
                      nodeId,
                      type: 'attr',
                      key: 'name',
                      value: e
                    });
                  }
                })
            }
          ]),
      ...(menuForbid?.copy
        ? []
        : [
            {
              icon: 'copy',
              label: t('common.Copy'),
              variant: 'whiteBase',
              onClick: () => onCopyNode(nodeId)
            }
          ]),
      ...(menuForbid?.delete
        ? []
        : [
            {
              icon: 'delete',
              label: t('common.Delete'),
              variant: 'whiteDanger',
              onClick: onOpenConfirmDeleteNode(() => onDelNode(nodeId))
            }
          ])
    ];

    return (
      <>
        <Box
          className="nodrag controller-menu"
          display={'none'}
          flexDirection={'column'}
          gap={3}
          position={'absolute'}
          top={'-20px'}
          right={0}
          transform={'translateX(90%)'}
          pl={'20px'}
          pr={'10px'}
          pb={'20px'}
          pt={'20px'}
        >
          {menuList.map((item) => (
            <Box key={item.icon}>
              <Button
                size={'xs'}
                variant={item.variant}
                leftIcon={<MyIcon name={item.icon as any} w={'13px'} />}
                onClick={item.onClick}
              >
                {item.label}
              </Button>
            </Box>
          ))}
        </Box>
        <EditTitleModal maxLength={20} />
        <ConfirmSyncModal />
        <ConfirmDeleteModal />
        <DebugInputModal />
      </>
    );
  }, [
    ConfirmDeleteModal,
    ConfirmSyncModal,
    DebugInputModal,
    EditTitleModal,
    flowNodeType,
    menuForbid?.copy,
    menuForbid?.debug,
    menuForbid?.delete,
    menuForbid?.rename,
    name,
    nodeId,
    onChangeNode,
    onCopyNode,
    onDelNode,
    onOpenConfirmDeleteNode,
    onOpenConfirmSync,
    onOpenCustomTitleModal,
    onResetNode,
    openDebugNode,
    pluginId,
    setLoading,
    t,
    toast
  ]);

  return Render;
});

const NodeIntro = React.memo(function NodeIntro({
  nodeId,
  intro = ''
}: {
  nodeId: string;
  intro?: string;
}) {
  const { t } = useTranslation();
  const splitToolInputs = useContextSelector(WorkflowContext, (ctx) => ctx.splitToolInputs);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const moduleIsTool = useMemo(() => {
    const { isTool } = splitToolInputs([], nodeId);
    return isTool;
  }, [nodeId, splitToolInputs]);

  // edit intro
  const { onOpenModal: onOpenIntroModal, EditModal: EditIntroModal } = useEditTextarea({
    title: t('core.module.Edit intro'),
    tip: '调整该模块会对工具调用时机有影响。\n你可以通过精确的描述该模块功能，引导模型进行工具调用。',
    canEmpty: false
  });

  const Render = useMemo(() => {
    return (
      <>
        <Flex alignItems={'flex-end'} py={1}>
          <Box fontSize={'xs'} color={'myGray.600'} flex={'1 0 0'}>
            {t(intro)}
          </Box>
          {moduleIsTool && (
            <Button
              size={'xs'}
              variant={'whiteBase'}
              onClick={() => {
                onOpenIntroModal({
                  defaultVal: intro,
                  onSuccess(e) {
                    onChangeNode({
                      nodeId,
                      type: 'attr',
                      key: 'intro',
                      value: e
                    });
                  }
                });
              }}
            >
              {t('core.module.Edit intro')}
            </Button>
          )}
        </Flex>
        <EditIntroModal maxLength={500} />
      </>
    );
  }, [EditIntroModal, intro, moduleIsTool, nodeId, onChangeNode, onOpenIntroModal, t]);

  return Render;
});

const NodeDebugResponse = React.memo(function NodeDebugResponse({
  nodeId,
  debugResult
}: {
  nodeId: string;
  debugResult: FlowNodeItemType['debugResult'];
}) {
  const { t } = useTranslation();

  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const onStopNodeDebug = useContextSelector(WorkflowContext, (v) => v.onStopNodeDebug);
  const onNextNodeDebug = useContextSelector(WorkflowContext, (v) => v.onNextNodeDebug);
  const workflowDebugData = useContextSelector(WorkflowContext, (v) => v.workflowDebugData);

  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('core.workflow.Confirm stop debug')
  });

  const RenderStatus = useMemo(() => {
    const map = {
      running: {
        bg: 'primary.50',
        text: t('core.workflow.Running'),
        icon: 'core/workflow/running'
      },
      success: {
        bg: 'green.50',
        text: t('core.workflow.Success'),
        icon: 'core/workflow/runSuccess'
      },
      failed: {
        bg: 'red.50',
        text: t('core.workflow.Failed'),
        icon: 'core/workflow/runError'
      },
      skipped: {
        bg: 'myGray.50',
        text: t('core.workflow.Skipped'),
        icon: 'core/workflow/runSkip'
      }
    };

    const statusData = map[debugResult?.status || 'running'];

    const response = debugResult?.response;

    const onStop = () => {
      openConfirm(onStopNodeDebug)();
    };

    return !!debugResult && !!statusData ? (
      <>
        <Flex px={4} bg={statusData.bg} borderTopRadius={'md'} py={3}>
          <MyIcon name={statusData.icon as any} w={'16px'} mr={2} />
          <Box color={'myGray.900'} fontWeight={'bold'} flex={'1 0 0'}>
            {statusData.text}
          </Box>
          {debugResult.status !== 'running' && (
            <Box
              color={'primary.700'}
              cursor={'pointer'}
              fontSize={'sm'}
              onClick={() =>
                onChangeNode({
                  nodeId,
                  type: 'attr',
                  key: 'debugResult',
                  value: {
                    ...debugResult,
                    showResult: !debugResult.showResult
                  }
                })
              }
            >
              {debugResult.showResult
                ? t('core.workflow.debug.Hide result')
                : t('core.workflow.debug.Show result')}
            </Box>
          )}
        </Flex>
        {/* result */}
        {debugResult.showResult && (
          <Card
            className="nowheel"
            position={'absolute'}
            right={'-430px'}
            top={0}
            zIndex={10}
            w={'420px'}
            maxH={'540px'}
            overflowY={'auto'}
            border={'base'}
          >
            {/* Status header */}
            <Flex px={4} mb={1} py={3} alignItems={'center'} borderBottom={'base'}>
              <MyIcon mr={1} name={'core/workflow/debugResult'} w={'20px'} color={'primary.600'} />
              <Box fontWeight={'bold'} flex={'1'}>
                {t('core.workflow.debug.Run result')}
              </Box>
              {workflowDebugData?.nextRunNodes.length !== 0 && (
                <Button
                  size={'sm'}
                  leftIcon={<MyIcon name={'core/chat/stopSpeech'} w={'16px'} />}
                  variant={'whiteDanger'}
                  onClick={onStop}
                >
                  {t('core.workflow.Stop debug')}
                </Button>
              )}
              {(debugResult.status === 'success' || debugResult.status === 'skipped') &&
                !debugResult.isExpired &&
                workflowDebugData?.nextRunNodes &&
                workflowDebugData.nextRunNodes.length > 0 && (
                  <Button
                    ml={2}
                    size={'sm'}
                    leftIcon={<MyIcon name={'core/workflow/debugNext'} w={'16px'} />}
                    variant={'primary'}
                    onClick={() => onNextNodeDebug()}
                  >
                    {t('common.Next Step')}
                  </Button>
                )}
              {workflowDebugData?.nextRunNodes && workflowDebugData?.nextRunNodes.length === 0 && (
                <Button ml={2} size={'sm'} variant={'primary'} onClick={onStopNodeDebug}>
                  {t('core.workflow.debug.Done')}
                </Button>
              )}
            </Flex>
            {/* Show result */}
            <Box maxH={'100%'} overflow={'auto'}>
              {!debugResult.message && !response && (
                <EmptyTip text={t('core.workflow.debug.Not result')} pt={2} pb={5} />
              )}
              {debugResult.message && (
                <Box color={'red.600'} px={3} py={4}>
                  {debugResult.message}
                </Box>
              )}
              {response && <ResponseBox response={[response]} showDetail hideTabs />}
            </Box>
          </Card>
        )}
        <ConfirmModal />
      </>
    ) : null;
  }, [
    ConfirmModal,
    debugResult,
    nodeId,
    onChangeNode,
    onNextNodeDebug,
    onStopNodeDebug,
    openConfirm,
    t,
    workflowDebugData?.nextRunNodes
  ]);

  return <>{RenderStatus}</>;
});
