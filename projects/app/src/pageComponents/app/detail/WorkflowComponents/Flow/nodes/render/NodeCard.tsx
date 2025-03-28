import React, { useCallback, useMemo } from 'react';
import { Box, Button, Card, Flex, type FlexProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { useTranslation } from 'next-i18next';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { ToolSourceHandle, ToolTargetHandle } from './Handle/ToolHandle';
import { useEditTextarea } from '@fastgpt/web/hooks/useEditTextarea';
import { ConnectionSourceHandle, ConnectionTargetHandle } from './Handle/ConnectionHandle';
import { useDebug } from '../../hooks/useDebug';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { getPreviewPluginNode } from '@/web/core/app/api/plugin';
import { storeNode2FlowNode } from '@/web/core/workflow/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../context';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useWorkflowUtils } from '../../hooks/useUtils';
import { WorkflowNodeEdgeContext } from '../../../context/workflowInitContext';
import { WorkflowEventContext } from '../../../context/workflowEventContext';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import UseGuideModal from '@/components/common/Modal/UseGuideModal';
import NodeDebugResponse from './RenderDebug/NodeDebugResponse';

type Props = FlowNodeItemType & {
  children?: React.ReactNode | React.ReactNode[] | string;
  minW?: string | number;
  maxW?: string | number;
  minH?: string | number;
  w?: string | number;
  h?: string | number;
  selected?: boolean;
  menuForbid?: {
    debug?: boolean;
    copy?: boolean;
    delete?: boolean;
  };
  customStyle?: FlexProps;
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
    maxW = '666px',
    minH = 0,
    w = 'full',
    h = 'full',
    nodeId,
    flowNodeType,
    selected,
    menuForbid,
    isTool = false,
    isError = false,
    debugResult,
    isFolded,
    customStyle
  } = props;
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const onUpdateNodeError = useContextSelector(WorkflowContext, (v) => v.onUpdateNodeError);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const onResetNode = useContextSelector(WorkflowContext, (v) => v.onResetNode);
  const setHoverNodeId = useContextSelector(WorkflowEventContext, (v) => v.setHoverNodeId);

  // custom title edit
  const { onOpenModal: onOpenCustomTitleModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('common:common.Custom Title'),
    placeholder: t('app:module.Custom Title Tip') || ''
  });

  const showToolHandle = useMemo(
    () => isTool && !!nodeList.find((item) => item?.flowNodeType === FlowNodeTypeEnum.tools),
    [isTool, nodeList]
  );

  // Current node and parent node
  const { node, parentNode } = useMemo(() => {
    const node = nodeList.find((node) => node.nodeId === nodeId);
    const parentNode = node?.parentNodeId
      ? nodeList.find((n) => n.nodeId === node?.parentNodeId)
      : undefined;

    return { node, parentNode };
  }, [nodeList, nodeId]);

  const { data: nodeTemplate } = useRequest2(
    async () => {
      if (node?.pluginData?.error) {
        return undefined;
      }

      if (
        node?.flowNodeType === FlowNodeTypeEnum.pluginModule ||
        node?.flowNodeType === FlowNodeTypeEnum.appModule
      ) {
        return { ...node, ...node.pluginData };
      } else {
        const template = moduleTemplatesFlat.find(
          (item) => item.flowNodeType === node?.flowNodeType
        );
        return template;
      }
    },
    {
      onSuccess(res) {
        if (!res) return;
        // Execute forcibly updates the courseUrl field
        onChangeNode({
          nodeId,
          type: 'attr',
          key: 'courseUrl',
          value: res?.courseUrl
        });
      },
      manual: false
    }
  );

  const {
    openConfirm: onOpenConfirmSync,
    onClose: onCloseConfirmSync,
    ConfirmModal: ConfirmSyncModal
  } = useConfirm({
    content: t('workflow:Confirm_sync_node')
  });

  const hasNewVersion = nodeTemplate && nodeTemplate.version !== node?.version;

  const { runAsync: onClickSyncVersion } = useRequest2(
    async () => {
      if (!node) return;

      if (node.pluginId) {
        const template = await getPreviewPluginNode({ appId: node.pluginId });

        if (!!template) {
          onResetNode({
            id: nodeId,
            node: template
          });
        }
      } else {
        const template = moduleTemplatesFlat.find(
          (item) => item.flowNodeType === node.flowNodeType
        );
        if (!template) {
          return toast({
            title: t('app:app.modules.not_found_tips'),
            status: 'warning'
          });
        }
        onResetNode({
          id: nodeId,
          node: template
        });
      }
    },
    {
      refreshDeps: [node, nodeId, onResetNode],
      onFinally() {}
    }
  );

  /* Node header */
  const Header = useMemo(() => {
    const showHeader = node?.flowNodeType !== FlowNodeTypeEnum.comment;

    return (
      <Box position={'relative'}>
        {/* debug */}
        {showHeader && (
          <Box px={3} pt={4}>
            {/* tool target handle */}
            <ToolTargetHandle show={showToolHandle} nodeId={nodeId} />

            {/* avatar and name */}
            <Flex alignItems={'center'} mb={1}>
              {node?.flowNodeType !== FlowNodeTypeEnum.stopTool && (
                <Flex
                  alignItems={'center'}
                  mr={1}
                  p={1}
                  cursor={'pointer'}
                  rounded={'sm'}
                  _hover={{ bg: 'myGray.200' }}
                  onClick={() => {
                    onChangeNode({
                      nodeId,
                      type: 'attr',
                      key: 'isFolded',
                      value: !isFolded
                    });
                  }}
                >
                  <MyIcon
                    name={!isFolded ? 'core/chat/chevronDown' : 'core/chat/chevronRight'}
                    w={'16px'}
                    h={'16px'}
                    color={'myGray.500'}
                  />
                </Flex>
              )}
              <Avatar
                src={avatar}
                borderRadius={'sm'}
                objectFit={'contain'}
                w={'24px'}
                h={'24px'}
              />
              <Box ml={2} fontSize={'18px'} fontWeight={'medium'} color={'myGray.900'}>
                {t(name as any)}
              </Box>
              <Button
                display={'none'}
                variant={'grayGhost'}
                size={'xs'}
                ml={0.5}
                className="controller-rename"
                cursor={'pointer'}
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
              >
                <MyIcon name={'edit'} w={'14px'} />
              </Button>
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
                    <MyIcon name={'help'} w={'14px'} ml={1} />
                  </Button>
                </MyTooltip>
              )}
              {!!nodeTemplate?.diagram && !hasNewVersion && (
                <MyTooltip
                  label={
                    <MyImage
                      src={nodeTemplate?.diagram}
                      w={'100%'}
                      minH={['auto', '200px']}
                      alt={''}
                    />
                  }
                >
                  <Button variant={'grayGhost'} size={'xs'} color={'primary.600'} px={1}>
                    {t('common:core.module.Diagram')}
                  </Button>
                </MyTooltip>
              )}
              {!!nodeTemplate?.diagram && node?.courseUrl && (
                <Box bg={'myGray.300'} w={'1px'} h={'12px'} ml={1} mr={0.5} />
              )}
              {!!(node?.courseUrl || nodeTemplate?.userGuide) && !hasNewVersion && (
                <UseGuideModal
                  title={nodeTemplate?.name}
                  iconSrc={nodeTemplate?.avatar}
                  text={nodeTemplate?.userGuide}
                  link={nodeTemplate?.courseUrl}
                >
                  {({ onClick }) => (
                    <MyTooltip label={t('workflow:Node.Open_Node_Course')}>
                      <MyIconButton ml={1} icon="book" color={'primary.600'} onClick={onClick} />
                    </MyTooltip>
                  )}
                </UseGuideModal>
              )}
              {!!node?.pluginData?.error && (
                <MyTooltip label={t('app:app.modules.not_found_tips')}>
                  <Flex
                    bg={'red.50'}
                    alignItems={'center'}
                    h={8}
                    px={2}
                    rounded={'6px'}
                    fontSize={'xs'}
                    fontWeight={'medium'}
                  >
                    <MyIcon name={'common/errorFill'} w={'14px'} mr={1} />
                    <Box color={'red.600'}>{t('app:app.modules.not_found')}</Box>
                  </Flex>
                </MyTooltip>
              )}
            </Flex>
            <NodeIntro nodeId={nodeId} intro={intro} />
          </Box>
        )}
        <MenuRender nodeId={nodeId} menuForbid={menuForbid} nodeList={nodeList} />
      </Box>
    );
  }, [
    node?.flowNodeType,
    node?.courseUrl,
    node?.pluginData?.error,
    showToolHandle,
    nodeId,
    isFolded,
    avatar,
    t,
    name,
    hasNewVersion,
    onOpenConfirmSync,
    onClickSyncVersion,
    nodeTemplate?.diagram,
    nodeTemplate?.userGuide,
    nodeTemplate?.name,
    nodeTemplate?.avatar,
    nodeTemplate?.courseUrl,
    intro,
    menuForbid,
    nodeList,
    onChangeNode,
    onOpenCustomTitleModal,
    toast
  ]);

  const RenderHandle = useMemo(() => {
    return (
      <>
        <ConnectionSourceHandle nodeId={nodeId} isFoldNode={isFolded} />
        <ConnectionTargetHandle nodeId={nodeId} />
      </>
    );
  }, [nodeId, isFolded]);
  const RenderToolHandle = useMemo(
    () => (node?.flowNodeType === FlowNodeTypeEnum.tools ? <ToolSourceHandle /> : null),
    [node?.flowNodeType]
  );

  return (
    <Flex
      hidden={parentNode?.isFolded}
      flexDirection={'column'}
      minW={minW}
      maxW={maxW}
      minH={minH}
      bg={'white'}
      outline={selected ? '2px solid' : '1px solid'}
      borderRadius={'lg'}
      boxShadow={
        '0px 4px 10px 0px rgba(19, 51, 107, 0.10), 0px 0px 1px 0px rgba(19, 51, 107, 0.10)'
      }
      w={w}
      h={h}
      _hover={{
        boxShadow:
          '0px 12px 16px -4px rgba(19, 51, 107, 0.20), 0px 0px 1px 0px rgba(19, 51, 107, 0.20)',
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
            outlineColor: 'red.500',
            onMouseDownCapture: () => onUpdateNodeError(nodeId, false)
          }
        : {
            outlineColor: selected ? 'primary.600' : 'myGray.250'
          })}
      {...customStyle}
    >
      <NodeDebugResponse nodeId={nodeId} debugResult={debugResult} />
      {Header}
      <Flex flexDirection={'column'} flex={1} my={!isFolded ? 3 : 0} gap={2}>
        {!isFolded ? children : <Box h={4} />}
      </Flex>
      {RenderHandle}
      {RenderToolHandle}

      <ConfirmSyncModal />
      <EditTitleModal maxLength={100} />
    </Flex>
  );
};

export default React.memo(NodeCard);

const MenuRender = React.memo(function MenuRender({
  nodeId,
  menuForbid,
  nodeList
}: {
  nodeId: string;
  menuForbid?: Props['menuForbid'];
  nodeList: FlowNodeItemType[];
}) {
  const { t } = useTranslation();
  const { openDebugNode, DebugInputModal } = useDebug();

  const setNodes = useContextSelector(WorkflowNodeEdgeContext, (v) => v.setNodes);
  const setEdges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.setEdges);
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

        return [
          ...state.map((item) => ({
            ...item,
            selected: false
          })),
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
            parentNodeId: undefined,
            t
          })
        ];
      });
    },
    [computedNewNodeName, setNodes, t]
  );
  const onDelNode = useCallback(
    (nodeId: string) => {
      // Remove node and its child nodes
      setNodes((state) =>
        state.filter((item) => item.data.nodeId !== nodeId && item.data.parentNodeId !== nodeId)
      );

      // Remove edges connected to the node and its child nodes
      const childNodeIds = nodeList
        .filter((node) => node.parentNodeId === nodeId)
        .map((node) => node.nodeId);
      setEdges((state) =>
        state.filter(
          (edge) =>
            edge.source !== nodeId &&
            edge.target !== nodeId &&
            !childNodeIds.includes(edge.target) &&
            !childNodeIds.includes(edge.source)
        )
      );
    },
    [nodeList, setEdges, setNodes]
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
          gap={2}
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
            <Button
              key={item.icon}
              h={8}
              fontSize={'sm'}
              pl={2}
              pr={6}
              variant={item.variant}
              leftIcon={<MyIcon name={item.icon as any} w={'16px'} mr={-1} />}
              onClick={item.onClick}
            >
              {t(item.label as any)}
            </Button>
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
        <Flex alignItems={'center'}>
          <Box fontSize={'sm'} color={'myGray.500'} flex={'1 0 0'}>
            {t(intro as any) || t('app:node_not_intro')}
          </Box>
          {NodeIsTool && (
            <Flex
              p={'7px'}
              rounded={'sm'}
              alignItems={'center'}
              _hover={{
                bg: 'myGray.100'
              }}
              cursor={'pointer'}
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
              <MyIcon name={'edit'} w={'18px'} />
            </Flex>
          )}
        </Flex>
        <EditIntroModal maxLength={500} />
      </>
    );
  }, [EditIntroModal, intro, NodeIsTool, nodeId, onChangeNode, onOpenIntroModal, t]);

  return Render;
});
