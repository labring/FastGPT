import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useTranslation } from 'next-i18next';
import { type NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../../context/workflowInitContext';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { Box, Flex, Table, TableContainer, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
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

const NodeLoopRunStart = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, outputs } = data;
  const { getNodeById } = useContextSelector(WorkflowBufferDataContext, (v) => v);
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const startNode = getNodeById(nodeId);
  const parentNode = getNodeById(startNode?.parentNodeId);

  const parentMode =
    (parentNode?.inputs.find((i) => i.key === NodeInputKeyEnum.loopRunMode)?.value as
      | LoopRunModeEnum
      | undefined) ?? LoopRunModeEnum.array;

  // Infer currentItem valueType from parent's loopRunInputArray
  const currentItemType = useMemo(() => {
    if (parentMode !== LoopRunModeEnum.array) return undefined;
    const parentArrayInput = parentNode?.inputs.find(
      (i) => i.key === NodeInputKeyEnum.loopRunInputArray
    );
    return arrayItemTypeMap[parentArrayInput?.valueType as keyof typeof arrayItemTypeMap];
  }, [parentNode?.inputs, parentMode]);

  // Keep only `currentItem.valueType` in sync with the parent array's inferred
  // item type. Adding / removing outputs on mode switches is handled by the
  // parent NodeLoopRun component (which is the reliable re-render trigger).
  useEffect(() => {
    if (parentMode !== LoopRunModeEnum.array || !currentItemType) return;
    const currentItem = startNode?.outputs.find((o) => o.key === NodeOutputKeyEnum.currentItem);
    if (currentItem && currentItem.valueType !== currentItemType) {
      onChangeNode({
        nodeId,
        type: 'updateOutput',
        key: NodeOutputKeyEnum.currentItem,
        value: { ...currentItem, valueType: currentItemType }
      });
    }
  }, [parentMode, currentItemType, nodeId, onChangeNode, startNode?.outputs]);

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
          <TableContainer>
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
          </TableContainer>
        </Box>
      </Box>
    </NodeCard>
  );
};

export default React.memo(NodeLoopRunStart);
