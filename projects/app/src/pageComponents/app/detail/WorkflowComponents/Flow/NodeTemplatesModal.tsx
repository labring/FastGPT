import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { type Node } from 'reactflow';
import NodeTemplateListHeader from './components/NodeTemplates/header';
import NodeTemplateList from './components/NodeTemplates/list';
import { useNodeTemplates } from './components/NodeTemplates/useNodeTemplates';
import { Box } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useMemoizedFn } from 'ahooks';
import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../context/workflowInitContext';
import { WorkflowActionsContext } from '../context/workflowActionsContext';

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
    <>
      <Box
        zIndex={2}
        display={isOpen ? 'block' : 'none'}
        position={'absolute'}
        top={0}
        left={0}
        bottom={0}
        w={`${sliderWidth}px`}
        maxW={'100%'}
        onClick={onClose}
        fontSize={'sm'}
      />
      <MyBox
        isLoading={templatesIsLoading}
        display={'flex'}
        zIndex={3}
        flexDirection={'column'}
        position={'absolute'}
        top={20}
        left={0}
        pt={5}
        pb={4}
        h={isOpen ? 'calc(100% - 100px)' : '0'}
        w={isOpen ? ['100%', `${sliderWidth}px`] : '0'}
        bg={'white'}
        boxShadow={'3px 0 20px rgba(0,0,0,0.2)'}
        borderRadius={'0 20px 20px 0'}
        transition={'.2s ease'}
        userSelect={'none'}
        overflow={isOpen ? 'none' : 'hidden'}
      >
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
        <NodeTemplateList
          onAddNode={onAddNode}
          templates={templates}
          templateType={templateType}
          onUpdateParentId={onUpdateParentId}
        />
      </MyBox>
    </>
  );
};

export default React.memo(NodeTemplatesModal);
