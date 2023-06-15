import React from 'react';
import { Flex, Table, Thead, Tbody, Tr, Th, Td, TableContainer, Box } from '@chakra-ui/react';
import { useLoading } from '@/hooks/useLoading';
import dayjs from 'dayjs';
import { getPromotionRecords } from '@/api/user';
import { usePagination } from '@/hooks/usePagination';
import { PromotionRecordType } from '@/api/response/user';
import { PromotionTypeMap } from '@/constants/user';
import MyIcon from '@/components/Icon';

const OpenApi = () => {
  const { Loading } = useLoading();

  const {
    data: promotionRecords,
    isLoading,
    total,
    pageSize,
    Pagination
  } = usePagination<PromotionRecordType>({
    api: getPromotionRecords
  });

  return (
    <>
      <TableContainer position={'relative'} overflow={'hidden'} minH={'100px'}>
        <Table>
          <Thead>
            <Tr>
              <Th>时间</Th>
              <Th>类型</Th>
              <Th>金额</Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {promotionRecords.map((item) => (
              <Tr key={item._id}>
                <Td>
                  {item.createTime ? dayjs(item.createTime).format('YYYY/MM/DD HH:mm:ss') : '-'}
                </Td>
                <Td>{PromotionTypeMap[item.type]}</Td>
                <Td>{item.amount}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>

      {!isLoading && promotionRecords.length === 0 && (
        <Flex flexDirection={'column'} alignItems={'center'}>
          <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
          <Box mt={2} color={'myGray.500'}>
            无佣金记录~
          </Box>
        </Flex>
      )}
      {total > pageSize && (
        <Flex mt={4} justifyContent={'flex-end'}>
          <Pagination />
        </Flex>
      )}
      <Loading loading={isLoading} fixed={false} />
    </>
  );
};

export default OpenApi;
