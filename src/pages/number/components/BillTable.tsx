import React from 'react';
import { Card, Box, Table, Thead, Tbody, Tr, Th, Td, TableContainer } from '@chakra-ui/react';
import ScrollData from '@/components/ScrollData';
import { BillTypeMap } from '@/constants/user';
import { getUserBills } from '@/api/user';
import { usePaging } from '@/hooks/usePaging';
import type { UserBillType } from '@/types/user';

const BillTable = () => {
  const {
    nextPage,
    isLoadAll,
    requesting,
    data: bills
  } = usePaging<UserBillType>({
    api: getUserBills,
    pageSize: 30
  });

  return (
    <Card mt={6} py={4}>
      <Box fontSize={'xl'} fontWeight={'bold'} px={6} mb={1}>
        使用记录
      </Box>
      <ScrollData
        maxH={'400px'}
        px={6}
        isLoadAll={isLoadAll}
        requesting={requesting}
        nextPage={nextPage}
      >
        <TableContainer>
          <Table>
            <Thead>
              <Tr>
                <Th>时间</Th>
                <Th>类型</Th>
                <Th>内容长度</Th>
                <Th>Tokens 长度</Th>
                <Th>消费</Th>
              </Tr>
            </Thead>
            <Tbody fontSize={'sm'}>
              {bills.map((item) => (
                <Tr key={item.id}>
                  <Td>{item.time}</Td>
                  <Td>{BillTypeMap[item.type]}</Td>
                  <Td>{item.textLen}</Td>
                  <Td>{item.tokenLen}</Td>
                  <Td>{item.price}元</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </ScrollData>
    </Card>
  );
};

export default BillTable;
