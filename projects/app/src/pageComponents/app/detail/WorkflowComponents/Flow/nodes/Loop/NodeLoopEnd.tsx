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
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../../context/workflowInitContext';
import { AppContext } from '../../../../context';
import { useTranslation } from 'next-i18next';
import { getGlobalVariableNode } from '@/web/core/workflow/adapt';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const typeMap = {
  [WorkflowIOValueTypeEnum.string]: WorkflowIOValueTypeEnum.arrayString,
  [WorkflowIOValueTypeEnum.number]: WorkflowIOValueTypeEnum.arrayNumber,
  [WorkflowIOValueTypeEnum.boolean]: WorkflowIOValueTypeEnum.arrayBoolean,
  [WorkflowIOValueTypeEnum.object]: WorkflowIOValueTypeEnum.arrayObject,
  [WorkflowIOValueTypeEnum.any]: WorkflowIOValueTypeEnum.arrayAny
};

const menuForbid = {
  copy: true,
  delete: true,
  debug: true
} as const;

const NodeLoopEnd = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { nodeId, inputs, parentNodeId } = data;
  const { getNodeById, systemConfigNode } = useContextSelector(WorkflowBufferDataContext, (v) => v);
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const { t } = useTranslation();

  const inputItem = useMemoEnhance(
    () => inputs.find((input) => input.key === NodeInputKeyEnum.loopEndInput),
    [inputs]
  );

  const valueType = useMemo(() => {
    if (!inputItem?.value?.length) return;

    const targetId = inputItem.value[0];

    const globalNode = getGlobalVariableNode({
      systemConfigNode,
      t,
      chatConfig: appDetail.chatConfig
    });
    const node = (() => {
      if (targetId === globalNode.nodeId) return globalNode;
      return getNodeById(targetId);
    })();

    return node?.outputs.find((output) => output.id === inputItem?.value[1])
      ?.valueType as keyof typeof typeMap;
  }, [appDetail.chatConfig, getNodeById, inputItem, systemConfigNode, t]);

  useEffect(() => {
    if (!valueType) return;

    const parentNode = getNodeById(parentNodeId);
    if (
      !parentNode ||
      parentNode.flowNodeType === FlowNodeTypeEnum.loopPro ||
      (parentNode.flowNodeType !== FlowNodeTypeEnum.loop &&
        parentNode.flowNodeType !== FlowNodeTypeEnum.batch)
    ) {
      return;
    }

    const parentNodeOutput = parentNode.outputs.find(
      (output) => output.key === NodeOutputKeyEnum.loopArray
    );

    if (parentNodeOutput) {
      onChangeNode({
        nodeId: parentNode.nodeId,
        type: 'updateOutput',
        key: NodeOutputKeyEnum.loopArray,
        value: {
          ...parentNodeOutput,
          valueType: typeMap[valueType] ?? WorkflowIOValueTypeEnum.arrayAny
        }
      });
    }
  }, [valueType, nodeId, onChangeNode, parentNodeId, getNodeById]);

  const parentForStyle = getNodeById(parentNodeId);
  const isUnderLoopPro = parentForStyle?.flowNodeType === FlowNodeTypeEnum.loopPro;
  const isUnderBatchOrLoop =
    parentForStyle?.flowNodeType === FlowNodeTypeEnum.loop ||
    parentForStyle?.flowNodeType === FlowNodeTypeEnum.batch;

  const displayName = isUnderBatchOrLoop ? t('workflow:loop_graph_end') : t('workflow:loop_end');
  const intro =
    data.intro && String(data.intro).trim()
      ? data.intro
      : isUnderBatchOrLoop
        ? 'workflow:loop_graph_end_intro'
        : 'workflow:loop_end_intro';

  const avatar = isUnderLoopPro ? 'core/workflow/template/loopProEnd' : data.avatar;
  const avatarLinear = data.avatarLinear;
  const colorSchema = isUnderLoopPro ? 'workflowLoop' : data.colorSchema;

  return (
    <NodeCard
      selected={selected}
      {...data}
      name={displayName}
      intro={intro}
      w={'420px'}
      avatar={avatar}
      avatarLinear={avatarLinear}
      colorSchema={colorSchema}
      menuForbid={menuForbid}
    >
      {isUnderBatchOrLoop && inputItem ? (
        <Box px={4} pb={4} pt={2}>
          <Reference item={inputItem} nodeId={nodeId} />
        </Box>
      ) : null}
    </NodeCard>
  );
};

export default React.memo(NodeLoopEnd);
