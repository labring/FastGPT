import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useTranslation } from 'next-i18next';
import { type Node, type NodeProps, useNodesData } from '@xyflow/react';
import NodeCard from '../render/NodeCard';
import { useContextSelector } from 'use-context-selector';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { Box, Flex, Table, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import React, { useEffect, useMemo } from 'react';
import { FlowValueTypeMap } from '@fastgpt/global/core/workflow/node/constant';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';

const arrayItemTypeMap: Partial<Record<WorkflowIOValueTypeEnum, WorkflowIOValueTypeEnum>> = {
  [WorkflowIOValueTypeEnum.arrayString]: WorkflowIOValueTypeEnum.string,
  [WorkflowIOValueTypeEnum.arrayNumber]: WorkflowIOValueTypeEnum.number,
  [WorkflowIOValueTypeEnum.arrayBoolean]: WorkflowIOValueTypeEnum.boolean,
  [WorkflowIOValueTypeEnum.arrayObject]: WorkflowIOValueTypeEnum.object,
  [WorkflowIOValueTypeEnum.arrayAny]: WorkflowIOValueTypeEnum.any
};

const NodeLoopRunStart = ({ data, selected }: NodeProps<Node<FlowNodeItemType>>) => {
  const { t } = useTranslation();
  const { nodeId, outputs, parentNodeId } = data;
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const parentNode = useNodesData<Node<FlowNodeItemType>>(parentNodeId ?? '');

  const parentMode =
    (parentNode?.data?.inputs.find((i) => i.key === NodeInputKeyEnum.loopRunMode)?.value as
      | LoopRunModeEnum
      | undefined) ?? LoopRunModeEnum.array;

  const currentItemType = useMemo(() => {
    if (parentMode !== LoopRunModeEnum.array) return undefined;
    const parentArrayInput = parentNode?.data?.inputs.find(
      (i) => i.key === NodeInputKeyEnum.loopRunInputArray
    );
    return arrayItemTypeMap[parentArrayInput?.valueType as keyof typeof arrayItemTypeMap];
  }, [parentNode?.data?.inputs, parentMode]);

  // Output add/remove on mode switches lives in NodeLoopRun; this effect only
  // keeps currentItem.valueType in sync with the inferred parent array type.
  useEffect(() => {
    if (parentMode !== LoopRunModeEnum.array || !currentItemType) return;
    const currentItem = outputs?.find((o) => o.key === NodeOutputKeyEnum.currentItem);
    if (currentItem && currentItem.valueType !== currentItemType) {
      onChangeNode({
        nodeId,
        type: 'updateOutput',
        key: NodeOutputKeyEnum.currentItem,
        value: { ...currentItem, valueType: currentItemType }
      });
    }
  }, [parentMode, currentItemType, nodeId, onChangeNode, outputs]);

  return (
    <NodeCard
      selected={selected}
      {...data}
      menuForbid={{
        copy: true,
        delete: true,
        debug: true
      }}
    >
      <Box px={4} pt={2} w={'420px'}>
        <Box bg={'white'} borderRadius={'md'} overflow={'hidden'} border={'base'}>
          <FixedTableContainer flush className="nodrag nowheel">
            <Table bg={'white'} variant={'workflow'}>
              <Thead>
                <Tr>
                  <Th>{t('workflow:Variable_name')}</Th>
                  <Th>{t('common:core.workflow.Value type')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {outputs.map((output) => (
                  <Tr key={output.id}>
                    <Td>
                      <Flex alignItems={'center'}>
                        <MyIcon
                          name={'core/workflow/inputType/array'}
                          w={'14px'}
                          mr={1}
                          color={'primary.600'}
                        />
                        {t(output.label as any)}
                      </Flex>
                    </Td>
                    {output.valueType && <Td>{FlowValueTypeMap[output.valueType]?.label}</Td>}
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </FixedTableContainer>
        </Box>
      </Box>
    </NodeCard>
  );
};

export default React.memo(NodeLoopRunStart);
