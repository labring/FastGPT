import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { type Node, type NodeProps, useNodesData, useReactFlow } from '@xyflow/react';
import NodeCard from '../render/NodeCard';
import Reference from '../render/RenderInput/templates/Reference';
import { Box } from '@chakra-ui/react';
import React, { useEffect, useMemo } from 'react';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../../../context';
import { useTranslation } from 'next-i18next';
import { getGlobalVariableNode } from '@/web/core/workflow/adapt';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';

const typeMap = {
  [WorkflowIOValueTypeEnum.string]: WorkflowIOValueTypeEnum.arrayString,
  [WorkflowIOValueTypeEnum.number]: WorkflowIOValueTypeEnum.arrayNumber,
  [WorkflowIOValueTypeEnum.boolean]: WorkflowIOValueTypeEnum.arrayBoolean,
  [WorkflowIOValueTypeEnum.object]: WorkflowIOValueTypeEnum.arrayObject,
  [WorkflowIOValueTypeEnum.any]: WorkflowIOValueTypeEnum.arrayAny
};

const NodeLoopEnd = ({ data, selected }: NodeProps<Node<FlowNodeItemType>>) => {
  const { nodeId, inputs, parentNodeId } = data;
  const { getNode } = useReactFlow<Node<FlowNodeItemType>>();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const { t } = useTranslation();

  const inputItem = useMemoEnhance(
    () => inputs.find((input) => input.key === NodeInputKeyEnum.nestedEndInput),
    [inputs]
  );

  const parentNode = useNodesData<Node<FlowNodeItemType>>(parentNodeId ?? '');

  const parallelRunIntro = useMemoEnhance(() => {
    return parentNode?.data?.flowNodeType === FlowNodeTypeEnum.parallelRun
      ? t('workflow:parallel_run_end_intro')
      : undefined;
  }, [parentNode?.data?.flowNodeType, t]);

  // Get loopEnd input value type
  const valueType = useMemo(() => {
    if (!inputItem) return;

    const targetId = inputItem.value[0];

    const globalNode = getGlobalVariableNode({
      t,
      chatConfig: appDetail.chatConfig
    });
    const node =
      targetId === globalNode.nodeId ? globalNode : targetId ? getNode(targetId)?.data : undefined;

    return node?.outputs.find((output) => output.id === inputItem?.value[1])
      ?.valueType as keyof typeof typeMap;
  }, [appDetail.chatConfig, getNode, inputItem, t]);

  useEffect(() => {
    if (!valueType) return;

    const parentNodeData = parentNode?.data;
    if (!parentNodeData) return;

    const newArrayType = typeMap[valueType] ?? WorkflowIOValueTypeEnum.arrayAny;

    if (parentNodeData.flowNodeType === FlowNodeTypeEnum.parallelRun) {
      // For parallelRun parent: update parallelSuccessResults output type
      const successOutput = parentNodeData.outputs.find(
        (output) => output.key === NodeOutputKeyEnum.parallelSuccessResults
      );
      if (successOutput && successOutput.valueType !== newArrayType) {
        onChangeNode({
          nodeId: parentNodeData.nodeId,
          type: 'updateOutput',
          key: NodeOutputKeyEnum.parallelSuccessResults,
          value: { ...successOutput, valueType: newArrayType }
        });
      }
    } else {
      // For loop parent: update nestedArrayResult output type
      const parentNodeOutput = parentNodeData.outputs.find(
        (output) => output.key === NodeOutputKeyEnum.nestedArrayResult
      );
      if (parentNodeOutput && parentNodeOutput.valueType !== newArrayType) {
        onChangeNode({
          nodeId: parentNodeData.nodeId,
          type: 'updateOutput',
          key: NodeOutputKeyEnum.nestedArrayResult,
          value: { ...parentNodeOutput, valueType: newArrayType }
        });
      }
    }
  }, [valueType, nodeId, onChangeNode, parentNode?.data]);

  return (
    <NodeCard
      selected={selected}
      {...data}
      {...(parallelRunIntro && { intro: parallelRunIntro })}
      w={'420px'}
      menuForbid={{
        copy: true,
        delete: true,
        debug: true
      }}
    >
      <Box px={4} pb={4} pt={2}>
        {inputItem && <Reference item={inputItem} nodeId={nodeId} />}
      </Box>
    </NodeCard>
  );
};

export default React.memo(NodeLoopEnd);
