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
import { BillSourceMap } from '@fastgpt/global/support/wallet/bill/constants';
import { getUserBills } from '@/web/support/wallet/bill/api';
import type { BillItemType } from '@fastgpt/global/support/wallet/bill/type';
import { usePagination } from '@/web/common/hooks/usePagination';
import { useLoading } from '@/web/common/hooks/useLoading';
import dayjs from 'dayjs';
import MyIcon from '@fastgpt/web/components/common/Icon';
import DateRangePicker, { type DateRangeType } from '@/components/DateRangePicker';
import { addDays } from 'date-fns';
import dynamic from 'next/dynamic';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
const BillDetail = dynamic(() => import('./BillDetail'));

const BillTable = () => {
  const { t } = useTranslation();
  const { Loading } = useLoading();
  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: addDays(new Date(), -7),
    to: new Date()
  });
  const { isPc } = useSystemStore();
  const [billDetail, setBillDetail] = useState<BillItemType>();

  const {
    data: bills,
    isLoading,
    Pagination,
    getData
  } = usePagination<BillItemType>({
    api: getUserBills,
    pageSize: isPc ? 20 : 10,
    params: {
      dateStart: dateRange.from || new Date(),
      dateEnd: addDays(dateRange.to || new Date(), 1)
    }
  });

  return (
    <Flex flexDirection={'column'} py={[0, 5]} h={'100%'} position={'relative'}>
      <TableContainer px={[3, 8]} position={'relative'} flex={'1 0 0'} h={0} overflowY={'auto'}>
        <Table>
          <Thead>
            <Tr>
              <Th>{t('user.team.Member Name')}</Th>
              <Th>{t('user.Time')}</Th>
              <Th>{t('user.Source')}</Th>
              <Th>{t('user.Application Name')}</Th>
              <Th>{t('user.Total Amount')}</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {bills.map((item) => (
              <Tr key={item.id}>
                <Td>{item.memberName}</Td>
                <Td>{dayjs(item.time).format('YYYY/MM/DD HH:mm:ss')}</Td>
                <Td>{BillSourceMap[item.source]}</Td>
                <Td>{t(item.appName) || '-'}</Td>
                <Td>{item.total}元</Td>
                <Td>
                  <Button size={'sm'} variant={'whitePrimary'} onClick={() => setBillDetail(item)}>
                    详情
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>

      {!isLoading && bills.length === 0 && (
        <Flex flex={'1 0 0'} flexDirection={'column'} alignItems={'center'}>
          <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
          <Box mt={2} color={'myGray.500'}>
            无使用记录~
          </Box>
        </Flex>
      )}
      <Flex w={'100%'} mt={4} px={[3, 8]} alignItems={'center'} justifyContent={'flex-end'}>
        <DateRangePicker
          defaultDate={dateRange}
          position="top"
          onChange={setDateRange}
          onSuccess={() => getData(1)}
        />
        <Box ml={3}>
          <Pagination />
        </Box>
      </Flex>
      <Loading loading={isLoading} fixed={false} />
      {!!billDetail && <BillDetail bill={billDetail} onClose={() => setBillDetail(undefined)} />}
    </Flex>
  );
};

export default React.memo(BillTable);
