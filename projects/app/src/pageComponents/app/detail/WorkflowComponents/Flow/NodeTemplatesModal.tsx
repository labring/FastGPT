import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { type Node } from 'reactflow';
import NodeTemplateListHeader from './components/NodeTemplates/header';
import NodeTemplateList from './components/NodeTemplates/list';
import { useNodeTemplates } from './components/NodeTemplates/useNodeTemplates';
import { useMemoizedFn } from 'ahooks';
import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../context/workflowInitContext';
import { WorkflowActionsContext } from '../context/workflowActionsContext';
import AppDetailPanelModal from '../../components/AppDetailPanelModal';

type ModuleTemplateListProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const sliderWidth = 460;

const NodeTemplatesModal = ({ isOpen, onClose }: ModuleTemplateListProps) => {
  const setNodes = useContextSelector(WorkflowBufferDataContext, (v) => v.setNodes);
  const onRefreshSingleNodeWorkflowCheckIssues = useContextSelector(
    WorkflowActionsContext,
    (v) => v.onRefreshSingleNodeWorkflowCheckIssues
  );

  const {
    templateType,
    parentId,
    parentSource,
    searchKey,
    setSearchKey,
    templatesIsLoading,
    templates,
    onUpdateTemplateType,
    onUpdateParentId,
    selectedTagIds,
    setSelectedTagIds,
    toolTags
  } = useNodeTemplates();

  const onAddNode = useMemoizedFn(async ({ newNodes }: { newNodes: Node<FlowNodeItemType>[] }) => {
    setNodes((state) => {
      const newState = state
        .map((node) => ({
          ...node,
          selected: false
        }))
        // @ts-ignore
        .concat(newNodes);
      return newState;
    });

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
      animationMode={'slideFromLeft'}
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
      />
    </AppDetailPanelModal>
  );
};

export default React.memo(NodeTemplatesModal);
