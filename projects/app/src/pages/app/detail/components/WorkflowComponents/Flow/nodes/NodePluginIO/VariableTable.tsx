import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Table, Thead, Tbody, Tr, Th, Td, TableContainer, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

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
    <Box
      bg={'white'}
      borderRadius={'md'}
      overflow={'hidden'}
      border={'1px solid'}
      borderColor={'myGray.200'}
    >
      <TableContainer>
        <Table bg={'white'}>
          <Thead>
            <Tr h={8}>
              <Th
                p={0}
                px={4}
                fontSize={'mini'}
                borderBottomLeftRadius={'none !important'}
                bg={'myGray.50'}
              >
                {t('workflow:Variable_name')}
              </Th>
              <Th p={0} px={4} fontSize={'mini'} bg={'myGray.50'}>
                {t('common:core.workflow.Value type')}
              </Th>
              {showToolColumn && (
                <Th p={0} px={4} fontSize={'mini'} bg={'myGray.50'}>
                  {t('workflow:tool_input')}
                </Th>
              )}
              <Th
                p={0}
                px={4}
                fontSize={'mini'}
                bg={'myGray.50'}
                borderBottomRightRadius={'none !important'}
              >
                {t('user:operations')}
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {variables.map((item, index) => (
              <Tr key={item.key} h={10}>
                <Td p={0} px={4} borderBottom={index === variables.length - 1 ? 'none' : undefined}>
                  <Flex alignItems={'center'} fontSize={'xs'}>
                    {!!item.icon ? (
                      <MyIcon name={item.icon as any} w={'14px'} mr={1} color={'myGray.600'} />
                    ) : (
                      <MyIcon name={'checkCircle'} w={'14px'} mr={1} color={'myGray.600'} />
                    )}
                    {item.label || item.key}
                  </Flex>
                </Td>
                <Td
                  p={0}
                  px={4}
                  fontSize={'xs'}
                  borderBottom={index === variables.length - 1 ? 'none' : undefined}
                >
                  {item.type}
                </Td>
                {showToolColumn && (
                  <Td
                    p={0}
                    px={4}
                    borderBottom={index === variables.length - 1 ? 'none' : undefined}
                  >
                    {item.isTool ? (
                      <Flex alignItems={'center'}>
                        <MyIcon name={'check'} w={'16px'} color={'myGray.900'} mr={2} />
                      </Flex>
                    ) : (
                      ''
                    )}
                  </Td>
                )}
                <Td p={0} px={4} borderBottom={index === variables.length - 1 ? 'none' : undefined}>
                  <Flex>
                    <Flex
                      mr={1}
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
                      onClick={() => onEdit(item.key)}
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
                        onDelete(item.key);
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
    </Box>
  );
};

export default React.memo(VariableTable);
