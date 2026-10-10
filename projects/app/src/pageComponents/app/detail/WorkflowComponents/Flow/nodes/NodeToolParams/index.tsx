import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { WorkflowNodeData } from '@fastgpt/global/core/workflow/editor/types';
import { type NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import React, { useMemo, useState } from 'react';
import Container from '../../components/Container';
import { Button, Box, Flex, FormLabel, Table, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { SmallAddIcon } from '@chakra-ui/icons';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import ToolParamsEditModal from '../components/ToolParamsEditModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { defaultToolParamFormData } from '../components/ToolParamsEditModal/constants';
import { getOutputDisconnectCommands } from '@/web/core/workflow/utils';
import { useNode, useNodeActions } from '@/web/core/workflow/editor/react/useNode';
import { useWorkflowActions } from '@/web/core/workflow/editor/react/useWorkflow';

const emptyInputs: WorkflowNodeData['inputs'] = [];

const NodeToolParams = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const [editField, setEditField] = useState<FlowNodeInputItemType>();
  const { nodeId } = data;
  const inputs =
    useNode<WorkflowNodeData['inputs']>(nodeId, (node) => node?.data.inputs) ?? emptyInputs;
  const nodeActions = useNodeActions(nodeId);
  // 边集合只在删除参数的回调里读，走非订阅 getter：点击时取当前值，组件不订阅结构变更。
  const { getEdges } = useWorkflowActions();

  const Render = useMemo(() => {
    return (
      <NodeCard selected={selected} {...data}>
        <Container>
          <Flex alignItems={'center'} justifyContent={'space-between'} mb={1.5}>
            <FormLabel fontSize={'sm'}>{t('workflow:tool_input')}</FormLabel>
            <Button
              variant={'whiteBase'}
              leftIcon={<SmallAddIcon />}
              iconSpacing={1}
              size={'sm'}
              onClick={() => setEditField(defaultToolParamFormData)}
            >
              {t('common:add_new')}
            </Button>
            {!!editField && (
              <ToolParamsEditModal
                defaultValue={editField}
                existingKeys={inputs.map((input) => input.key)}
                nodeId={nodeId}
                onClose={() => setEditField(undefined)}
              />
            )}
          </Flex>
          <Box borderRadius={'md'} overflow={'hidden'} border={'base'}>
            <FixedTableContainer flush className="nodrag nowheel">
              <Table bg={'white'}>
                <Thead>
                  <Tr>
                    <Th>{t('workflow:tool_params.params_name')}</Th>
                    <Th>{t('workflow:tool_params.params_description')}</Th>
                    <Th>{t('workflow:field_required')}</Th>
                    <Th w={'100px'} minW={'100px'}>
                      {t('common:Operation')}
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {inputs.map((item, index) => (
                    <Tr
                      key={index}
                      position={'relative'}
                      whiteSpace={'pre-wrap'}
                      wordBreak={'break-all'}
                    >
                      <Td>{item.key}</Td>
                      <Td>{item.toolDescription}</Td>
                      <Td>{item.required ? '✔' : ''}</Td>
                      <Td w={'100px'} minW={'100px'} whiteSpace={'nowrap'} verticalAlign={'middle'}>
                        <Flex h={'24px'} alignItems={'center'}>
                          <MyIcon
                            mr={3}
                            name={'common/settingLight'}
                            w={'16px'}
                            cursor={'pointer'}
                            onClick={() => setEditField(item)}
                          />
                          <MyIcon
                            name={'delete'}
                            w={'16px'}
                            cursor={'pointer'}
                            onClick={() => {
                              // 参数与其同名 output 一起删除，旧 handle 连线同事务断开。
                              nodeActions?.updateNode(
                                (current) => ({
                                  inputs: current.inputs.filter((input) => input.key !== item.key),
                                  outputs: current.outputs.filter(
                                    (output) => output.key !== item.key
                                  )
                                }),
                                {
                                  disconnectEdges: getOutputDisconnectCommands({
                                    edges: getEdges(),
                                    nodeId,
                                    outputKey: item.key
                                  })
                                }
                              );
                            }}
                          />
                        </Flex>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </FixedTableContainer>
          </Box>
        </Container>
      </NodeCard>
    );
  }, [selected, data, t, editField, inputs, nodeActions, getEdges, nodeId]);

  return Render;
};

export default React.memo(NodeToolParams);
