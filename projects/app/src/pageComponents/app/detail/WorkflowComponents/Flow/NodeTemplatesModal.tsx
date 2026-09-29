import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useReactFlow, useEdges, useNodes, type Node } from '@xyflow/react';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import NodeTemplateListHeader from './components/NodeTemplates/header';
import NodeTemplateList from './components/NodeTemplates/list';
import { useNodeTemplates } from './components/NodeTemplates/useNodeTemplates';
import { buildNodeTemplateContext } from '@fastgpt/global/core/workflow/template/context';
import { useMemoizedFn } from 'ahooks';
import React, { useCallback, useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowActionsContext } from '../context/workflowActionsContext';
import AppDetailPanelModal from '../../components/AppDetailPanelModal';

type ModuleTemplateListProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const sliderWidth = 460;

const NodeTemplatesModal = ({ isOpen, onClose }: ModuleTemplateListProps) => {
  const { setNodes, getNode } = useReactFlow<Node<FlowNodeItemType>>();
  const edges = useEdges();
  const nodes = useNodes<Node<FlowNodeItemType>>();

  const getNodeById = useCallback(
    (nodeId: string | null | undefined) => (nodeId ? getNode(nodeId)?.data : undefined),
    [getNode]
  );
  const hasToolNode = useMemo(
    () =>
      nodes.some(
        (n) =>
          n.data.flowNodeType === FlowNodeTypeEnum.tool ||
          n.data.flowNodeType === FlowNodeTypeEnum.toolSet
      ),
    [nodes]
  );
  const hasLoopRunNode = useMemo(
    () => nodes.some((n) => n.data.flowNodeType === FlowNodeTypeEnum.loopRun),
    [nodes]
  );
  const onRefreshSingleNodeWorkflowCheckIssues = useContextSelector(
    WorkflowActionsContext,
    (v) => v.onRefreshSingleNodeWorkflowCheckIssues
  );

  const templateContext = React.useMemo(
    () =>
      buildNodeTemplateContext({
        sourceNode: undefined,
        edges,
        getNodeById,
        isSidebar: true,
        hasToolNode,
        hasLoopRunNode
      }),
    [edges, getNodeById, hasToolNode, hasLoopRunNode]
  );

  const {
    templateType,
    parentId,
    parentSource,
    searchKey,
    setSearchKey,
    templatesIsLoading,
    templates,
    TeamScrollData,
    onUpdateTemplateType,
    onUpdateParentId,
    selectedTagIds,
    setSelectedTagIds,
    toolTags
  } = useNodeTemplates(templateContext);

  const onAddNode = useMemoizedFn(async ({ newNodes }: { newNodes: Node<FlowNodeItemType>[] }) => {
    setNodes((state) => [
      ...state.map((node) => ({
        ...node,
        selected: false
      })),
      ...newNodes
    ]);

    // 新增节点后立即同步下方待完善提示，不依赖 10s 定时扫描或用户首次编辑。
    setTimeout(() => {
      onRefreshSingleNodeWorkflowCheckIssues(newNodes[0]?.data.nodeId ?? '');
    }, 0);
  });

  return (
    <AppDetailPanelModal
      isOpen={isOpen}
      onClose={onClose}
      isLoading={templatesIsLoading}
      width={['100%', `${sliderWidth}px`]}
      height={['100vh', 'calc(100vh - 67px)']}
      top={[0, '67px']}
      position={'fixed'}
      placement={'left'}
      showMask={false}
      headerProps={{
        minH: 0,
        px: 0,
        pt: 5,
        flexDirection: 'column',
        alignItems: 'stretch',
        fontSize: 'sm'
      }}
      contentProps={{
        pb: 4,
        userSelect: 'none',
        fontSize: 'sm'
      }}
      header={
        <NodeTemplateListHeader
          onClose={onClose}
          templateType={templateType}
          onUpdateTemplateType={onUpdateTemplateType}
          parentId={parentId}
          parentSource={parentSource}
          searchKey={searchKey}
          setSearchKey={setSearchKey}
          onUpdateParentId={onUpdateParentId}
          selectedTagIds={selectedTagIds}
          setSelectedTagIds={setSelectedTagIds}
          toolTags={toolTags}
        />
      }
    >
      <NodeTemplateList
        onAddNode={onAddNode}
        templates={templates}
        templateType={templateType}
        onUpdateParentId={onUpdateParentId}
        ScrollData={TeamScrollData}
      />
    </AppDetailPanelModal>
  );
};

export default React.memo(NodeTemplatesModal);
