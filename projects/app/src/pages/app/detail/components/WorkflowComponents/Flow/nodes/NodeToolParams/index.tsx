import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import React, { useMemo, useState } from 'react';
import Container from '../../components/Container';
import {
  Box,
  Button,
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
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { defaultEditFormData } from '../render/RenderToolInput/EditFieldModal';
import ToolParamsEditModal from './ToolParamsEditModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../context';

const NodeToolParams = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const [editField, setEditField] = useState<FlowNodeInputItemType>();
  const { nodeId, inputs } = data;
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const Render = useMemo(() => {
    return (
      <NodeCard selected={selected} {...data}>
        <Container>
          <Flex alignItems={'center'} justifyContent={'space-between'} mb={1.5}>
            <FormLabel fontSize={'sm'}>{t('workflow:tool_custom_field')}</FormLabel>
            <Button
              variant={'whiteBase'}
              leftIcon={<SmallAddIcon />}
              iconSpacing={1}
              size={'sm'}
              onClick={() => setEditField(defaultEditFormData)}
            >
              {t('common:add_new_param')}
            </Button>
            {!!editField && (
              <ToolParamsEditModal
                defaultValue={editField}
                nodeId={nodeId}
                onClose={() => setEditField(undefined)}
              />
            )}
          </Flex>
          <TableContainer
            borderRadius={'md'}
            overflow={'hidden'}
            border={'1px solid'}
            borderColor={'myGray.200'}
          >
            <Table bg={'white'}>
              <Thead>
                <Tr h={8}>
                  <Th p={0} px={4} bg={'myGray.50'} borderBottomLeftRadius={'none !important'}>
                    {t('workflow:tool_params.params_name')}
                  </Th>
                  <Th p={0} px={4} bg={'myGray.50'}>
                    {t('workflow:tool_params.params_description')}
                  </Th>
                  <Th p={0} px={4} bg={'myGray.50'} borderBottomRightRadius={'none !important'}>
                    {t('common:common.Operation')}
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
                    h={10}
                  >
                    <Td
                      p={0}
                      px={4}
                      borderBottom={index === inputs.length - 1 ? 'none' : undefined}
                    >
                      <Flex alignItems={'center'} fontSize={'xs'}>
                        <MyIcon name={'checkCircle'} w={'14px'} mr={1} color={'myGray.600'} />
                        {item.key}
                      </Flex>
                    </Td>
                    <Td
                      p={0}
                      px={4}
                      borderBottom={index === inputs.length - 1 ? 'none' : undefined}
                      fontSize={'xs'}
                    >
                      {item.toolDescription}
                    </Td>
                    <Td
                      p={0}
                      px={4}
                      borderBottom={index === inputs.length - 1 ? 'none' : undefined}
                      whiteSpace={'nowrap'}
                    >
                      <Flex alignItems={'center'}>
                        <Flex
                          mr={3}
                          p={1}
                          color={'myGray.500'}
                          rounded={'sm'}
                          alignItems={'center'}
                          bg={'transparent'}
                          transition={'background 0.1s'}
                          cursor={'pointer'}
                          _hover={{
                            bg: 'myGray.05',
                            color: 'primary.600'
                          }}
                          onClick={() => setEditField(item)}
                        >
                          <MyIcon name={'common/settingLight'} w={'16px'} />
                        </Flex>
                        <Flex
                          p={1}
                          color={'myGray.500'}
                          rounded={'sm'}
                          alignItems={'center'}
                          bg={'transparent'}
                          transition={'background 0.1s'}
                          cursor={'pointer'}
                          _hover={{
                            bg: 'myGray.05',
                            color: 'red.500'
                          }}
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
                        >
                          <MyIcon name={'delete'} w={'16px'} />
                        </Flex>
                      </Flex>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </Container>
      </NodeCard>
    );
  }, [selected, data, t, editField, inputs, onChangeNode, nodeId]);

  return Render;
};

export default React.memo(NodeToolParams);
