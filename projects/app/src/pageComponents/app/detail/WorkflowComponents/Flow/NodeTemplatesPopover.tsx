import { applyWorkflowStartInputAutoFill } from '@/web/core/workflow/utils';
import { Popover, PopoverBody, PopoverContent } from '@chakra-ui/react';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  EDGE_TYPE,
  FlowNodeTypeEnum,
  isNestedChildSystemNodeType
} from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useMemoizedFn } from 'ahooks';
import React from 'react';
import { type Node } from 'reactflow';
import { useContextSelector } from 'use-context-selector';
import { WorkflowActionsContext } from '../context/workflowActionsContext';
import { WorkflowBufferDataContext } from '../context/workflowInitContext';
import { WorkflowModalContext } from '../context/workflowModalContext';
import NodeTemplateListHeader from './components/NodeTemplates/header';
import NodeTemplateList from './components/NodeTemplates/list';
import { useNodeTemplates } from './components/NodeTemplates/useNodeTemplates';
import { popoverHeight, popoverWidth } from './hooks/useWorkflow';

const NodeTemplatesPopover = () => {
  const { handleParams, setHandleParams } = useContextSelector(WorkflowModalContext, (v) => v);

  const { setNodes, setEdges, getNodeById } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
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
    toolTags,
    selectedTagIds,
    setSelectedTagIds
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

    if (!handleParams) return;
    const isToolHandle = handleParams?.handleId === 'selectedTools';

    const newEdges = newNodes
      .filter((node) => {
        // Exclude nodes that don't meet the conditions
        // 1. Tool set nodes must be connected through tool handle
        if (!isToolHandle && node.data.flowNodeType === FlowNodeTypeEnum.toolSet) {
          return false;
        }

        // 2. Exclude loop start and end nodes
        if (isNestedChildSystemNodeType(node.data.flowNodeType)) {
          return false;
        }

        // 3. Tool handle can only connect to tool nodes
        if (isToolHandle && !node.data.isTool) {
          return false;
        }

        return true;
      })
      .map((node) => ({
        id: getNanoid(),
        source: handleParams.nodeId as string,
        sourceHandle: handleParams.handleId,
        target: node.id,
        targetHandle: isToolHandle ? 'selectedTools' : `${node.id}-target-left`,
        type: EDGE_TYPE
      }));

    setEdges((state) => {
      const newState = state.concat(newEdges);
      return newState;
    });

    const sourceNode = getNodeById(handleParams.nodeId);
    if (sourceNode?.flowNodeType === FlowNodeTypeEnum.workflowStart) {
      newNodes.forEach((node) => {
        const nextInputs = applyWorkflowStartInputAutoFill({
          inputs: node.data.inputs,
          workflowStartNodeId: sourceNode.nodeId,
          workflowStartOutputs: sourceNode.outputs
        });

        nextInputs.forEach((input) => {
          const prevInput = node.data.inputs.find((item) => item.key === input.key);
          if (prevInput && prevInput.value !== input.value) {
            onChangeNode({
              nodeId: node.data.nodeId,
              type: 'updateInput',
              key: input.key,
              value: input
            });
          }
        });
      });
    }

    setHandleParams(null);

    setTimeout(() => {
      newNodes.forEach((node) => {
        onRefreshSingleNodeWorkflowCheckIssues(node.data.nodeId);
      });
    }, 0);
  });

  if (!handleParams) return null;

  return (
    <Popover
      isOpen={!!handleParams}
      onClose={() => setHandleParams(null)}
      closeOnBlur={true}
      closeOnEsc={true}
      autoFocus={true}
      isLazy
    >
      <PopoverContent
        position="fixed"
        top={`${handleParams.popoverPosition.y}px`}
        left={`${handleParams.popoverPosition.x + 10}px`}
        width={popoverWidth}
        height={popoverHeight}
        boxShadow="3px 0 20px rgba(0,0,0,0.2)"
        border={'none'}
      >
        <PopoverBody padding={0} h={'full'}>
          <MyBox
            isLoading={templatesIsLoading}
            display={'flex'}
            flexDirection={'column'}
            py={4}
            h={'full'}
            userSelect="none"
          >
            <NodeTemplateListHeader
              isPopover={true}
              templateType={templateType}
              onUpdateTemplateType={onUpdateTemplateType}
              parentId={parentId}
              parentSource={parentSource}
              onUpdateParentId={onUpdateParentId}
              searchKey={searchKey}
              setSearchKey={setSearchKey}
              toolTags={toolTags}
              selectedTagIds={selectedTagIds}
              setSelectedTagIds={setSelectedTagIds}
            />
            <NodeTemplateList
              onAddNode={onAddNode}
              isPopover={true}
              templates={templates}
              templateType={templateType}
              onUpdateParentId={onUpdateParentId}
            />
          </MyBox>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
};

export default React.memo(NodeTemplatesPopover);
