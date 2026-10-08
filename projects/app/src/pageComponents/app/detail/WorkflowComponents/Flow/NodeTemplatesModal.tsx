import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { type Node } from 'reactflow';
import NodeTemplateListHeader from './components/NodeTemplates/header';
import NodeTemplateList from './components/NodeTemplates/list';
import { useNodeTemplates } from './components/NodeTemplates/useNodeTemplates';
import { useMemoizedFn } from 'ahooks';
import React from 'react';
import { usePlacementContext } from '@/web/core/workflow/editor/react/useWorkflowQueries';
import { useWorkflowActions } from '@/web/core/workflow/editor/react/useWorkflow';
import { canvasNodeToStoreNode } from '@/web/core/workflow/editor/canvas/canvasTypes';
import { useClearCanvasSelection } from './canvas/useCanvasController';
import AppDetailPanelModal, { usePanelContentMounted } from '../../components/AppDetailPanelModal';

type ModuleTemplateListProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const sliderWidth = 460;

const NodeTemplatesModal = ({ isOpen, onClose }: ModuleTemplateListProps) => {
  const actions = useWorkflowActions();
  const clearCanvasSelection = useClearCanvasSelection();
  // 收起动画跑完再卸载头部与列表，否则内容会在动画第一帧就消失。
  const isContentMounted = usePanelContentMounted(isOpen);
  // 侧边栏是 root context：候选集与 unique 过滤全部由 Runtime 按文档根派生。
  const templateContext = usePlacementContext({ isSidebar: true });

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
    clearCanvasSelection();
    // 新增节点的问题由 Runtime 在 addNode 事务后自行刷新，画布不需要额外触发。
    return actions.addNodes(newNodes.map(canvasNodeToStoreNode));
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
      // 收起后不挂 DOM：模板列表与头部标签栏都是重内容，挂着会跟着每次文档提交重渲染。
      header={
        isContentMounted ? (
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
        ) : undefined
      }
    >
      {isContentMounted && (
        <NodeTemplateList
          onAddNode={onAddNode}
          templates={templates}
          templateType={templateType}
          onUpdateParentId={onUpdateParentId}
          ScrollData={TeamScrollData}
        />
      )}
    </AppDetailPanelModal>
  );
};

export default React.memo(NodeTemplatesModal);
