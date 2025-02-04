import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { NodeProps } from 'reactflow';
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
import { WorkflowContext } from '../../../context';
import { AppContext } from '../../../../context';
import { useTranslation } from 'next-i18next';
import { getGlobalVariableNode } from '@/web/core/workflow/adapt';

const typeMap = {
  [WorkflowIOValueTypeEnum.string]: WorkflowIOValueTypeEnum.arrayString,
  [WorkflowIOValueTypeEnum.number]: WorkflowIOValueTypeEnum.arrayNumber,
  [WorkflowIOValueTypeEnum.boolean]: WorkflowIOValueTypeEnum.arrayBoolean,
  [WorkflowIOValueTypeEnum.object]: WorkflowIOValueTypeEnum.arrayObject,
  [WorkflowIOValueTypeEnum.any]: WorkflowIOValueTypeEnum.arrayAny
};

const NodeLoopEnd = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { nodeId, inputs, parentNodeId } = data;
  const { nodeList, onChangeNode } = useContextSelector(WorkflowContext, (v) => v);
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const { t } = useTranslation();

  const inputItem = useMemo(
    () => inputs.find((input) => input.key === NodeInputKeyEnum.loopEndInput),
    [inputs]
  );

  // Get loopEnd input value type
  const valueType = useMemo(() => {
    if (!inputItem) return;

    const referenceNode = [
      ...nodeList,
      getGlobalVariableNode({ nodes: nodeList, t, chatConfig: appDetail.chatConfig })
    ].find((node) => node.nodeId === inputItem.value[0]);

    return referenceNode?.outputs.find((output) => output.id === inputItem?.value[1])
      ?.valueType as keyof typeof typeMap;
  }, [appDetail.chatConfig, inputItem, nodeList, t]);

  useEffect(() => {
    if (!valueType) return;

    const parentNode = nodeList.find((node) => node.nodeId === parentNodeId);
    const parentNodeOutput = parentNode?.outputs.find(
      (output) => output.key === NodeOutputKeyEnum.loopArray
    );

    if (parentNode && parentNodeOutput) {
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
  }, [valueType, nodeList, nodeId, onChangeNode, parentNodeId]);

  const Render = useMemo(() => {
    return (
      <NodeCard
        selected={selected}
        {...data}
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
  }, [data, inputItem, nodeId, selected]);

  return Render;
};

export default React.memo(NodeLoopEnd);
