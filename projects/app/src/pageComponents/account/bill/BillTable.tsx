import React, { useState, useMemo, useEffect } from 'react';
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
  Box
} from '@chakra-ui/react';
import {
  getBills,
  checkBalancePayResult,
  cancelBill,
  putUpdatePayment
} from '@/web/support/wallet/bill/api';
import dayjs from 'dayjs';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/usage/tools';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import type { BillPayWayEnum, BillTypeEnum } from '@fastgpt/global/support/wallet/bill/constants';
import {
  BillStatusEnum,
  billStatusMap,
  billTypeMap
} from '@fastgpt/global/support/wallet/bill/constants';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import QRCodePayModal, { type QRPayProps } from '@/components/support/wallet/QRCodePayModal';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import BillDetailModal from './BillDetailModal';
import type { BillSchemaType } from '@fastgpt/global/support/wallet/bill/type';

const BillTable = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [billType, setBillType] = useState<BillTypeEnum | undefined>(undefined);
  const [billDetailId, setBillDetailId] = useState<string>();
  const [qrPayData, setQRPayData] = useState<QRPayProps>();

  const billTypeList = useMemo(
    () =>
      [
        { label: t('account_bill:all'), value: undefined },
        ...Object.entries(billTypeMap).map(([key, value]) => ({
          label: t(value.label as any),
          value: key
        }))
      ] as {
        label: string;
        value: BillTypeEnum | undefined;
      }[],
    [t]
  );

  const {
    data: bills,
    isLoading,
    Pagination,
    getData,
    total,
    pageSize
  } = usePagination(getBills, {
    defaultPageSize: 20,
    storeToQuery: true,
    params: {
      type: billType
    },
    refreshDeps: [billType]
  });

  const { runAsync: handleRefreshPayOrder, loading: isRefreshing } = useRequest2(
    async (bill: BillSchemaType) => {
      const { status, description } = await checkBalancePayResult(bill._id);
      if (status === BillStatusEnum.SUCCESS) {
        toast({
          title: t('common:pay_success'),
          status: 'success'
        });
      } else if (status === BillStatusEnum.NOTPAY) {
        const payWay = bill.metadata?.payWay as BillPayWayEnum;
        const paymentData = await putUpdatePayment({
          billId: bill._id,
          payWay
        });

        setQRPayData({
          billId: bill._id,
          readPrice: formatStorePrice2Read(bill.price),
          payment: payWay,
          ...paymentData
        });
      } else {
        toast({
          title: t(description as any),
          status: 'warning'
        });
      }

      if (status === BillStatusEnum.SUCCESS || status === BillStatusEnum.CLOSED) {
        getData(1);
      }
    }
  );

  const { runAsync: handleCancelBill, loading: isCancelling } = useRequest2(
    async (billId: string) => {
      await cancelBill({ billId });
    },
    {
      manual: true,
      onSuccess: () => {
        getData(1);
      }
    }
  );

  return (
    <MyBox isLoading={isLoading} display={'flex'} flexDir={'column'} h={'100%'}>
      <TableContainer flex={'1 0 0'} h={0} overflowY={'auto'}>
        <Table>
          <Thead>
            <Tr>
              <Th>#</Th>
              <Th>
                <MySelect
                  list={billTypeList}
                  value={billType}
                  size={'sm'}
                  onChange={(e) => {
                    setBillType(e);
                  }}
                  w={'130px'}
                ></MySelect>
              </Th>
              <Th>{t('account_bill:time')}</Th>
              <Th>{t('account:support_wallet_amount')}</Th>
              <Th>{t('account:status')}</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {bills.map((item, i) => (
              <Tr key={item._id}>
                <Td>{i + 1}</Td>
                <Td>{t(billTypeMap[item.type]?.label as any)}</Td>
                <Td>
                  {item.createTime ? dayjs(item.createTime).format('YYYY/MM/DD HH:mm:ss') : '-'}
                </Td>
                <Td>{t('account:yuan', { amount: formatStorePrice2Read(item.price) })}</Td>
                <Td>{t(billStatusMap[item.status]?.label as any)}</Td>
                <Td display={'flex'} justifyContent={'end'}>
                  {item.status === 'NOTPAY' && (
                    <>
                      <Button
                        isLoading={isRefreshing}
                        mr={2}
                        onClick={() => handleRefreshPayOrder(item)}
                        size={'sm'}
                        variant={'primary'}
                      >
                        {t('common:Update')}
                      </Button>
                      <PopoverConfirm
                        content={t('common:cancel_bill_confirm')}
                        type={'delete'}
                        onConfirm={() => handleCancelBill(item._id)}
                        Trigger={
                          <Button isLoading={isCancelling} mr={2} size={'sm'} variant={'whiteBase'}>
                            {t('common:cancel_bill')}
                          </Button>
                        }
                      />
                    </>
                  )}
                  <Button
                    variant={'whiteBase'}
                    size={'sm'}
                    onClick={() => setBillDetailId(item._id)}
                  >
                    {t('account_bill:detail')}
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {!isLoading && bills.length === 0 && (
          <Flex
            mt={'20vh'}
            flexDirection={'column'}
            alignItems={'center'}
            justifyContent={'center'}
          >
            <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
            <Box mt={2} color={'myGray.500'}>
              {t('account_bill:no_invoice_record')}
            </Box>
          </Flex>
        )}
      </TableContainer>

      {total >= pageSize && (
        <Flex mt={3} justifyContent={'center'}>
          <Pagination />
        </Flex>
      )}
      {!!billDetailId && (
        <BillDetailModal billId={billDetailId} onClose={() => setBillDetailId(undefined)} />
      )}
      {!!qrPayData && (
        <QRCodePayModal
          onClose={() => {
            setQRPayData(undefined);
            getData(1);
          }}
          discountCouponName={qrPayData.discountCouponName}
          {...qrPayData}
          onSuccess={() => {
            setQRPayData(undefined);
            toast({
              title: t('common:pay_success'),
              status: 'success'
            });
            getData(1);
          }}
        />
      )}
    </MyBox>
  );
};

export default BillTable;
