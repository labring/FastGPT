import React, { useMemo, useState } from 'react';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io.d';
import {
  Box,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Flex
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import dynamic from 'next/dynamic';
import { defaultEditFormData } from './constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
const EditFieldModal = dynamic(() => import('./EditFieldModal'));

const RenderToolInput = ({
  nodeId,
  inputs,
  canEdit = false
}: {
  nodeId: string;
  inputs: FlowNodeInputItemType[];
  canEdit?: boolean;
}) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const [editField, setEditField] = useState<FlowNodeInputItemType>();

  return (
    <>
      {canEdit && (
        <Flex mb={2} alignItems={'center'}>
          <Box flex={'1 0 0'} fontWeight={'medium'} color={'myGray.600'}>
            {t('common.Field')}
          </Box>
          <Button
            variant={'unstyled'}
            leftIcon={<MyIcon name={'common/addLight'} w={'14px'} />}
            size={'sm'}
            px={3}
            _hover={{
              bg: 'myGray.150'
            }}
            onClick={() => setEditField(defaultEditFormData)}
          >
            {t('core.module.extract.Add field')}
          </Button>
        </Flex>
      )}
      <Box borderRadius={'md'} overflow={'hidden'} borderWidth={'1px'} borderBottom="none">
        <TableContainer>
          <Table bg={'white'}>
            <Thead>
              <Tr>
                <Th>字段名</Th>
                <Th>字段描述</Th>
                <Th>必须</Th>
                {canEdit && <Th></Th>}
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
                  {canEdit && (
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
                        }}
                      />
                    </Td>
                  )}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </Box>

      {!!editField && (
        <EditFieldModal
          defaultValue={editField}
          nodeId={nodeId}
          onClose={() => setEditField(undefined)}
        />
      )}
    </>
  );
};

export default React.memo(RenderToolInput);
