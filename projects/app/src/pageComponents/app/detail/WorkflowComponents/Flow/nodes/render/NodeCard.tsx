import UseGuideModal from '@/components/common/Modal/UseGuideModal';
import SecretInputModal from '@/pageComponents/app/tool/SecretInputModal';
import { getAppPermission } from '@/web/core/app/api';
import { getClientToolPreviewNode } from '@/web/core/app/api/tool';
import { getAppVersionList } from '@/web/core/app/api/version';
import { getTeamToolVersions } from '@/web/core/plugin/team/api';
import { WorkflowHostContext } from '@/web/core/workflow/editor/host';
import { storeNode2FlowNode } from '@/web/core/workflow/utils';
import {
  getWorkflowIssueUIStatus,
  renderWorkflowIssueMessage
} from '@/web/core/workflow/issueView';
import { Box, Button, Flex, type FlexProps } from '@chakra-ui/react';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import type { SystemToolVersionType } from '@fastgpt/global/core/app/tool/systemTool/type/base';
import {
  getToolRawId,
  isDebugToolSource,
  mergeToolSetChildDescriptions,
  splitCombineToolId
} from '@fastgpt/global/core/app/tool/utils';
import { formatToolError } from '@fastgpt/global/core/app/utils';
import type { DeepReadonly, WorkflowNodeData } from '@fastgpt/global/core/workflow/editor/types';
import {
  PluginStatusEnum,
  PluginStatusMap,
  type PluginStatusType
} from '@fastgpt/global/core/plugin/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  AppNodeFlowNodeTypeMap,
  FlowNodeTypeEnum,
  isNestedParentNodeType
} from '@fastgpt/global/core/workflow/node/constant';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type {
  FlowNodeItemType,
  StoreNodeItemType,
  WorkflowCheckIssue
} from '@fastgpt/global/core/workflow/type/node';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import HighlightText from '@fastgpt/web/components/common/String/HighlightText';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import DebugToolTag from '@fastgpt/web/components/core/plugin/tool/DebugToolTag';
import {
  getBorderColorByColorSchema,
  getColorSchemaByFlowNodeType,
  getGradientByColorSchema
} from '@fastgpt/web/core/workflow/utils';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useBoolean, useCreation } from 'ahooks';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useMemo, useState } from 'react';
import { useReactFlow } from 'reactflow';
import { useContextSelector } from 'use-context-selector';
import { omit } from 'lodash-es';
import { migrateToolInputConfig } from '@fastgpt/global/core/app/formEdit/utils';
import {
  useField,
  useNodeActions,
  useNodeValue,
  useWorkflowActions
} from '@/web/core/workflow/editor';
import { canvasNodeToStoreNode } from '@/web/core/workflow/editor/canvas';

import { WorkflowUIContext } from '../../context/workflowUIContext';
import { WorkflowCanvasContext } from '../../context/workflowCanvasContext';
import { useDebug } from '../../hooks/useDebug';
import { useNodeOutputValidity } from '../../hooks/useNodeOutputValidity';
import { useClearCanvasSelection } from '../../hooks/useWorkflow';
import { useWorkflowUtils } from '../../hooks/useUtils';
import { useIsToolNode } from './useWorkflowDocument';
import { ConnectionSourceHandle, ConnectionTargetHandle } from './Handle/ConnectionHandle';
import { ToolSourceHandle, ToolTargetHandle } from './Handle/ToolHandle';
import InlineEdit from './InlineEdit';
import NodeDebugResponse from './RenderDebug/NodeDebugResponse';

/**
 * 节点卡片入参：只保留 renderer 交互状态与画布视图数据。
 *
 * 名称、头像、简介、版本、类型、错误标记一律由卡片自己读文档与 host 问题存储，
 * 不再从投影塞满的 FlowNodeItemType props 里取；调用点仍可整体展开 data，多余字段被忽略。
 */
type Props = {
  nodeId: string;
  children?: React.ReactNode | React.ReactNode[] | string;
  minW?: string | number;
  maxW?: string | number;
  minH?: string | number;
  w?: string | number;
  h?: string | number;
  /** 选中态属于 renderer 交互层，由节点组件从 reactflow props 透传。 */
  selected?: boolean;
  /** 搜索命中高亮：画布视图数据，由投影 overlay 合并后透传。 */
  searchedText?: string;
  /** 调试结果标记：同上，调试路径的数据入口在收尾票统一改读 host。 */
  debugResult?: FlowNodeItemType['debugResult'];
  /** 覆盖文档 intro 的展示文案（并行运行的结束节点用本地化说明）。 */
  intro?: string;
  menuForbid?: {
    copilot?: boolean;
    debug?: boolean;
    copy?: boolean;
    delete?: boolean;
    fold?: boolean;
  };
  customStyle?: FlexProps;
  rtDoms?: React.ReactNode[];
};

const getCurrentSystemToolTemplate = async (node?: FlowNodeItemType) => {
  if (!node?.pluginId || node.pluginData?.error || isDebugToolSource(node.source)) return;

  try {
    const { source } = splitCombineToolId(node.pluginId);
    if (source !== AppToolSourceEnum.systemTool && source !== AppToolSourceEnum.commercial) return;

    return getClientToolPreviewNode({
      appId: node.pluginId,
      versionId: node.version ?? '',
      source: node.source
    });
  } catch {
    return;
  }
};

const NodeOutputValidity = ({ nodeId }: { nodeId: string }) => {
  useNodeOutputValidity(nodeId);
  return null;
};

const NodeCard = (props: Props) => {
  const { t } = useTranslation();
  const {
    children,
    minW = '300px',
    maxW = '666px',
    minH = 0,
    w = 'full',
    h = 'full',
    nodeId,
    selected,
    searchedText,
    debugResult,
    intro: introOverride,
    menuForbid,
    customStyle,
    rtDoms
  } = props;

  // 投影节点只承载结构/元数据；字段值由叶子订阅，避免卡片跟随普通输入变化。
  const node = props as unknown as FlowNodeItemType;
  const isFolded = useNodeValue(nodeId, (handle) => !!handle?.view.isFolded);
  // 容器折叠时子节点整体隐藏：折叠状态存在父容器的 Node View 上。
  const hidden = useNodeValue(node?.parentNodeId ?? '', (handle) => !!handle?.view.isFolded);
  // 工具子流程节点：结构快照里指向本节点的 selectedTools 入边即可判定；
  // 该入边必然来自工具调用节点，不必再额外确认画布上存在工具调用节点。
  const isTool = useIsToolNode(nodeId);

  const avatar = node?.avatar ?? LOGO_ICON;
  const avatarLinear = node?.avatarLinear;
  const name = node?.name ?? t('common:core.module.template.UnKnow Module');
  const intro = introOverride ?? node?.intro;
  const pluginId = node?.pluginId;
  const flowNodeType = node?.flowNodeType;
  const colorSchema = node?.colorSchema;
  const inputs = node?.inputs;

  // 问题文案归 Runtime：直接读节点 snapshot 的 Issue View，标红焦点仍由 host 单点持有。
  const nodeIssues = useNodeValue(nodeId, (handle) => handle?.data.issues);
  const isError = useContextSelector(
    WorkflowHostContext,
    (v) => v.issueFocusRef.current === nodeId
  );
  // 教程元信息是画布视图数据（不进文档），由下面的工具详情请求写进 host overlay。
  const viewData = useContextSelector(WorkflowHostContext, (v) => v.overlaysRef.current[nodeId]);
  const courseUrl = viewData?.courseUrl as string | undefined;
  const readmeUrl = (viewData?.readmeUrl as string | undefined) ?? node?.readmeUrl;

  // 标红焦点归 host：点击标红节点即清除焦点（旧 onUpdateNodeError(nodeId, false) 行为）。
  const focusIssueNode = useContextSelector(WorkflowHostContext, (v) => v.focusIssueNode);
  const patchViewData = useContextSelector(WorkflowHostContext, (v) => v.patchViewData);
  const setHoverNodeId = useContextSelector(WorkflowUIContext, (v) => v.setHoverNodeId);
  const presentationMode = useContextSelector(WorkflowUIContext, (v) => v.presentationMode);
  const setPresentationMode = useContextSelector(WorkflowUIContext, (v) => v.setPresentationMode);
  const { fitView } = useReactFlow();
  const getNodeDimension = useContextSelector(WorkflowCanvasContext, (v) => v.getNodeDimension);

  const nodeActions = useNodeActions(nodeId);
  const inputConfigField = useField(nodeId, NodeInputKeyEnum.systemInputConfig, 'input');
  const inputConfig =
    inputConfigField?.data.input ??
    inputs?.find((item) => item.key === NodeInputKeyEnum.systemInputConfig);

  const handleDoubleClick = useCallback(() => {
    nodeActions?.setFolded(false);
    setPresentationMode(false);

    // Fit view to show this node in center
    setTimeout(() => {
      const dimension = getNodeDimension(nodeId);
      if (!dimension) return;
      fitView({
        nodes: [{ id: nodeId, ...dimension }],
        padding: 0.3,
        minZoom: 0.6
      });
    }, 100);
  }, [getNodeDimension, nodeActions, setPresentationMode, fitView, nodeId]);

  const showToolHandle = isTool;

  const gradient = useMemo(() => {
    const { source } = splitCombineToolId(pluginId ?? '');
    return getGradientByColorSchema({ colorSchema, source });
  }, [colorSchema, pluginId]);

  const foldedOverlay = useMemo(() => {
    if (!isFolded) return null;

    return (
      <Flex
        position={'absolute'}
        top={0}
        left={0}
        right={0}
        bottom={0}
        alignItems={'center'}
        justifyContent={'center'}
        flexDirection={'column'}
        zIndex={1}
        onDoubleClick={handleDoubleClick}
        cursor={'pointer'}
        bg={'rgba(255, 255, 255, 0.80)'}
        backdropFilter={'blur(10px)'}
        borderRadius={26}
      >
        <Avatar
          src={avatarLinear || avatar}
          fill={'none'}
          borderRadius={16}
          w={'100px'}
          h={'100px'}
        />
        <Box
          mt={3}
          color={'myGray.700'}
          fontSize={'26px'}
          fontWeight={'500'}
          textAlign={'center'}
          overflow={'hidden'}
          textOverflow={'ellipsis'}
          whiteSpace={'nowrap'}
          maxW={'80%'}
        >
          {name}
        </Box>
      </Flex>
    );
  }, [isFolded, avatar, avatarLinear, name, handleDoubleClick]);

  const errorIssues = useMemo(
    () => nodeIssues?.filter((issue) => issue.level === 'error') ?? [],
    [nodeIssues]
  );

  const { outlineColor, outlineWidth } = useMemo(() => {
    // error mode
    if (isError) return { outlineColor: '#F97066', outlineWidth: '4px solid' };
    // common mode
    if (!presentationMode && !isFolded) {
      const outlineColor = selected ? 'primary.600' : 'myGray.250';
      const outlineWidth = selected ? '4px solid' : '1px solid';
      return { outlineColor, outlineWidth };
    }
    // presentation & fold mode
    const { source } = splitCombineToolId(pluginId ?? '');
    const outlineColor = getBorderColorByColorSchema({ colorSchema, source });
    if (!outlineColor) return { outlineColor: undefined, outlineWidth: undefined };
    return {
      outlineColor,
      outlineWidth: '4px solid'
    };
  }, [presentationMode, isFolded, colorSchema, selected, isError, pluginId]);

  const isAppNode = node && AppNodeFlowNodeTypeMap[node?.flowNodeType];
  const isLoopNode = isNestedParentNodeType(node?.flowNodeType ?? '');

  const { data: nodeTemplate } = useRequest(
    async () => {
      if (node?.pluginData?.error) {
        return undefined;
      }

      if (isAppNode) {
        const currentSystemToolTemplate = await getCurrentSystemToolTemplate(node);

        return {
          ...node,
          ...node.pluginData,
          ...(currentSystemToolTemplate
            ? {
                status: currentSystemToolTemplate.status,
                courseUrl: currentSystemToolTemplate.courseUrl,
                readmeUrl: currentSystemToolTemplate.readmeUrl,
                userGuide: currentSystemToolTemplate.userGuide,
                diagram: currentSystemToolTemplate.diagram
              }
            : {})
        };
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
        // 教程元信息由工具详情实时回写，兼容已保存的旧节点。
        // 这三个字段是画布视图数据（不进文档），直接写 host overlay 由投影合并。
        patchViewData([
          {
            nodeId,
            values: {
              courseUrl: res.courseUrl,
              readmeUrl: res.readmeUrl,
              userGuide: res.userGuide
            }
          }
        ]);
      },
      manual: false,
      errorToast: '',
      refreshDeps: [
        isAppNode,
        node?.pluginData?.error,
        node?.pluginData?.status,
        node?.pluginId,
        node?.source,
        node?.version
      ]
    }
  );

  const toolStatus = nodeTemplate?.status ?? node?.pluginData?.status;
  const showVersion = useMemo(() => {
    if (toolStatus === PluginStatusEnum.Offline || node?.pluginData?.error) return false;

    const source = node?.pluginId ? splitCombineToolId(node.pluginId).source : undefined;
    if (isDebugToolSource(node?.source)) return false;
    // 1. MCP/HTTP single tools use the latest toolset content and do not expose version selection.
    if (source === AppToolSourceEnum.mcp || source === AppToolSourceEnum.http) return false;

    // 2. MCP/HTTP tool sets do not have version
    if (
      isAppNode &&
      (node.toolConfig?.mcpToolSet ||
        node.toolConfig?.mcpTool ||
        node?.toolConfig?.httpToolSet ||
        node?.toolConfig?.httpTool)
    )
      return false;
    // 3. Team app/System commercial plugin
    if (isAppNode && node?.pluginId && !node?.pluginData?.error) return true;
    // 4. System tool
    if (isAppNode && node?.toolConfig?.systemTool) return true;

    return false;
  }, [isAppNode, node, toolStatus]);

  /* Node header - 重构后的版本,依赖项大幅减少 */
  const error = useMemo(() => formatToolError(node?.pluginData?.error), [node?.pluginData?.error]);
  const showHeader = node?.flowNodeType !== FlowNodeTypeEnum.comment;

  const RenderToolHandle = useMemo(
    () =>
      node?.flowNodeType === FlowNodeTypeEnum.toolCall ? (
        <ToolSourceHandle nodeId={nodeId} />
      ) : null,
    [node?.flowNodeType, nodeId]
  );

  return (
    <Flex
      data-workflow-node-occupied="true"
      position={'relative'}
      outline={selected && (presentationMode || isFolded) ? '16px solid' : undefined}
      outlineColor={'rgba(17, 24, 36, 0.05)'}
      borderRadius={isFolded ? 26 : 'lg'}
      boxShadow={'0 24px 40px 0 rgba(0, 0, 0, 0.05)'}
      {...customStyle}
    >
      <Flex
        data-workflow-node-card="true"
        hidden={hidden}
        flexDirection={'column'}
        {...(isFolded
          ? {
              w: '240px',
              h: '240px'
            }
          : {
              minW,
              maxW,
              minH,
              w,
              h
            })}
        outline={outlineWidth}
        outlineColor={outlineColor}
        borderRadius={isFolded ? 26 : 'lg'}
        _hover={{
          boxShadow: '0 24px 40px 0 rgba(0, 0, 0, 0.08)',
          '& .controller-menu': {
            display: 'flex'
          },
          '& .controller-debug': {
            display: 'block'
          },
          '& .node-hover-controller': {
            visibility: 'visible'
          }
        }}
        onMouseEnter={() => setHoverNodeId(nodeId)}
        onMouseLeave={() => setHoverNodeId(undefined)}
        {...(isError ? { onMouseDownCapture: () => focusIssueNode(undefined) } : {})}
      >
        <NodeOutputValidity nodeId={nodeId} />
        {debugResult && <NodeDebugResponse nodeId={nodeId} debugResult={debugResult} />}

        {foldedOverlay}

        {!isFolded && (
          <Box bg={'white'} borderRadius={'lg'} flex={1} display={'flex'} flexDirection={'column'}>
            {/* Header */}
            <Box position={'relative'}>
              {gradient && (
                <Box
                  position={'absolute'}
                  top={0}
                  left={0}
                  right={0}
                  height={'60px'}
                  background={gradient}
                  borderRadius={'lg'}
                  zIndex={20}
                  pointerEvents={'none'}
                />
              )}
              {showHeader && (
                <Box px={4} pt={4} position={'relative'}>
                  <Flex alignItems={'center'} mb={1}>
                    <NodeTitleSection
                      nodeId={nodeId}
                      avatar={avatar}
                      name={name}
                      searchedText={searchedText}
                      appId={pluginId}
                    />

                    <Box mr={1} />

                    {isDebugToolSource(node?.source) && <DebugToolTag mr={2} />}

                    {showVersion && <NodeVersion node={node!} />}

                    <NodeActionButtons
                      nodeTemplate={nodeTemplate}
                      courseUrl={courseUrl}
                      readmeUrl={readmeUrl}
                      rtDoms={rtDoms}
                    />

                    <NodeStatusBadge status={nodeTemplate?.status} error={error} />
                  </Flex>

                  <NodeIntro nodeId={nodeId} intro={intro} flowNodeType={flowNodeType} />
                </Box>
              )}
            </Box>

            <Flex
              flexDirection={'column'}
              flex={1}
              pb={showHeader ? 4 : 0}
              gap={2}
              position={'relative'}
            >
              {!isFolded ? (
                <>
                  {inputConfig && !inputConfig?.value ? (
                    <NodeSecret
                      nodeId={nodeId}
                      isFolder={node?.isFolder}
                      courseUrl={courseUrl}
                      readmeUrl={readmeUrl}
                      hasSystemSecret={node?.hasSystemSecret}
                      pluginId={node?.pluginId}
                      source={node?.source}
                      systemKeyCost={node?.systemKeyCost}
                      inputConfig={inputConfig as unknown as FlowNodeInputItemType}
                    />
                  ) : (
                    children
                  )}
                </>
              ) : (
                <Box h={4} />
              )}
            </Flex>
          </Box>
        )}

        {/* Menu - Always render outside the fold/unfold condition */}
        <MenuRender nodeId={nodeId} menuForbid={menuForbid} />

        {/* Handle - Always render handles outside the fold/unfold condition */}
        <ToolTargetHandle show={showToolHandle} nodeId={nodeId} />
        <ConnectionSourceHandle nodeId={nodeId} />
        <ConnectionTargetHandle nodeId={nodeId} />
        {RenderToolHandle}

        {/* Presentation Mode Overlay */}
        {presentationMode && !isFolded && showHeader && (
          <PresentationModeOverlay
            avatar={avatarLinear || avatar}
            name={name}
            intro={intro}
            isLoopNode={isLoopNode}
            onDoubleClick={handleDoubleClick}
          />
        )}
      </Flex>
      {!isFolded && errorIssues.length > 0 && (
        <Box
          data-workflow-node-issues="true"
          position={'absolute'}
          top={'100%'}
          left={0}
          w={'100%'}
          pointerEvents={'none'}
        >
          <NodeWorkflowCheckIssues issues={errorIssues} />
        </Box>
      )}
    </Flex>
  );
};

export default React.memo(NodeCard);

/** 待处理/待完善状态图标：待完善用设计稿虚线圆环，待处理用圆形 info。 */
const WorkflowCheckIssueStatusIcon = React.memo(function WorkflowCheckIssueStatusIcon({
  status
}: {
  status: ReturnType<typeof getWorkflowIssueUIStatus>;
}) {
  return (
    <MyIcon
      name={status === 'pending_handle' ? 'infoRounded' : 'core/app/workflow/checkPendingImprove'}
      w={'24px'}
      h={'24px'}
      flexShrink={0}
      color={'#485264'}
    />
  );
});

const workflowCheckIssueTextStyle = {
  color: 'myGray.600',
  fontFamily: 'PingFang SC, PingFang, sans-serif',
  fontSize: '16px',
  fontStyle: 'normal',
  fontWeight: 500,
  lineHeight: '24px',
  letterSpacing: '0.15px'
} as const;

/** 节点下方校验问题提示条，使用灰色轻量样式而非红色错误条。 */
const NodeWorkflowCheckIssues = React.memo(function NodeWorkflowCheckIssues({
  issues
}: {
  issues: WorkflowCheckIssue[];
}) {
  const { t } = useTranslation();

  return (
    <Flex flexDirection={'column'} alignItems={'flex-start'} gap={'8px'} mt={2}>
      {issues.map((issue, index) => {
        const status = getWorkflowIssueUIStatus(issue.code);
        // 显式保留静态 key，避免 i18n 清理脚本误删状态前缀文案。
        const statusPrefixText =
          status === 'pending_handle'
            ? t('common:core.workflow.check.status.pending_handle')
            : t('common:core.workflow.check.status.pending_improve');

        return (
          <Flex
            key={`${issue.code}-${issue.inputKey ?? ''}-${index}`}
            display={'inline-flex'}
            alignItems={'center'}
            gap={'8px'}
            px={'16px'}
            py={'8px'}
            w={'fit-content'}
            maxW={'min(720px, 100%)'}
            bg={'#E8EBF0'}
            opacity={0.8}
            borderRadius={'8px'}
          >
            <WorkflowCheckIssueStatusIcon status={status} />
            <Box as={'span'} flexShrink={0} {...workflowCheckIssueTextStyle}>
              {statusPrefixText}:
            </Box>
            <Box
              as={'span'}
              minW={0}
              whiteSpace={'normal'}
              wordBreak={'break-word'}
              {...workflowCheckIssueTextStyle}
            >
              {renderWorkflowIssueMessage(issue, t)}
            </Box>
          </Flex>
        );
      })}
    </Flex>
  );
});

// 节点标题区域组件
const NodeTitleSection = React.memo<{
  nodeId: string;
  avatar: string;
  name: string;
  searchedText?: string;
  appId?: string;
}>(({ nodeId, avatar, name, searchedText, appId }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const nodeActions = useNodeActions(nodeId);

  const childAppId = useMemo(() => {
    if (!appId) return;
    const rawId = getToolRawId(appId);
    const result = ObjectIdSchema.safeParse(rawId);
    if (result.success) {
      return rawId;
    }
    return undefined;
  }, [appId]);

  const { runAsync: onGetPermission } = useRequest(getAppPermission, {
    onSuccess(permission) {
      if (permission.hasWritePer) {
        window.open(`/app/detail?appId=${childAppId}`, '_blank');
      } else {
        toast({
          title: t('workflow:no_edit_permission'),
          status: 'warning'
        });
      }
    }
  });

  const handleSave = useCallback(
    (newVal: string) => {
      const trimmed = newVal.trim();
      if (!trimmed) {
        toast({
          title: t('app:modules.Title is required'),
          status: 'warning'
        });
        return false;
      }
      if (trimmed !== name) {
        nodeActions?.setName(trimmed);
      }
      return true;
    },
    [name, nodeActions, toast, t]
  );

  const renderDisplay = useCallback(
    (val: string) => (
      <HighlightText rawText={val} matchText={searchedText ?? ''} mode={'bg'} color={'#ffe82d'} />
    ),
    [searchedText]
  );

  return (
    <Flex alignItems={'center'} flex={'1 1 0'} minW={0}>
      <Avatar src={avatar} borderRadius={'sm'} objectFit={'contain'} w={'24px'} h={'24px'} />
      <Box ml={2} flex={1} minW={0}>
        <InlineEdit
          value={name}
          onSave={handleSave}
          fontSize={'18px'}
          fontWeight={'medium'}
          maxLength={50}
          h={'28px'}
          innerH={'26px'}
          lineHeight={'26px'}
          px={'6px'}
          renderDisplay={renderDisplay}
        />
      </Box>
      {childAppId && (
        <Box ml={1} flexShrink={0} visibility={'hidden'}>
          <MyIconButton
            className="node-hover-controller"
            icon="common/link"
            tip={t('workflow:to_app_detail')}
            onClick={() => onGetPermission(childAppId)}
          />
        </Box>
      )}
    </Flex>
  );
});
NodeTitleSection.displayName = 'NodeTitleSection';

// 节点介绍组件
const NodeIntro = React.memo(function NodeIntro({
  nodeId,
  intro = '',
  flowNodeType
}: {
  nodeId: string;
  intro?: string;
  flowNodeType?: FlowNodeTypeEnum;
}) {
  const { t } = useTranslation();
  const nodeActions = useNodeActions(nodeId);
  const [isIntroEditing, setIsIntroEditing] = useState(false);

  const handleSave = useCallback(
    (newVal: string) => {
      const trimmed = newVal.trim();
      if (trimmed !== intro) {
        nodeActions?.updateNode(() => ({ intro: trimmed }));
      }
      return true;
    },
    [intro, nodeActions]
  );

  return (
    <Box w={'100%'} minW={0} overflow={'hidden'}>
      <InlineEdit
        value={intro}
        onSave={handleSave}
        type={'textarea'}
        maxLength={500}
        placeholder={t('app:node_not_intro')}
        onEditingChange={setIsIntroEditing}
        fontSize={'sm'}
        lineHeight={'short'}
        color={'myGray.500'}
        minH={'20px'}
        py={'3px'}
        px={'6px'}
      />
      {isIntroEditing && flowNodeType === FlowNodeTypeEnum.toolSet && (
        <Flex
          alignItems={'center'}
          gap={'0.25rem'}
          py={'0.25rem'}
          px={0}
          fontSize={'xs'}
          color={'myGray.500'}
        >
          <MyIcon name={'common/info'} w={'14px'} />
          {t('app:toolset_intro_tips')}
        </Flex>
      )}
    </Box>
  );
});

const NodeVersion = React.memo(function NodeVersion({ node }: { node: FlowNodeItemType }) {
  const { t } = useTranslation();

  const nodeActions = useNodeActions(node.nodeId);
  const { openConfirm: openKeepLatestConfirm, ConfirmModal: KeepLatestConfirmModal } = useConfirm({
    content: t('app:keep_the_latest_confirm_tip')
  });
  const toolSource = useMemo(
    () => (node.pluginId ? splitCombineToolId(node.pluginId).source : undefined),
    [node.pluginId]
  );

  const {
    runAsync: loadVersions,
    data: versionList = [],
    loading: isLoadingVersions
  } = useRequest(
    async () => {
      if (!node.pluginId) return [];

      const { authAppId } = splitCombineToolId(node.pluginId);
      if (toolSource === AppToolSourceEnum.mcp || toolSource === AppToolSourceEnum.http) return [];

      if (toolSource === AppToolSourceEnum.personal) {
        if (!authAppId) return [];

        const { list = [] } = await getAppVersionList({
          appId: authAppId,
          isPublish: true,
          offset: 0,
          pageSize: 100
        });

        return list.map<SystemToolVersionType>((item) => ({
          version: item._id,
          versionDescription: item.versionName
        }));
      }

      return getTeamToolVersions({
        toolId: node.pluginId,
        source: toolSource === AppToolSourceEnum.personal ? 'team' : 'system'
      });
    },
    {
      refreshDeps: [node.pluginId, toolSource]
    }
  );

  const { runAsync: onUpdateVersion, loading: isUpdating } = useRequest(
    async (versionId: string) => {
      if (!node) return;

      if (node.pluginId) {
        const template = await getClientToolPreviewNode({
          appId: node.pluginId,
          versionId,
          source: node.source
        });

        if (!!template) {
          const versionTemplate = {
            ...template,
            colorSchema:
              template.colorSchema ?? getColorSchemaByFlowNodeType(template.flowNodeType),
            name: node.name,
            intro: node.intro,
            avatar: node.avatar,
            toolConfig: mergeToolSetChildDescriptions({
              savedToolConfig: node.toolConfig,
              templateToolConfig: template.toolConfig
            })
          };
          // 切换版本 = 用新版本模板整体覆盖节点数据，保留位置、折叠与已配置的工具输入。
          // adapter 没有整节点替换句柄，这里拼出完整 patch 走 updateNode：Runtime 会用当前
          // Node View 覆盖 patch 里的 position/isFolded，教程地址等视图字段也不进文档。
          // 覆盖基线取派发瞬间的记录：拉模板是异步的，用渲染期快照会把期间的其他写入冲掉。
          const sourceInputMap = new Map(node.inputs.map((input) => [input.key, input]));
          nodeActions?.updateNode(
            (current) =>
              omit(
                {
                  ...current,
                  ...versionTemplate,
                  inputs: versionTemplate.inputs.map((input) =>
                    migrateToolInputConfig({ input, sourceInput: sourceInputMap.get(input.key) })
                  )
                },
                ['debugResult', 'searchedText', 'courseUrl', 'readmeUrl', 'userGuide']
              ) as Partial<DeepReadonly<WorkflowNodeData>>
          );
        }
      }
    },
    {
      refreshDeps: [node, nodeActions]
    }
  );
  const onSelectVersion = useCallback(
    (versionId: string) => {
      if (!versionId) {
        openKeepLatestConfirm({
          onConfirm: () => onUpdateVersion('')
        })();
        return;
      }

      return onUpdateVersion(versionId);
    },
    [onUpdateVersion, openKeepLatestConfirm]
  );

  const renderVersionList = useCreation(
    () => [
      {
        label: t('app:keep_the_latest'),
        value: ''
      },
      ...versionList.map((item) => ({
        label: item.versionDescription || item.version,
        value: item.version
      }))
    ],
    [node.isLatestVersion, node.version, t, versionList]
  );
  const valueLabel = useMemo(() => {
    return (
      <Flex alignItems={'center'} gap={0.5}>
        {!node?.version ? t('app:keep_the_latest') : node?.versionLabel}
        {!node.isLatestVersion && (
          <MyTag type="fill" colorSchema={'adora'} fontSize={'mini'} borderRadius={'lg'}>
            {t('app:not_the_newest')}
          </MyTag>
        )}
      </Flex>
    );
  }, [node.isLatestVersion, node.version, node.versionLabel, t]);

  return (
    <>
      <MySelect
        className="nowheel"
        value={node.version}
        onChange={onSelectVersion}
        isLoading={isUpdating || isLoadingVersions}
        customOnOpen={loadVersions}
        placeholder={node?.versionLabel}
        variant={'whitePrimaryOutline'}
        size={'sm'}
        list={renderVersionList}
        valueLabel={valueLabel}
      />
      <KeepLatestConfirmModal isLoading={isUpdating} />
    </>
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
  const actions = useWorkflowActions();
  const nodeActions = useNodeActions(nodeId);
  const runtime = useContextSelector(WorkflowHostContext, (v) => v.runtime);
  const clearCanvasSelection = useClearCanvasSelection();
  // 删除走 ReactFlow 的 deleteElements：它派生的 remove 变更由画布变更漏斗接管。
  const { deleteElements } = useReactFlow();

  const { computedNewNodeName } = useWorkflowUtils();

  const isFolded = useNodeValue(nodeId, (handle) => !!handle?.view.isFolded);

  /**
   * 复制当前节点：从文档快照取字段、Node View 取坐标，生成新 nodeId 后走 adapter 写入文档。
   * 只透传 storeNode2FlowNode 实际消费的字段（旧 template 里的 isFolder/pluginData/计费等为死代码）。
   * 文档快照是 DeepReadonly，item 仅做结构透传，这里整体断言回可变形状。
   */
  const onCopyNode = useCallback(() => {
    const data = runtime?.getNode(nodeId);
    const position = runtime?.getNodeView(nodeId)?.position;
    if (!data || !position) return;
    const newNode = storeNode2FlowNode({
      item: {
        flowNodeType: data.flowNodeType,
        avatar: data.avatar,
        avatarLinear: data.avatarLinear,
        colorSchema: data.colorSchema,
        name: computedNewNodeName({
          templateName: data.name,
          flowNodeType: data.flowNodeType,
          pluginId: data.pluginId
        }),
        intro: data.intro,
        nodeId: getNanoid(),
        position: { x: position.x + 200, y: position.y + 50 },
        showStatus: data.showStatus,
        pluginId: data.pluginId,
        source: data.source,
        inputs: data.inputs,
        outputs: data.outputs,
        version: data.version,
        versionLabel: data.versionLabel,
        isLatestVersion: data.isLatestVersion,
        toolConfig: data.toolConfig,
        catchError: data.catchError
      } as StoreNodeItemType,
      selected: false,
      parentNodeId: data.parentNodeId,
      t
    });
    clearCanvasSelection();
    actions.addNode(canvasNodeToStoreNode(newNode));
  }, [actions, clearCanvasSelection, computedNewNodeName, nodeId, runtime, t]);
  const Render = useMemo(() => {
    const menuList = [
      ...(menuForbid?.fold
        ? []
        : [
            {
              icon: isFolded ? 'core/chat/chevronRight' : 'core/chat/chevronDown',
              label: isFolded ? t('workflow:Unfold') : t('workflow:Fold'),
              variant: 'whiteBase',
              onClick: () => {
                nodeActions?.setFolded(!isFolded);
              }
            }
          ]),
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
              onClick: onCopyNode
            }
          ]),
      ...(menuForbid?.delete
        ? []
        : [
            {
              icon: 'delete',
              label: t('common:Delete'),
              variant: 'whiteDanger',
              onClick: () => deleteElements({ nodes: [{ id: nodeId }] })
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
    menuForbid?.fold,
    t,
    DebugInputModal,
    openDebugNode,
    nodeId,
    onCopyNode,
    deleteElements,
    isFolded,
    nodeActions,
    runtime
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
    readmeUrl?: string;
  };
  courseUrl?: string;
  readmeUrl?: string;
  rtDoms?: React.ReactNode[];
}>(({ nodeTemplate, courseUrl, readmeUrl, rtDoms }) => {
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

    const guideReadmeUrl = nodeTemplate?.readmeUrl || readmeUrl;
    const guideCourseUrl = nodeTemplate?.courseUrl || courseUrl;

    if (guideCourseUrl || guideReadmeUrl || nodeTemplate?.userGuide) {
      result.push(
        <UseGuideModal
          key="userGuide"
          title={nodeTemplate?.name}
          iconSrc={nodeTemplate?.avatar}
          text={nodeTemplate?.userGuide}
          link={guideCourseUrl}
          readmeUrl={guideReadmeUrl}
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
  }, [nodeTemplate, courseUrl, readmeUrl, rtDoms, t]);

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
    const errorText =
      error || (status === PluginStatusEnum.Offline ? 'common:error.tool_not_exist' : undefined);

    if (errorText) {
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
          <Box color={'red.600'}>{t(errorText as any)}</Box>
        </Flex>
      );
    }
    if (status !== undefined && status !== PluginStatusEnum.Normal) {
      const statusLabelMap: Partial<Record<PluginStatusType, string>> = {
        [PluginStatusEnum.Hidden]: t('app:toolkit_status_hidden'),
        [PluginStatusEnum.SoonOffline]: t('app:toolkit_status_soon_offline')
      };
      const statusTooltipMap: Partial<Record<PluginStatusType, string>> = {
        [PluginStatusEnum.Hidden]: t('app:tool_hidden_tips'),
        [PluginStatusEnum.SoonOffline]: t('app:tool_soon_offset_tips')
      };
      return (
        <MyTooltip label={statusTooltipMap[status]}>
          <MyTag mr={2} colorSchema={PluginStatusMap[status].tagColor} type="borderFill">
            {statusLabelMap[status]}
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
  readmeUrl,
  hasSystemSecret,
  pluginId,
  source,
  systemKeyCost,
  inputConfig
}: {
  nodeId: string;
  isFolder?: boolean;
  courseUrl?: string;
  readmeUrl?: string;
  hasSystemSecret?: boolean;
  pluginId?: string;
  source?: string;
  systemKeyCost?: number;
  inputConfig: FlowNodeInputItemType | undefined;
}) {
  const { t } = useTranslation();
  // 密钥配置只会落在 systemInputConfig 记录上：提交走字段句柄，等价旧 onChangeNode updateInput。
  const inputField = useField({
    nodeId,
    fieldKey: NodeInputKeyEnum.systemInputConfig,
    kind: 'input'
  });

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
            inputField?.setValue(data);
            onCloseToolParamConfigModal();
          }}
          courseUrl={courseUrl}
          readmeUrl={readmeUrl}
          inputConfig={inputConfig}
          hasSystemSecret={hasSystemSecret}
          parentId={pluginId}
          source={source}
          secretCost={systemKeyCost}
        />
      )}
    </>
  );
});

// Presentation Mode Overlay 组件
const PresentationModeOverlay = React.memo(function PresentationModeOverlay({
  avatar,
  name,
  intro,
  isLoopNode,
  onDoubleClick
}: {
  avatar: string;
  name: string;
  intro?: string;
  isLoopNode: boolean;
  onDoubleClick: () => void;
}) {
  const [presentationHeight, setPresentationHeight] = useState<number>(0);

  const presentationOverlayRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setPresentationHeight(node.offsetHeight);
    }
  }, []);

  return (
    <Flex
      ref={presentationOverlayRef}
      position={'absolute'}
      top={0}
      left={0}
      right={0}
      bottom={0}
      bg={'rgba(255, 255, 255, 0.80)'}
      backdropFilter={'blur(10px)'}
      flexDirection={'column'}
      zIndex={10}
      borderRadius={'lg'}
      {...(isLoopNode
        ? {
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            px: 4,
            py: 4
          }
        : {
            alignItems: 'center',
            justifyContent: 'center',
            px: 3,
            py: 0
          })}
      cursor={'pointer'}
      onDoubleClick={onDoubleClick}
    >
      <Flex
        flexDirection={'column'}
        {...(isLoopNode
          ? {
              ml: 4,
              mt: 4,
              alignItems: 'flex-start'
            }
          : {
              ml: 0,
              mt: 0,
              alignItems: 'center'
            })}
        w={'full'}
        color={'black'}
      >
        <Avatar src={avatar} fill={'none'} borderRadius={24} w={'160px'} h={'160px'} />
        {name && presentationHeight > 280 && (
          <Box
            mt={2}
            fontSize={'36px'}
            fontWeight={'medium'}
            textAlign={isLoopNode ? 'left' : 'center'}
            overflow={'hidden'}
            textOverflow={'ellipsis'}
            whiteSpace={'nowrap'}
            maxW={'80%'}
          >
            {name}
          </Box>
        )}
        {intro && presentationHeight > 320 && (
          <Box
            mt={1}
            fontSize={'28px'}
            textAlign={isLoopNode ? 'left' : 'center'}
            overflow={'hidden'}
            textOverflow={'ellipsis'}
            whiteSpace={'nowrap'}
            maxW={'80%'}
          >
            {intro}
          </Box>
        )}
      </Flex>
    </Flex>
  );
});
