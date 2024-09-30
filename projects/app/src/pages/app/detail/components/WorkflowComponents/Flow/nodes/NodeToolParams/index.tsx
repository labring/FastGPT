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
import { useTranslation } from 'react-i18next';
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
            <FormLabel>{t('workflow:tool_custom_field')}</FormLabel>
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
          <Box borderRadius={'md'} overflow={'hidden'} border={'base'}>
            <TableContainer>
              <Table bg={'white'}>
                <Thead>
                  <Tr>
                    <Th>{t('workflow:tool_params.params_name')}</Th>
                    <Th>{t('workflow:tool_params.params_description')}</Th>
                    <Th>{t('common:common.Operation')}</Th>
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
                      <Td whiteSpace={'nowrap'}>
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
