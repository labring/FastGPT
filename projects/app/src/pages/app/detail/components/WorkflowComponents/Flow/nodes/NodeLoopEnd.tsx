import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import Reference from './render/RenderInput/templates/Reference';
import { Box } from '@chakra-ui/react';
import React, { useEffect, useMemo } from 'react';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import { AppContext } from '../../../context';
import { useTranslation } from 'react-i18next';
import { getGlobalVariableNode } from '@/web/core/workflow/adapt';

const typeMap = {
  [WorkflowIOValueTypeEnum.string]: WorkflowIOValueTypeEnum.arrayString,
  [WorkflowIOValueTypeEnum.number]: WorkflowIOValueTypeEnum.arrayNumber,
  [WorkflowIOValueTypeEnum.boolean]: WorkflowIOValueTypeEnum.arrayBoolean,
  [WorkflowIOValueTypeEnum.object]: WorkflowIOValueTypeEnum.arrayObject,
  [WorkflowIOValueTypeEnum.any]: WorkflowIOValueTypeEnum.arrayAny
};

const NodeLoopEnd = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { nodeId, inputs } = data;
  const { nodeList, onChangeNode } = useContextSelector(WorkflowContext, (v) => v);
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const { t } = useTranslation();

  const inputItem = useMemo(
    () => inputs.find((input) => input.key === NodeInputKeyEnum.loopOutputArrayElement),
    [inputs]
  );

  const global = useMemo(
    () => getGlobalVariableNode({ nodes: nodeList, t, chatConfig: appDetail.chatConfig }),
    [nodeList, t, appDetail.chatConfig]
  );
  const inputItemValueNode = useMemo(
    () => [...nodeList, global].find((node) => node.nodeId === inputItem?.value[0]),
    [nodeList, inputItem]
  );
  const inputItemValueOutput = useMemo(
    () => inputItemValueNode?.outputs.find((output) => output.id === inputItem?.value[1]),
    [inputItemValueNode]
  );
  const valueType = inputItemValueOutput?.valueType;

  useEffect(() => {
    if (valueType) {
      const currentNode = nodeList.find((node) => node.nodeId === nodeId);
      const parentNode = nodeList.find((node) => node.nodeId === currentNode?.parentNodeId);
      const parentNodeOutput = parentNode?.outputs.find(
        (output) => output.key === NodeOutputKeyEnum.loopArray
      );

      if (!!parentNode && !!parentNodeOutput) {
        onChangeNode({
          nodeId: parentNode.nodeId,
          type: 'updateOutput',
          key: NodeOutputKeyEnum.loopArray,
          value: {
            ...parentNodeOutput,
            valueType:
              typeMap[valueType as keyof typeof typeMap] ?? WorkflowIOValueTypeEnum.arrayAny
          }
        });
      }
    }
  }, [valueType, nodeList, nodeId, onChangeNode, typeMap]);

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
      <Box px={4} pb={4}>
        {inputItem && <Reference item={inputItem} nodeId={nodeId} />}
      </Box>
    </NodeCard>
  );
};

export default React.memo(NodeLoopEnd);
