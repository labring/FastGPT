import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useTranslation } from 'react-i18next';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import VariableTable from './NodePluginIO/VariableTable';
import { Box } from '@chakra-ui/react';
import React, { useEffect } from 'react';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const typeMap = {
  [WorkflowIOValueTypeEnum.arrayString]: WorkflowIOValueTypeEnum.string,
  [WorkflowIOValueTypeEnum.arrayNumber]: WorkflowIOValueTypeEnum.number,
  [WorkflowIOValueTypeEnum.arrayBoolean]: WorkflowIOValueTypeEnum.boolean,
  [WorkflowIOValueTypeEnum.arrayObject]: WorkflowIOValueTypeEnum.object,
  [WorkflowIOValueTypeEnum.arrayAny]: WorkflowIOValueTypeEnum.any
};

const NodeLoopStart = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId } = data;
  const { nodes, nodeList, onChangeNode } = useContextSelector(WorkflowContext, (v) => v);
  const loopStartNode = nodes.find((node) => node.id === nodeId);
  const parentNode = nodes.find((node) => node.id === loopStartNode?.data.parentNodeId);
  const arrayInput = parentNode?.data.inputs.find(
    (input) => input.key === NodeInputKeyEnum.loopInputArray
  );

  const outputValueType = !!arrayInput?.value
    ? nodeList
        .find((node) => node.nodeId === arrayInput?.value[0])
        ?.outputs.find((output) => output.id === arrayInput?.value[1])?.valueType
    : undefined;

  useEffect(() => {
    if (
      !outputValueType &&
      loopStartNode?.data.outputs.find(
        (output) => output.key === NodeOutputKeyEnum.loopArrayElement
      )
    ) {
      onChangeNode({
        nodeId,
        type: 'delOutput',
        key: NodeOutputKeyEnum.loopArrayElement
      });
    } else if (
      outputValueType &&
      !loopStartNode?.data.outputs.find(
        (output) => output.key === NodeOutputKeyEnum.loopArrayElement
      )
    ) {
      onChangeNode({
        nodeId,
        type: 'addOutput',
        value: {
          id: NodeOutputKeyEnum.loopArrayElement,
          key: NodeOutputKeyEnum.loopArrayElement,
          label: t('workflow:Array_element'),
          type: FlowNodeOutputTypeEnum.static,
          valueType: typeMap[outputValueType as keyof typeof typeMap]
        }
      });
    }
  }, [onChangeNode, outputValueType]);

  return (
    <NodeCard
      selected={selected}
      {...data}
      w={'420px'}
      h={'176px'}
      menuForbid={{
        copy: true,
        delete: true,
        debug: true
      }}
    >
      <Box px={4}>
        {!outputValueType ? (
          <EmptyTip
            text={t('workflow:loop_start_tip')}
            py={0}
            mt={0}
            iconH={'32px'}
            iconW={'32px'}
          />
        ) : (
          <VariableTable
            variables={[
              {
                icon: 'core/workflow/inputType/array',
                label: '数组元素',
                type: typeMap[outputValueType as keyof typeof typeMap],
                key: t('workflow:Array_element')
              }
            ]}
          />
        )}
      </Box>
    </NodeCard>
  );
};

export default React.memo(NodeLoopStart);
