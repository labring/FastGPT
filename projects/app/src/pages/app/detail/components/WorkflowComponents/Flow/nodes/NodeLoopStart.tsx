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
import { Box, Flex, Table, TableContainer, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import React, { useEffect } from 'react';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import MyIcon from '@fastgpt/web/components/common/Icon';

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
  const { nodeList, onChangeNode } = useContextSelector(WorkflowContext, (v) => v);

  const loopStartNode = nodeList.find((node) => node.nodeId === nodeId);
  const parentNode = nodeList.find((node) => node.nodeId === loopStartNode?.parentNodeId);
  const arrayInput = parentNode?.inputs.find(
    (input) => input.key === NodeInputKeyEnum.loopInputArray
  );
  const outputValueType = !!arrayInput?.value
    ? nodeList
        .find((node) => node.nodeId === arrayInput?.value[0])
        ?.outputs.find((output) => output.id === arrayInput?.value[1])?.valueType
    : undefined;
  const variables = [
    {
      icon: 'core/workflow/inputType/array',
      label: '数组元素',
      type: typeMap[outputValueType as keyof typeof typeMap],
      key: t('workflow:Array_element')
    }
  ];

  useEffect(() => {
    const loopArrayOutput = loopStartNode?.outputs.find(
      (output) => output.key === NodeOutputKeyEnum.loopArrayElement
    );

    if (!outputValueType && loopArrayOutput) {
      onChangeNode({
        nodeId,
        type: 'delOutput',
        key: NodeOutputKeyEnum.loopArrayElement
      });
    } else if (outputValueType && !loopArrayOutput) {
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
    } else if (outputValueType && loopArrayOutput) {
      onChangeNode({
        nodeId,
        type: 'updateOutput',
        key: NodeOutputKeyEnum.loopArrayElement,
        value: {
          ...loopArrayOutput,
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
          <EmptyTip text={t('workflow:loop_start_tip')} py={0} mt={0} iconSize={'32px'} />
        ) : (
          <Box bg={'white'} borderRadius={'md'} overflow={'hidden'} border={'base'}>
            <TableContainer>
              <Table bg={'white'}>
                <Thead>
                  <Tr>
                    <Th borderBottomLeftRadius={'none !important'}>
                      {t('common:core.module.variable.variable name')}
                    </Th>
                    <Th>{t('common:core.workflow.Value type')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {variables.map((item) => (
                    <Tr key={item.key}>
                      <Td>
                        <Flex alignItems={'center'}>
                          {!!item.icon && (
                            <MyIcon
                              name={item.icon as any}
                              w={'14px'}
                              mr={1}
                              color={'primary.600'}
                            />
                          )}
                          {item.label || item.key}
                        </Flex>
                      </Td>
                      <Td>{item.type}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Box>
    </NodeCard>
  );
};

export default React.memo(NodeLoopStart);
