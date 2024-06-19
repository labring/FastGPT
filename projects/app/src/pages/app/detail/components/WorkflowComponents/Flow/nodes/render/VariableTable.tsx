import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Table, Thead, Tbody, Tr, Th, Td, TableContainer, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type {
  EditInputFieldMapType,
  EditNodeFieldType
} from '@fastgpt/global/core/workflow/node/type';

import dynamic from 'next/dynamic';

const FieldEditModal = dynamic(() => import('./FieldEditModal'));

const VariableTable = ({
  fieldEditType,
  variables = [],
  keys,

  createField,
  onCreate,

  editField,
  onStartEdit,
  onEdit,

  onCloseFieldEdit,
  onDelete
}: {
  fieldEditType?: EditInputFieldMapType;
  variables: { icon?: string; label: string; type: string; key: string }[];
  keys: string[];

  createField?: EditNodeFieldType;
  onCreate?: (e: { data: EditNodeFieldType }) => void;

  editField?: EditNodeFieldType;
  onStartEdit: (key: string) => void;
  onEdit?: (e: { data: EditNodeFieldType; changeKey: boolean }) => void;

  onCloseFieldEdit: () => void;
  onDelete?: (key: string) => void;
}) => {
  const { t } = useTranslation();

  const fileEditData = (createField || editField) as EditNodeFieldType | undefined;

  return (
    <>
      <Box
        bg={'white'}
        borderRadius={'md'}
        overflow={'hidden'}
        borderWidth={'1px'}
        borderBottom={'none'}
      >
        <TableContainer>
          <Table bg={'white'}>
            <Thead>
              <Tr>
                <Th borderBottomLeftRadius={'none !important'}>
                  {t('core.module.variable.variable name')}
                </Th>
                <Th>{t('core.workflow.Value type')}</Th>
                <Th borderBottomRightRadius={'none !important'}></Th>
              </Tr>
            </Thead>
            <Tbody>
              {variables.map((item) => (
                <Tr key={item.key}>
                  <Td>
                    <Flex alignItems={'center'}>
                      {!!item.icon && <MyIcon name={item.icon as any} w={'14px'} mr={1} />}
                      {item.label || item.key}
                    </Flex>
                  </Td>
                  <Td>{item.type}</Td>
                  <Td>
                    <MyIcon
                      mr={3}
                      name={'common/settingLight'}
                      w={'16px'}
                      cursor={'pointer'}
                      onClick={() => onStartEdit(item.key)}
                    />
                    <MyIcon
                      className="delete"
                      name={'delete'}
                      w={'16px'}
                      color={'myGray.600'}
                      cursor={'pointer'}
                      ml={2}
                      _hover={{ color: 'red.500' }}
                      onClick={() => {
                        onDelete?.(item.key);
                      }}
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </Box>
      {!!fileEditData && (
        <FieldEditModal
          editField={fieldEditType}
          defaultField={fileEditData}
          keys={keys}
          onClose={onCloseFieldEdit}
          onSubmit={(e) => {
            if (!!createField && onCreate) {
              onCreate(e);
            } else if (!!editField && onEdit) {
              onEdit(e);
            }
          }}
        />
      )}
    </>
  );
};

export default React.memo(VariableTable);
