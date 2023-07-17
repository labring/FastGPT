import React, { useState } from 'react';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Flex,
  Box,
  Button
} from '@chakra-ui/react';
import { BillSourceMap } from '@/constants/user';
import { getUserBills } from '@/api/user';
import type { UserBillType } from '@/types/user';
import { usePagination } from '@/hooks/usePagination';
import { useLoading } from '@/hooks/useLoading';
import dayjs from 'dayjs';
import MyIcon from '@/components/Icon';
import DateRangePicker, { type DateRangeType } from '@/components/DateRangePicker';
import { addDays } from 'date-fns';
import dynamic from 'next/dynamic';

const BillDetail = dynamic(() => import('./BillDetail'));

const BillTable = () => {
  const { Loading } = useLoading();
  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: addDays(new Date(), -7),
    to: new Date()
  });

  const {
    data: bills,
    isLoading,
    Pagination,
    getData
  } = usePagination<UserBillType>({
    api: getUserBills,
    params: {
      dateStart: dateRange.from,
      dateEnd: dateRange.to
    }
  });

  const [billDetail, setBillDetail] = useState<UserBillType>();

  return (
    <>
      <TableContainer position={'relative'} minH={'100px'}>
        <Table>
          <Thead>
            <Tr>
              <Th>时间</Th>
              <Th>来源</Th>
              <Th>应用名</Th>
              <Th>总金额</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {bills.map((item) => (
              <Tr key={item.id}>
                <Td>{dayjs(item.time).format('YYYY/MM/DD HH:mm:ss')}</Td>
                <Td>{BillSourceMap[item.source]}</Td>
                <Td>{item.appName || '-'}</Td>
                <Td>{item.total}元</Td>
                <Td>
                  <Button size={'sm'} variant={'base'} onClick={() => setBillDetail(item)}>
                    详情
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>

      {!isLoading && bills.length === 0 && (
        <Flex h={'100%'} flexDirection={'column'} alignItems={'center'}>
          <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
          <Box mt={2} color={'myGray.500'}>
            无使用记录~
          </Box>
        </Flex>
      )}
      <Flex w={'100%'} mt={4} justifyContent={'flex-end'}>
        <DateRangePicker
          defaultDate={dateRange}
          position="top"
          onChange={setDateRange}
          onSuccess={() => getData(1)}
        />
        <Box ml={2}>
          <Pagination />
        </Box>
      </Flex>
      <Loading loading={isLoading} fixed={false} />
      {!!billDetail && <BillDetail bill={billDetail} onClose={() => setBillDetail(undefined)} />}
    </>
  );
};

export default BillTable;
