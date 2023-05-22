import React from 'react';
import { Card, Box, Table, Thead, Tbody, Tr, Th, Td, TableContainer, Flex } from '@chakra-ui/react';
import { BillTypeMap } from '@/constants/user';
import { getUserBills } from '@/api/user';
import type { UserBillType } from '@/types/user';
import { usePagination } from '@/hooks/usePagination';
import { useLoading } from '@/hooks/useLoading';
import dayjs from 'dayjs';

const BillTable = () => {
  const { Loading } = useLoading();

  const {
    data: bills,
    isLoading,
    Pagination
  } = usePagination<UserBillType>({
    api: getUserBills
  });

  return (
    <Card mt={6} py={4}>
      <Box fontSize={'xl'} fontWeight={'bold'} px={6} mb={1}>
        使用记录
      </Box>
      <TableContainer position={'relative'}>
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
      <Flex mt={4} px={4} justifyContent={'flex-end'}>
        <Pagination />
      </Flex>
    </Card>
  );
};

export default BillTable;
