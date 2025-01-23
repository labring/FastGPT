import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Table, Thead, Tbody, Tr, Th, Td, TableContainer, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';

const VariableTable = ({
  variables = [],
  onEdit,
  onDelete
}: {
  variables: { icon?: string; label: string; type: string; key: string; isTool?: boolean }[];
  onEdit: (key: string) => void;
  onDelete: (key: string) => void;
}) => {
  const { t } = useTranslation();
  const showToolColumn = variables.some((item) => item.isTool);

  return (
    <TableContainer
      borderRadius={'md'}
      overflow={'hidden'}
      border={'1px solid'}
      borderColor={'myGray.200'}
    >
      <Table variant={'workflow'}>
        <Thead>
          <Tr>
            <Th>{t('workflow:Variable_name')}</Th>
            <Th>{t('common:core.workflow.Value type')}</Th>
            {showToolColumn && <Th>{t('workflow:tool_input')}</Th>}
            <Th>{t('user:operations')}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {variables.map((item, index) => (
            <Tr key={item.key}>
              <Td>
                <Flex alignItems={'center'} fontSize={'xs'}>
                  {!!item.icon ? (
                    <MyIcon name={item.icon as any} w={'14px'} mr={1} color={'myGray.600'} />
                  ) : (
                    <MyIcon name={'checkCircle'} w={'14px'} mr={1} color={'myGray.600'} />
                  )}
                  {item.label || item.key}
                </Flex>
              </Td>
              <Td>{item.type}</Td>
              {showToolColumn && (
                <Td>
                  {item.isTool ? (
                    <Flex alignItems={'center'}>
                      <MyIcon name={'check'} w={'16px'} color={'myGray.900'} mr={2} />
                    </Flex>
                  ) : (
                    ''
                  )}
                </Td>
              )}
              <Td>
                <Flex>
                  <MyIconButton icon={'common/settingLight'} onClick={() => onEdit(item.key)} />
                  <MyIconButton
                    icon={'delete'}
                    hoverColor={'red.500'}
                    onClick={() => onDelete(item.key)}
                  />
                </Flex>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
};

export default React.memo(VariableTable);
