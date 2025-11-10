import React, { useCallback, useMemo } from 'react';
import { Box, Button, Flex, useDisclosure, type FlexProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type {
  FlowNodeItemType,
  StoreNodeItemType
} from '@fastgpt/global/core/workflow/type/node.d';
import { useTranslation } from 'next-i18next';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  AppNodeFlowNodeTypeMap,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { ToolSourceHandle, ToolTargetHandle } from './Handle/ToolHandle';
import { useEditTextarea } from '@fastgpt/web/hooks/useEditTextarea';
import { ConnectionSourceHandle, ConnectionTargetHandle } from './Handle/ConnectionHandle';
import { useDebug } from '../../hooks/useDebug';
import { getToolPreviewNode, getToolVersionList } from '@/web/core/app/api/tool';
import { storeNode2FlowNode } from '@/web/core/workflow/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useContextSelector } from 'use-context-selector';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useWorkflowUtils } from '../../hooks/useUtils';
import { WorkflowBufferDataContext } from '../../../context/workflowInitContext';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import UseGuideModal from '@/components/common/Modal/UseGuideModal';
import NodeDebugResponse from './RenderDebug/NodeDebugResponse';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useBoolean, useCreation } from 'ahooks';
import { formatToolError } from '@fastgpt/global/core/app/utils';
import HighlightText from '@fastgpt/web/components/common/String/HighlightText';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import SecretInputModal from '@/pageComponents/app/tool/SecretInputModal';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { WorkflowUtilsContext } from '../../../context/workflowUtilsContext';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import { WorkflowUIContext } from '../../../context/workflowUIContext';
import {
  PluginStatusEnum,
  PluginStatusMap,
  type PluginStatusType
} from '@fastgpt/global/core/plugin/type';

type Props = FlowNodeItemType & {
  children?: React.ReactNode | React.ReactNode[] | string;
  minW?: string | number;
  maxW?: string | number;
  minH?: string | number;
  w?: string | number;
  h?: string | number;
  selected?: boolean;
  searchedText?: string;
  menuForbid?: {
    copilot?: boolean;
    debug?: boolean;
    copy?: boolean;
    delete?: boolean;
  };
  customStyle?: FlexProps;
  rtDoms?: React.ReactNode[];
};

const NodeCard = (props: Props) => {
  const { t } = useTranslation();
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
    selected,
    searchedText,
    menuForbid,
    isTool = false,
    isError = false,
    debugResult,
    isFolded,
    customStyle,
    inputs,
    rtDoms
  } = props;

  const { hasToolNode, getNodeById, foldedNodesMap } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );
  const onUpdateNodeError = useContextSelector(WorkflowActionsContext, (v) => v.onUpdateNodeError);
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const setHoverNodeId = useContextSelector(WorkflowUIContext, (v) => v.setHoverNodeId);

  const inputConfig = useMemo(
    () => inputs?.find((item) => item.key === NodeInputKeyEnum.systemInputConfig),
    [inputs]
  );

  const showToolHandle = isTool && hasToolNode;

  // Current node and parent node
  const { node, hidden } = useMemo(() => {
    const node = getNodeById(nodeId);
    const hidden = node?.parentNodeId ? foldedNodesMap[node.parentNodeId] : false;

    return { node, hidden };
  }, [foldedNodesMap, getNodeById, nodeId]);

  const isAppNode = node && AppNodeFlowNodeTypeMap[node?.flowNodeType];
  const showVersion = useMemo(() => {
    // 1. MCP tool & HTTP tool set do not have version
    if (
      isAppNode &&
      (node.toolConfig?.mcpToolSet || node.toolConfig?.mcpTool || node?.toolConfig?.httpToolSet)
    )
      return false;
    // 2. Team app/System commercial plugin
    if (isAppNode && node?.pluginId && !node?.pluginData?.error) return true;
    // 3. System tool
    if (isAppNode && node?.toolConfig?.systemTool) return true;

    return false;
  }, [isAppNode, node]);

  const { data: nodeTemplate } = useRequest2(
    async () => {
      if (node?.pluginData?.error) {
        return undefined;
      }

      if (isAppNode) {
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

  /* Node header - 重构后的版本,依赖项大幅减少 */
  const error = useMemo(() => formatToolError(node?.pluginData?.error), [node?.pluginData?.error]);
  const showHeader = node?.flowNodeType !== FlowNodeTypeEnum.comment;

  const RenderToolHandle = useMemo(
    () =>
      node?.flowNodeType === FlowNodeTypeEnum.agent ? <ToolSourceHandle nodeId={nodeId} /> : null,
    [node?.flowNodeType, nodeId]
  );

  return (
    <Flex
      hidden={hidden}
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
      {debugResult && <NodeDebugResponse nodeId={nodeId} debugResult={debugResult} />}
      {/* Header */}
      <Box position={'relative'}>
        {showHeader && (
          <Box px={3} pt={4}>
            <ToolTargetHandle show={showToolHandle} nodeId={nodeId} />

            <Flex alignItems={'center'} mb={1}>
              {node?.flowNodeType !== FlowNodeTypeEnum.stopTool && (
                <NodeFoldButton nodeId={nodeId} isFolded={isFolded} />
              )}

              <NodeTitleSection
                nodeId={nodeId}
                avatar={avatar}
                name={name}
                searchedText={searchedText}
              />

              <Box flex={1} mr={1} />

              {showVersion && <NodeVersion node={node!} />}

              <NodeActionButtons
                nodeTemplate={nodeTemplate}
                courseUrl={node?.courseUrl}
                rtDoms={rtDoms}
              />

              <NodeStatusBadge status={nodeTemplate?.status} error={error} />
            </Flex>

            <NodeIntro nodeId={nodeId} intro={intro} />
          </Box>
        )}
        <MenuRender nodeId={nodeId} menuForbid={menuForbid} />
      </Box>

      <Flex flexDirection={'column'} flex={1} py={!isFolded ? 3 : 0} gap={2} position={'relative'}>
        {!isFolded ? (
          <>
            {inputConfig && !inputConfig?.value ? (
              <NodeSecret
                nodeId={nodeId}
                isFolder={node?.isFolder}
                courseUrl={node?.courseUrl}
                hasSystemSecret={node?.hasSystemSecret}
                pluginId={node?.pluginId}
                systemKeyCost={node?.systemKeyCost}
                inputConfig={inputConfig}
              />
            ) : (
              children
            )}
          </>
        ) : (
          <Box h={4} />
        )}
      </Flex>

      {/* Handle */}
      <ConnectionSourceHandle nodeId={nodeId} />
      <ConnectionTargetHandle nodeId={nodeId} />
      {RenderToolHandle}
    </Flex>
  );
};

export default React.memo(NodeCard);

// 节点折叠按钮组件
const NodeFoldButton = React.memo<{
  nodeId: string;
  isFolded?: boolean;
}>(({ nodeId, isFolded }) => {
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const handleClick = useCallback(() => {
    onChangeNode({
      nodeId,
      type: 'attr',
      key: 'isFolded',
      value: !isFolded
    });
  }, [nodeId, isFolded, onChangeNode]);

  return (
    <Flex
      alignItems={'center'}
      mr={1}
      p={1}
      cursor={'pointer'}
      rounded={'sm'}
      _hover={{ bg: 'myGray.200' }}
      onClick={handleClick}
    >
      <MyIcon
        name={!isFolded ? 'core/chat/chevronDown' : 'core/chat/chevronRight'}
        w={'16px'}
        h={'16px'}
        color={'myGray.500'}
      />
    </Flex>
  );
});
NodeFoldButton.displayName = 'NodeFoldButton';

// 节点标题区域组件
const NodeTitleSection = React.memo<{
  nodeId: string;
  avatar: string;
  name: string;
  searchedText?: string;
}>(({ nodeId, avatar, name, searchedText }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  // custom title edit
  const { onOpenModal: onOpenCustomTitleModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('common:custom_title'),
    placeholder: t('app:module.Custom Title Tip') || ''
  });

  const handleRenameClick = useCallback(() => {
    onOpenCustomTitleModal({
      defaultVal: name,
      onSuccess: (newName) => {
        if (!newName) {
          return toast({
            title: t('app:modules.Title is required'),
            status: 'warning'
          });
        }
        onChangeNode({
          nodeId,
          type: 'attr',
          key: 'name',
          value: newName
        });
      }
    });
  }, [onOpenCustomTitleModal, name, onChangeNode, nodeId, toast, t]);

  return (
    <>
      <Avatar src={avatar} borderRadius={'sm'} objectFit={'contain'} w={'24px'} h={'24px'} />
      <Box ml={2} fontSize={'18px'} fontWeight={'medium'} color={'myGray.900'}>
        <HighlightText
          rawText={t(name as any)}
          matchText={searchedText ?? ''}
          mode={'bg'}
          color={'#ffe82d'}
        />
      </Box>
      <Button
        display={'none'}
        variant={'grayGhost'}
        size={'xs'}
        ml={0.5}
        className="controller-rename"
        cursor={'pointer'}
        onClick={handleRenameClick}
      >
        <MyIcon name={'edit'} w={'14px'} />
      </Button>

      <EditTitleModal maxLength={100} />
    </>
  );
});
NodeTitleSection.displayName = 'NodeTitleSection';

// 节点介绍组件
const NodeIntro = React.memo(function NodeIntro({
  nodeId,
  intro = ''
}: {
  nodeId: string;
  intro?: string;
}) {
  const { t } = useTranslation();
  const splitToolInputs = useContextSelector(WorkflowUtilsContext, (ctx) => ctx.splitToolInputs);
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

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

const NodeVersion = React.memo(function NodeVersion({ node }: { node: FlowNodeItemType }) {
  const { t } = useTranslation();

  const onResetNode = useContextSelector(WorkflowActionsContext, (v) => v.onResetNode);

  const { isOpen, onOpen, onClose } = useDisclosure();

  // Load version list
  const { ScrollData, data: versionList } = useScrollPagination(getToolVersionList, {
    pageSize: 20,
    params: {
      pluginId: node.pluginId
    },
    refreshDeps: [node.pluginId, isOpen],
    disabled: !isOpen,
    manual: false
  });

  const { runAsync: onUpdateVersion, loading: isUpdating } = useRequest2(
    async (versionId: string) => {
      if (!node) return;

      if (node.pluginId) {
        const template = await getToolPreviewNode({ appId: node.pluginId, versionId });

        if (!!template) {
          onResetNode({
            id: node.nodeId,
            node: {
              ...template,
              name: node.name,
              intro: node.intro,
              avatar: node.avatar
            }
          });
        }
      }
    },
    {
      refreshDeps: [node, onResetNode]
    }
  );

  const renderVersionList = useCreation(
    () => [
      {
        label: t('app:keep_the_latest'),
        value: ''
      },
      ...versionList.map((item) => ({
        label: item.versionName,
        value: item._id
      }))
    ],
    [node.isLatestVersion, node.version, t, versionList]
  );
  const valueLabel = useMemo(() => {
    return (
      <Flex alignItems={'center'} gap={0.5}>
        {node?.version === '' ? t('app:keep_the_latest') : node?.versionLabel}
        {!node.isLatestVersion && (
          <MyTag type="fill" colorSchema={'adora'} fontSize={'mini'} borderRadius={'lg'}>
            {t('app:not_the_newest')}
          </MyTag>
        )}
      </Flex>
    );
  }, [node.isLatestVersion, node?.version, node?.versionLabel, t]);

  return (
    <MySelect
      className="nowheel"
      value={node.version}
      onChange={onUpdateVersion}
      isLoading={isUpdating}
      customOnOpen={onOpen}
      customOnClose={onClose}
      placeholder={node?.versionLabel}
      variant={'whitePrimaryOutline'}
      size={'sm'}
      list={renderVersionList}
      ScrollData={(props) => (
        <ScrollData minH={'100px'} maxH={'40vh'}>
          {props.children}
        </ScrollData>
      )}
      valueLabel={valueLabel}
    />
  );
});

const MenuRender = React.memo(function MenuRender({
  nodeId,
  menuForbid
}: {
  nodeId: string;
  menuForbid?: Props['menuForbid'];
}) {
  const { t } = useTranslation();
  const { openDebugNode, DebugInputModal } = useDebug();
  const { setNodes, setEdges, getNodeList } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );

  const { computedNewNodeName } = useWorkflowUtils();

  const onCopyNode = useCallback(
    (nodeId: string) => {
      setNodes((state) => {
        const node = state.find((node) => node.id === nodeId);
        if (!node) return state;
        const template: Omit<StoreNodeItemType, 'nodeId'> = {
          flowNodeType: node.data.flowNodeType,
          parentNodeId: node.data.parentNodeId,
          avatar: node.data.avatar,
          name: computedNewNodeName({
            templateName: node.data.name,
            flowNodeType: node.data.flowNodeType,
            pluginId: node.data.pluginId
          }),
          intro: node.data.intro,
          toolDescription: node.data.toolDescription,
          showStatus: node.data.showStatus,

          version: node.data.version,
          versionLabel: node.data.versionLabel,
          isLatestVersion: node.data.isLatestVersion,

          catchError: node.data.catchError,
          inputs: node.data.inputs,
          outputs: node.data.outputs,

          pluginId: node.data.pluginId,
          isFolder: node.data.isFolder,
          pluginData: node.data.pluginData,

          toolConfig: node.data.toolConfig,

          currentCost: node.data.currentCost,
          systemKeyCost: node.data.systemKeyCost,
          hasTokenFee: node.data.hasTokenFee,
          hasSystemSecret: node.data.hasSystemSecret
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
              version: template.version,
              versionLabel: template.versionLabel,
              isLatestVersion: template.isLatestVersion,
              toolConfig: template.toolConfig,
              catchError: template.catchError
            },
            selected: true,
            parentNodeId: template.parentNodeId,
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
      const childNodeIds = getNodeList()
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
    [getNodeList, setEdges, setNodes]
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
              label: t('common:Copy'),
              variant: 'whiteBase',
              onClick: () => onCopyNode(nodeId)
            }
          ]),
      ...(menuForbid?.delete
        ? []
        : [
            {
              icon: 'delete',
              label: t('common:Delete'),
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

// 节点操作按钮组组件
const NodeActionButtons = React.memo<{
  nodeTemplate?: {
    diagram?: string;
    userGuide?: string;
    name?: string;
    avatar?: string;
    courseUrl?: string;
  };
  courseUrl?: string;
  rtDoms?: React.ReactNode[];
}>(({ nodeTemplate, courseUrl, rtDoms }) => {
  const { t } = useTranslation();

  const buttons = useMemo(() => {
    const result: React.ReactNode[] = [];

    if (nodeTemplate?.diagram) {
      result.push(
        <MyTooltip
          key="diagram"
          label={
            <MyImage src={nodeTemplate.diagram} w={'100%'} minH={['auto', '200px']} alt={''} />
          }
        >
          <Button variant={'grayGhost'} size={'xs'} color={'primary.600'} px={1}>
            {t('common:core.module.Diagram')}
          </Button>
        </MyTooltip>
      );
    }

    if (courseUrl || nodeTemplate?.userGuide) {
      result.push(
        <UseGuideModal
          key="userGuide"
          title={nodeTemplate?.name}
          iconSrc={nodeTemplate?.avatar}
          text={nodeTemplate?.userGuide}
          link={nodeTemplate?.courseUrl || courseUrl}
        >
          {({ onClick }) => (
            <MyTooltip label={t('workflow:Node.Open_Node_Course')}>
              <MyIconButton ml={1} icon="book" color={'primary.600'} onClick={onClick} />
            </MyTooltip>
          )}
        </UseGuideModal>
      );
    }

    if (rtDoms) {
      result.push(...rtDoms);
    }

    return result;
  }, [nodeTemplate, courseUrl, rtDoms, t]);

  if (buttons.length === 0) {
    return null;
  }

  return (
    <>
      {buttons.map((button, index) => (
        <React.Fragment key={index}>
          {index > 0 && <Box bg={'myGray.300'} w={'1px'} h={'12px'} mx={1} />}
          {button}
        </React.Fragment>
      ))}
    </>
  );
});
NodeActionButtons.displayName = 'NodeActionButtons';

// 节点错误徽章组件
const NodeStatusBadge = React.memo<{ status?: PluginStatusType; error?: string | null }>(
  ({ status, error }) => {
    const { t } = useTranslation();

    if (error) {
      return (
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
          <Box color={'red.600'}>{t(error as any)}</Box>
        </Flex>
      );
    }
    if (status !== undefined && status !== PluginStatusEnum.Normal) {
      return (
        <MyTooltip
          label={
            status === PluginStatusEnum.Offline
              ? t('app:tool_offset_tips')
              : t('app:tool_soon_offset_tips')
          }
        >
          <MyTag
            mr={2}
            colorSchema={status === PluginStatusEnum.Offline ? 'red' : 'yellow'}
            type="borderFill"
          >
            {t(PluginStatusMap[status].label)}
          </MyTag>
        </MyTooltip>
      );
    }
    return null;
  }
);
NodeStatusBadge.displayName = 'NodeStatusBadge';

// 节点 Secret 组件
const NodeSecret = React.memo(function NodeSecret({
  nodeId,
  isFolder,
  courseUrl,
  hasSystemSecret,
  pluginId,
  systemKeyCost,
  inputConfig
}: {
  nodeId: string;
  isFolder?: boolean;
  courseUrl?: string;
  hasSystemSecret?: boolean;
  pluginId?: string;
  systemKeyCost?: number;
  inputConfig: FlowNodeInputItemType | undefined;
}) {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const [
    isOpenToolParamConfigModal,
    { setTrue: onOpenToolParamConfigModal, setFalse: onCloseToolParamConfigModal }
  ] = useBoolean(false);

  return (
    <>
      <Flex
        alignItems={'center'}
        flexDirection={'column'}
        justifyContent={'center'}
        borderRadius={'lg'}
        h={'200px'}
        bg={'myGray.25'}
        border={'base'}
        mx={4}
      >
        <Box>{t('app:tool_not_active')}</Box>
        <Button w={'83px'} mt={2} size={'lg'} onClick={onOpenToolParamConfigModal}>
          {t('app:too_to_active')}
        </Button>
      </Flex>

      {inputConfig && isOpenToolParamConfigModal && (
        <SecretInputModal
          isFolder={isFolder}
          onClose={onCloseToolParamConfigModal}
          onSubmit={(data) => {
            onChangeNode({
              nodeId,
              type: 'updateInput',
              key: inputConfig.key,
              value: {
                ...inputConfig,
                value: data
              }
            });
            onCloseToolParamConfigModal();
          }}
          courseUrl={courseUrl}
          inputConfig={inputConfig}
          hasSystemSecret={hasSystemSecret}
          parentId={pluginId}
          secretCost={systemKeyCost}
        />
      )}
    </>
  );
});
