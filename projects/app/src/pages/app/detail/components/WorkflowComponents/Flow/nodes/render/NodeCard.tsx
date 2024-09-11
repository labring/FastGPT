import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, Flex, Image } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { useTranslation } from 'next-i18next';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { ToolTargetHandle } from './Handle/ToolHandle';
import { useEditTextarea } from '@fastgpt/web/hooks/useEditTextarea';
import { ConnectionSourceHandle, ConnectionTargetHandle } from './Handle/ConnectionHandle';
import { useDebug } from '../../hooks/useDebug';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { getPreviewPluginNode } from '@/web/core/app/api/plugin';
import { storeNode2FlowNode, getLatestNodeTemplate } from '@/web/core/workflow/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../context';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useWorkflowUtils } from '../../hooks/useUtils';
import { WholeResponseContent } from '@/components/core/chat/components/WholeResponseModal';

type Props = FlowNodeItemType & {
  children?: React.ReactNode | React.ReactNode[] | string;
  minW?: string | number;
  maxW?: string | number;
  selected?: boolean;
  menuForbid?: {
    debug?: boolean;
    copy?: boolean;
    delete?: boolean;
  };
};

const NodeCard = (props: Props) => {
  const { t } = useTranslation();

  const { toast } = useToast();

  const {
    children,
    avatar = LOGO_ICON,
    name = t('common:core.module.template.UnKnow Module'),
    intro,
    minW = '300px',
    maxW = '600px',
    nodeId,
    selected,
    menuForbid,
    isTool = false,
    isError = false,
    debugResult
  } = props;

  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const setHoverNodeId = useContextSelector(WorkflowContext, (v) => v.setHoverNodeId);
  const onUpdateNodeError = useContextSelector(WorkflowContext, (v) => v.onUpdateNodeError);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const onResetNode = useContextSelector(WorkflowContext, (v) => v.onResetNode);

  // custom title edit
  const { onOpenModal: onOpenCustomTitleModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('common:common.Custom Title'),
    placeholder: t('app:module.Custom Title Tip') || ''
  });

  const showToolHandle = useMemo(
    () => isTool && !!nodeList.find((item) => item?.flowNodeType === FlowNodeTypeEnum.tools),
    [isTool, nodeList]
  );

  const node = nodeList.find((node) => node.nodeId === nodeId);
  const { openConfirm: onOpenConfirmSync, ConfirmModal: ConfirmSyncModal } = useConfirm({
    content: t('app:module.Confirm Sync')
  });

  const { data: nodeTemplate, runAsync: getNodeLatestTemplate } = useRequest2(
    async () => {
      if (
        node?.flowNodeType === FlowNodeTypeEnum.pluginModule ||
        node?.flowNodeType === FlowNodeTypeEnum.appModule
      ) {
        if (!node?.pluginId) return;
        const template = await getPreviewPluginNode({ appId: node.pluginId });

        // Focus update plugin latest inputExplanationUrl
        onChangeNode({
          nodeId,
          type: 'attr',
          key: 'inputExplanationUrl',
          value: template.inputExplanationUrl
        });

        return template;
      } else {
        const template = moduleTemplatesFlat.find(
          (item) => item.flowNodeType === node?.flowNodeType
        );
        return template;
      }
    },
    {
      manual: false
    }
  );
  const hasNewVersion = nodeTemplate && nodeTemplate.version !== node?.version;

  const { runAsync: onClickSyncVersion } = useRequest2(
    async () => {
      const template = moduleTemplatesFlat.find((item) => item.flowNodeType === node?.flowNodeType);
      if (!node || !template) return;

      if (
        node?.flowNodeType === FlowNodeTypeEnum.pluginModule ||
        node?.flowNodeType === FlowNodeTypeEnum.appModule
      ) {
        if (!node.pluginId) return;
        onResetNode({
          id: nodeId,
          node: await getPreviewPluginNode({ appId: node.pluginId })
        });
      } else {
        onResetNode({
          id: nodeId,
          node: getLatestNodeTemplate(node, template)
        });
      }
      await getNodeLatestTemplate();
    },
    {
      refreshDeps: [node, nodeId, onResetNode, getNodeLatestTemplate]
    }
  );

  /* Node header */
  const Header = useMemo(() => {
    return (
      <Box position={'relative'}>
        {/* debug */}
        <Box px={4} py={3}>
          {/* tool target handle */}
          {showToolHandle && <ToolTargetHandle nodeId={nodeId} />}

          {/* avatar and name */}
          <Flex alignItems={'center'}>
            <Avatar src={avatar} borderRadius={'sm'} objectFit={'contain'} w={'30px'} h={'30px'} />
            <Box ml={3} fontSize={'md'} fontWeight={'medium'}>
              {t(name as any)}
            </Box>
            <MyIcon
              className="controller-rename"
              display={'none'}
              name={'edit'}
              w={'14px'}
              cursor={'pointer'}
              ml={1}
              color={'myGray.500'}
              _hover={{ color: 'primary.600' }}
              onClick={() => {
                onOpenCustomTitleModal({
                  defaultVal: name,
                  onSuccess: (e) => {
                    if (!e) {
                      return toast({
                        title: t('app:modules.Title is required'),
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
                });
              }}
            />
            <Box flex={1} />
            {hasNewVersion && (
              <MyTooltip label={t('app:app.modules.click to update')}>
                <Button
                  bg={'yellow.50'}
                  color={'yellow.600'}
                  variant={'ghost'}
                  h={8}
                  px={2}
                  rounded={'6px'}
                  fontSize={'xs'}
                  fontWeight={'medium'}
                  cursor={'pointer'}
                  _hover={{ bg: 'yellow.100' }}
                  onClick={onOpenConfirmSync(onClickSyncVersion)}
                >
                  <Box>{t('app:app.modules.has new version')}</Box>
                  <QuestionOutlineIcon ml={1} />
                </Button>
              </MyTooltip>
            )}
            {!!nodeTemplate?.diagram && !hasNewVersion && (
              <MyTooltip
                label={
                  <Image src={nodeTemplate?.diagram} w={'100%'} minH={['auto', '200px']} alt={''} />
                }
              >
                <Box
                  fontSize={'sm'}
                  color={'primary.700'}
                  p={1}
                  rounded={'sm'}
                  cursor={'default'}
                  _hover={{ bg: 'rgba(17, 24, 36, 0.05)' }}
                >
                  {t('common:core.module.Diagram')}
                </Box>
              </MyTooltip>
            )}
          </Flex>
          <MenuRender nodeId={nodeId} menuForbid={menuForbid} />
          <NodeIntro nodeId={nodeId} intro={intro} />
        </Box>
        <ConfirmSyncModal />
      </Box>
    );
  }, [
    showToolHandle,
    nodeId,
    avatar,
    t,
    name,
    menuForbid,
    hasNewVersion,
    onOpenConfirmSync,
    onClickSyncVersion,
    nodeTemplate?.diagram,
    intro,
    ConfirmSyncModal,
    onOpenCustomTitleModal,
    onChangeNode,
    toast
  ]);
  const RenderHandle = useMemo(() => {
    return (
      <>
        <ConnectionSourceHandle nodeId={nodeId} />
        <ConnectionTargetHandle nodeId={nodeId} />
      </>
    );
  }, [nodeId]);

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
        },
        '& .controller-rename': {
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
      <NodeDebugResponse nodeId={nodeId} debugResult={debugResult} />
      {Header}
      {children}
      {RenderHandle}

      <EditTitleModal maxLength={20} />
    </Box>
  );
};

export default React.memo(NodeCard);

const MenuRender = React.memo(function MenuRender({
  nodeId,
  menuForbid
}: {
  nodeId: string;
  menuForbid?: Props['menuForbid'];
}) {
  const { t } = useTranslation();
  const { openDebugNode, DebugInputModal } = useDebug();

  const setNodes = useContextSelector(WorkflowContext, (v) => v.setNodes);
  const setEdges = useContextSelector(WorkflowContext, (v) => v.setEdges);
  const { computedNewNodeName } = useWorkflowUtils();

  const onCopyNode = useCallback(
    (nodeId: string) => {
      setNodes((state) => {
        const node = state.find((node) => node.id === nodeId);
        if (!node) return state;
        const template = {
          avatar: node.data.avatar,
          name: computedNewNodeName({
            templateName: node.data.name,
            flowNodeType: node.data.flowNodeType,
            pluginId: node.data.pluginId
          }),
          intro: node.data.intro,
          flowNodeType: node.data.flowNodeType,
          inputs: node.data.inputs,
          outputs: node.data.outputs,
          showStatus: node.data.showStatus,
          pluginId: node.data.pluginId,
          version: node.data.version
        };
        return state.concat(
          storeNode2FlowNode({
            item: {
              flowNodeType: template.flowNodeType,
              avatar: template.avatar,
              name: template.name,
              intro: template.intro,
              nodeId: getNanoid(),
              position: { x: node.position.x + 200, y: node.position.y + 50 },
              showStatus: template.showStatus,
              pluginId: template.pluginId,
              inputs: template.inputs,
              outputs: template.outputs,
              version: template.version
            },
            selected: true,
            t
          })
        );
      });
    },
    [computedNewNodeName, setNodes, t]
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
              label: t('common:core.workflow.Debug'),
              variant: 'whiteBase',
              onClick: () => openDebugNode({ entryNodeId: nodeId })
            }
          ]),
      ...(menuForbid?.copy
        ? []
        : [
            {
              icon: 'copy',
              label: t('common:common.Copy'),
              variant: 'whiteBase',
              onClick: () => onCopyNode(nodeId)
            }
          ]),
      ...(menuForbid?.delete
        ? []
        : [
            {
              icon: 'delete',
              label: t('common:common.Delete'),
              variant: 'whiteDanger',
              onClick: () => onDelNode(nodeId)
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
                {t(item.label as any)}
              </Button>
            </Box>
          ))}
        </Box>
        <DebugInputModal />
      </>
    );
  }, [
    menuForbid?.debug,
    menuForbid?.copy,
    menuForbid?.delete,
    t,
    DebugInputModal,
    openDebugNode,
    nodeId,
    onCopyNode,
    onDelNode
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

  const NodeIsTool = useMemo(() => {
    const { isTool } = splitToolInputs([], nodeId);
    return isTool;
  }, [nodeId, splitToolInputs]);

  // edit intro
  const { onOpenModal: onOpenIntroModal, EditModal: EditIntroModal } = useEditTextarea({
    title: t('common:core.module.Edit intro'),
    tip: t('common:info.node_info'),
    canEmpty: false
  });

  const Render = useMemo(() => {
    return (
      <>
        <Flex alignItems={'flex-end'} py={1}>
          <Box fontSize={'xs'} color={'myGray.600'} flex={'1 0 0'}>
            {t(intro as any)}
          </Box>
          {NodeIsTool && (
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
              {t('common:core.module.Edit intro')}
            </Button>
          )}
        </Flex>
        <EditIntroModal maxLength={500} />
      </>
    );
  }, [EditIntroModal, intro, NodeIsTool, nodeId, onChangeNode, onOpenIntroModal, t]);

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
    content: t('common:core.workflow.Confirm stop debug')
  });

  const RenderStatus = useMemo(() => {
    const map = {
      running: {
        bg: 'primary.50',
        text: t('common:core.workflow.Running'),
        icon: 'core/workflow/running'
      },
      success: {
        bg: 'green.50',
        text: t('common:core.workflow.Success'),
        icon: 'core/workflow/runSuccess'
      },
      failed: {
        bg: 'red.50',
        text: t('common:core.workflow.Failed'),
        icon: 'core/workflow/runError'
      },
      skipped: {
        bg: 'myGray.50',
        text: t('common:core.workflow.Skipped'),
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
                ? t('common:core.workflow.debug.Hide result')
                : t('common:core.workflow.debug.Show result')}
            </Box>
          )}
        </Flex>
        {/* Result card */}
        {debugResult.showResult && (
          <Card
            className="nowheel"
            position={'absolute'}
            right={'-430px'}
            top={0}
            zIndex={10}
            w={'420px'}
            maxH={'max(100%,500px)'}
            border={'base'}
          >
            {/* Status header */}
            <Flex h={'54x'} px={4} py={3} alignItems={'center'}>
              <MyIcon mr={1} name={'core/workflow/debugResult'} w={'20px'} color={'primary.600'} />
              <Box fontWeight={'bold'} flex={'1'}>
                {t('common:core.workflow.debug.Run result')}
              </Box>
              {workflowDebugData?.nextRunNodes.length !== 0 && (
                <Button
                  size={'sm'}
                  leftIcon={<MyIcon name={'core/chat/stopSpeech'} w={'16px'} />}
                  variant={'whiteDanger'}
                  onClick={onStop}
                >
                  {t('common:core.workflow.Stop debug')}
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
                    {t('common:common.Next Step')}
                  </Button>
                )}
              {workflowDebugData?.nextRunNodes && workflowDebugData?.nextRunNodes.length === 0 && (
                <Button ml={2} size={'sm'} variant={'primary'} onClick={onStopNodeDebug}>
                  {t('common:core.workflow.debug.Done')}
                </Button>
              )}
            </Flex>
            {/* Response list */}
            {debugResult.status !== 'skipped' && (
              <Box borderTop={'base'} mt={1} overflowY={'auto'} minH={'250px'}>
                {!debugResult.message && !response && (
                  <EmptyTip text={t('common:core.workflow.debug.Not result')} pt={2} pb={5} />
                )}
                {debugResult.message && (
                  <Box color={'red.600'} px={3} py={4}>
                    {debugResult.message}
                  </Box>
                )}
                {response && <WholeResponseContent activeModule={response} showDetail />}
              </Box>
            )}
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
