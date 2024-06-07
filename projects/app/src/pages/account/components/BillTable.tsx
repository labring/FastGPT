import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Flex,
  Box,
  ModalBody
} from '@chakra-ui/react';
import { getBills, checkBalancePayResult } from '@/web/support/wallet/bill/api';
import type { BillSchemaType } from '@fastgpt/global/support/wallet/bill/type.d';
import dayjs from 'dayjs';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/usage/tools';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import {
  BillTypeEnum,
  billPayWayMap,
  billStatusMap,
  billTypeMap
} from '@fastgpt/global/support/wallet/bill/constants';
// import { usePagination } from '@/web/common/hooks/usePagination';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { standardSubLevelMap, subModeMap } from '@fastgpt/global/support/wallet/sub/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

const BillTable = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [billType, setBillType] = useState<`${BillTypeEnum}` | ''>('');
  const [billDetail, setBillDetail] = useState<BillSchemaType>();

  const billTypeList = useMemo(
    () => [
      { label: t('common.All'), value: '' },
      ...Object.entries(billTypeMap).map(([key, value]) => ({
        label: t(value.label),
        value: key
      }))
    ],
    [t]
  );

  const {
    data: bills,
    isLoading,
    Pagination,
    getData,
    total
  } = usePagination<BillSchemaType>({
    api: getBills,
    pageSize: 20,
    params: {
      type: billType
    },
    defaultRequest: false
  });

  const { mutate: handleRefreshPayOrder, isLoading: isRefreshing } = useRequest({
    mutationFn: async (payId: string) => {
      try {
        const data = await checkBalancePayResult(payId);
        toast({
          title: data,
          status: 'success'
        });
      } catch (error: any) {
        toast({
          title: error?.message,
          status: 'warning'
        });
        console.log(error);
      }
      try {
        getData(1);
      } catch (error) {}
    }
  });

  useEffect(() => {
    getData(1);
  }, [billType]);

  return (
    <MyBox
      isLoading={isLoading || isRefreshing}
      position={'relative'}
      h={'100%'}
      overflow={'overlay'}
      py={[0, 5]}
      px={[3, 8]}
    >
      <TableContainer>
        <Table>
          <Thead>
            <Tr>
              <Th>#</Th>
              <Th>
                <MySelect
                  list={billTypeList}
                  value={billType}
                  size={'sm'}
                  onchange={(e) => {
                    setBillType(e);
                  }}
                  w={'130px'}
                ></MySelect>
              </Th>
              <Th>{t('user.Time')}</Th>
              <Th>{t('support.wallet.Amount')}</Th>
              <Th>{t('support.wallet.bill.Status')}</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {bills.map((item, i) => (
              <Tr key={item._id}>
                <Td>{i + 1}</Td>
                <Td>{t(billTypeMap[item.type]?.label)}</Td>
                <Td>
                  {item.createTime ? dayjs(item.createTime).format('YYYY/MM/DD HH:mm:ss') : '-'}
                </Td>
                <Td>{formatStorePrice2Read(item.price)}元</Td>
                <Td>{t(billStatusMap[item.status]?.label)}</Td>
                <Td>
                  {item.status === 'NOTPAY' && (
                    <Button mr={4} onClick={() => handleRefreshPayOrder(item._id)} size={'sm'}>
                      {t('common.Update')}
                    </Button>
                  )}
                  <Button variant={'whiteBase'} size={'sm'} onClick={() => setBillDetail(item)}>
                    {t('common.Detail')}
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {total >= 20 && (
          <Flex mt={3} justifyContent={'flex-end'}>
            <Pagination />
          </Flex>
        )}
        {!isLoading && bills.length === 0 && (
          <Flex
            mt={'20vh'}
            flexDirection={'column'}
            alignItems={'center'}
            justifyContent={'center'}
          >
            <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
            <Box mt={2} color={'myGray.500'}>
              {t('support.wallet.noBill')}
            </Box>
          </Flex>
        )}
      </TableContainer>

      {!!billDetail && (
        <BillDetailModal bill={billDetail} onClose={() => setBillDetail(undefined)} />
      )}
    </MyBox>
  );
};

export default BillTable;

function BillDetailModal({ bill, onClose }: { bill: BillSchemaType; onClose: () => void }) {
  const { t } = useTranslation();

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/modal/bill.svg"
      title={t('support.wallet.usage.Usage Detail')}
      maxW={['90vw', '700px']}
    >
      <ModalBody>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 120px'}>{t('support.wallet.bill.Number')}:</FormLabel>
          <Box>{bill.orderId}</Box>
        </Flex>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 120px'}>{t('support.wallet.usage.Time')}:</FormLabel>
          <Box>{dayjs(bill.createTime).format('YYYY/MM/DD HH:mm:ss')}</Box>
        </Flex>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 120px'}>{t('support.wallet.bill.Status')}:</FormLabel>
          <Box>{t(billStatusMap[bill.status]?.label)}</Box>
        </Flex>
        {!!bill.metadata?.payWay && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('support.wallet.bill.payWay.Way')}:</FormLabel>
            <Box>{t(billPayWayMap[bill.metadata.payWay]?.label)}</Box>
          </Flex>
        )}
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 120px'}>{t('support.wallet.Amount')}:</FormLabel>
          <Box>{formatStorePrice2Read(bill.price)}元</Box>
        </Flex>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 120px'}>{t('support.wallet.bill.Type')}:</FormLabel>
          <Box>{t(billTypeMap[bill.type]?.label)}</Box>
        </Flex>
        {!!bill.metadata?.subMode && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>
              {t('support.wallet.subscription.mode.Period')}:
            </FormLabel>
            <Box>{t(subModeMap[bill.metadata.subMode]?.label)}</Box>
          </Flex>
        )}
        {!!bill.metadata?.standSubLevel && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>
              {t('support.wallet.subscription.Stand plan level')}:
            </FormLabel>
            <Box>{t(standardSubLevelMap[bill.metadata.standSubLevel]?.label)}</Box>
          </Flex>
        )}
        {bill.metadata?.month !== undefined && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>
              {t('support.wallet.subscription.Month amount')}:
            </FormLabel>
            <Box>{bill.metadata?.month}</Box>
          </Flex>
        )}
        {bill.metadata?.datasetSize !== undefined && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>
              {t('support.wallet.subscription.Extra dataset size')}:
            </FormLabel>
            <Box>{bill.metadata?.datasetSize}</Box>
          </Flex>
        )}
        {bill.metadata?.extraPoints !== undefined && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>
              {t('support.wallet.subscription.Extra ai points')}:
            </FormLabel>
            <Box>{bill.metadata.extraPoints}</Box>
          </Flex>
        )}
      </ModalBody>
    </MyModal>
  );
}
