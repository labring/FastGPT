import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { type NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import React, { useMemo, useState } from 'react';
import Container from '../../components/Container';
import {
  Button,
  Box,
  Flex,
  FormLabel,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { SmallAddIcon } from '@chakra-ui/icons';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import ToolParamsEditModal from '../components/ToolParamsEditModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import { defaultToolParamFormData } from '../components/ToolParamsEditModal/constants';

const NodeToolParams = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const [editField, setEditField] = useState<FlowNodeInputItemType>();
  const { nodeId, inputs } = data;
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

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
            <TableContainer>
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
                              onChangeNode({
                                nodeId,
                                type: 'delInput',
                                key: item.key
                              });
                              onChangeNode({
                                nodeId,
                                type: 'delOutput',
                                key: item.key
                              });
                            }}
                          />
                        </Flex>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          </Box>
        </Container>
      </NodeCard>
    );
  }, [selected, data, t, editField, inputs, onChangeNode, nodeId]);

  return Render;
};

export default React.memo(NodeToolParams);
