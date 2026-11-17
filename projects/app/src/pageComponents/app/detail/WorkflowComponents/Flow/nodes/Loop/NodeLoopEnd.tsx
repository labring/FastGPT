import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { type NodeProps } from 'reactflow';
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
import { WorkflowBufferDataContext } from '../../../context/workflowInitContext';
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

const NodeLoopEnd = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { nodeId, inputs, parentNodeId } = data;
  const { getNodeById } = useContextSelector(WorkflowBufferDataContext, (v) => v);
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const { t } = useTranslation();

  const inputItem = useMemoEnhance(
    () => inputs.find((input) => input.key === NodeInputKeyEnum.nestedEndInput),
    [inputs]
  );

  const parallelRunIntro = useMemoEnhance(() => {
    const parentNode = getNodeById(parentNodeId);
    return parentNode?.flowNodeType === FlowNodeTypeEnum.parallelRun
      ? t('workflow:parallel_run_end_intro')
      : undefined;
  }, [getNodeById, parentNodeId, t]);

  // Get loopEnd input value type
  const valueType = useMemo(() => {
    if (!inputItem || !Array.isArray(inputItem.value)) return;

    const [targetId, outputId] = inputItem.value;
    if (!targetId || !outputId) return;

    const globalNode = getGlobalVariableNode({
      t,
      chatConfig: appDetail.chatConfig
    });
    const node = (() => {
      if (targetId === globalNode.nodeId) return globalNode;
      return getNodeById(targetId);
    })();

    return node?.outputs.find((output) => output.id === outputId)?.valueType as
      | keyof typeof typeMap
      | undefined;
  }, [appDetail.chatConfig, getNodeById, inputItem, t]);

  useEffect(() => {
    const parentNode = getNodeById(parentNodeId);
    if (!parentNode) return;

    // 引用为空或来源节点已删除时回退为 arrayAny，避免父容器残留旧输出类型。
    const newArrayType =
      (valueType ? typeMap[valueType] : undefined) ?? WorkflowIOValueTypeEnum.arrayAny;

    if (parentNode.flowNodeType === FlowNodeTypeEnum.parallelRun) {
      // For parallelRun parent: update parallelSuccessResults output type
      const successOutput = parentNode.outputs.find(
        (output) => output.key === NodeOutputKeyEnum.parallelSuccessResults
      );
      if (successOutput && successOutput.valueType !== newArrayType) {
        onChangeNode({
          nodeId: parentNode.nodeId,
          type: 'updateOutput',
          key: NodeOutputKeyEnum.parallelSuccessResults,
          value: { ...successOutput, valueType: newArrayType }
        });
      }
    } else {
      // For loop parent: update nestedArrayResult output type
      const parentNodeOutput = parentNode.outputs.find(
        (output) => output.key === NodeOutputKeyEnum.nestedArrayResult
      );
      if (parentNodeOutput && parentNodeOutput.valueType !== newArrayType) {
        onChangeNode({
          nodeId: parentNode.nodeId,
          type: 'updateOutput',
          key: NodeOutputKeyEnum.nestedArrayResult,
          value: { ...parentNodeOutput, valueType: newArrayType }
        });
      }
    }
  }, [valueType, onChangeNode, parentNodeId, getNodeById]);

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
