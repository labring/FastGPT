import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { WorkflowNodeData } from '@fastgpt/global/core/workflow/editor/types';
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
import { AppContext } from '../../../../context';
import { useTranslation } from 'next-i18next';
import { getGlobalVariableNode } from '@/web/core/workflow/adapt';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useDocumentGetNodeById } from '../render/useWorkflowDocument';
import { useNode, useNodeActions } from '@/web/core/workflow/editor/react/useNode';

const typeMap = {
  [WorkflowIOValueTypeEnum.string]: WorkflowIOValueTypeEnum.arrayString,
  [WorkflowIOValueTypeEnum.number]: WorkflowIOValueTypeEnum.arrayNumber,
  [WorkflowIOValueTypeEnum.boolean]: WorkflowIOValueTypeEnum.arrayBoolean,
  [WorkflowIOValueTypeEnum.object]: WorkflowIOValueTypeEnum.arrayObject,
  [WorkflowIOValueTypeEnum.any]: WorkflowIOValueTypeEnum.arrayAny
};

const NodeLoopEnd = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { nodeId, parentNodeId } = data;
  const inputs = useNode<FlowNodeItemType['inputs']>(nodeId, (node) => node?.data.inputs) ?? [];
  // 引用目标的输出类型要跨节点查询：读走文档图查询面，父容器输出用 adapter 句柄写。
  const getNodeById = useDocumentGetNodeById();
  const parentId = parentNodeId ?? '';
  const parentData = useNode<WorkflowNodeData>(parentId, (node) => node?.data);
  const parentNodeActions = useNodeActions(parentId);
  const parentFlowNodeType = parentData?.flowNodeType;
  const parentOutputs = parentData?.outputs;
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const { t } = useTranslation();

  const inputItem = useMemoEnhance(
    () => inputs.find((input) => input.key === NodeInputKeyEnum.nestedEndInput),
    [inputs]
  );

  const parallelRunIntro = useMemoEnhance(() => {
    return parentFlowNodeType === FlowNodeTypeEnum.parallelRun
      ? t('workflow:parallel_run_end_intro')
      : undefined;
  }, [parentFlowNodeType, t]);

  // Get loopEnd input value type
  const valueType = useMemo(() => {
    if (!inputItem) return;

    const targetId = inputItem.value[0];

    const globalNode = getGlobalVariableNode({
      t,
      chatConfig: appDetail.chatConfig
    });
    const node = (() => {
      if (targetId === globalNode.nodeId) return globalNode;
      return getNodeById(targetId);
    })();

    return node?.outputs.find((output) => output.id === inputItem?.value[1])
      ?.valueType as keyof typeof typeMap;
  }, [appDetail.chatConfig, getNodeById, inputItem, t]);

  useEffect(() => {
    if (!valueType) return;

    if (!parentOutputs) return;

    // 父容器是并行运行还是循环，决定同步哪一个聚合输出的类型。
    const outputKey =
      parentFlowNodeType === FlowNodeTypeEnum.parallelRun
        ? NodeOutputKeyEnum.parallelSuccessResults
        : NodeOutputKeyEnum.nestedArrayResult;
    const targetOutput = parentOutputs.find((output) => output.key === outputKey);
    const newArrayType = typeMap[valueType] ?? WorkflowIOValueTypeEnum.arrayAny;
    if (!targetOutput || targetOutput.valueType === newArrayType) return;

    parentNodeActions?.updateNode((current) => ({
      outputs: current.outputs.map((output) =>
        output.key === outputKey ? { ...output, valueType: newArrayType } : output
      )
    }));
  }, [parentFlowNodeType, parentNodeActions, parentOutputs, valueType]);

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
