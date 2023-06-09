import React from 'react';
import { Table, Thead, Tbody, Tr, Th, Td, TableContainer, Flex, Box } from '@chakra-ui/react';
import { BillTypeMap } from '@/constants/user';
import { getUserBills } from '@/api/user';
import type { UserBillType } from '@/types/user';
import { usePagination } from '@/hooks/usePagination';
import { useLoading } from '@/hooks/useLoading';
import dayjs from 'dayjs';
import MyIcon from '@/components/Icon';

const BillTable = () => {
  const { Loading } = useLoading();

  const {
    data: bills,
    isLoading,
    Pagination,
    pageSize,
    total
  } = usePagination<UserBillType>({
    api: getUserBills
  });

  return (
    <>
      <TableContainer position={'relative'} minH={'200px'}>
        <Table>
          <Thead>
            <Tr>
              <Th>时间</Th>
              <Th>类型</Th>
              <Th>底层模型</Th>
              <Th>内容长度</Th>
              <Th>Tokens 长度</Th>
              <Th>金额</Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {bills.map((item) => (
              <Tr key={item.id}>
                <Td>{dayjs(item.time).format('YYYY/MM/DD HH:mm:ss')}</Td>
                <Td>{BillTypeMap[item.type] || '-'}</Td>
                <Td>{item.modelName}</Td>
                <Td>{item.textLen}</Td>
                <Td>{item.tokenLen}</Td>
                <Td>{item.price}元</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>

        <Loading loading={isLoading} fixed={false} />
      </TableContainer>

      {!isLoading && bills.length === 0 && (
        <Flex h={'100%'} flexDirection={'column'} alignItems={'center'} pt={'200px'}>
          <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
          <Box mt={2} color={'myGray.500'}>
            无使用记录~
          </Box>
        </Flex>
      )}
      {total > pageSize && (
        <Flex w={'100%'} mt={4} justifyContent={'flex-end'}>
          <Pagination />
        </Flex>
      )}
    </>
  );
};

export default BillTable;
