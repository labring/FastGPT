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
import { useEffect } from 'react';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const typeMap = {
  [WorkflowIOValueTypeEnum.arrayString]: 'String',
  [WorkflowIOValueTypeEnum.arrayNumber]: 'Number',
  [WorkflowIOValueTypeEnum.arrayBoolean]: 'Boolean',
  [WorkflowIOValueTypeEnum.arrayObject]: 'Object',
  [WorkflowIOValueTypeEnum.arrayAny]: 'Any'
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
      loopStartNode?.data.outputs.find((output) => output.key === NodeOutputKeyEnum.loopArray)
    ) {
      onChangeNode({
        nodeId,
        type: 'delOutput',
        key: NodeOutputKeyEnum.loopArray
      });
    } else if (
      outputValueType &&
      !loopStartNode?.data.outputs.find((output) => output.key === NodeOutputKeyEnum.loopArray)
    ) {
      onChangeNode({
        nodeId,
        type: 'addOutput',
        value: {
          id: NodeOutputKeyEnum.loopArray,
          key: NodeOutputKeyEnum.loopArray,
          label: t('workflow:Array_element'),
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.arrayAny
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
                // label: t('workflow:Array_element'),
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

export default NodeLoopStart;
