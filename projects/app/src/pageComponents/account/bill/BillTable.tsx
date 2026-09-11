import React, { useState, useRef } from 'react';
import { Button, Table, Thead, Tbody, Tr, Th, Td, Flex, Box } from '@chakra-ui/react';
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
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import type { BillPayWayEnum } from '@fastgpt/global/support/wallet/bill/constants';
import {
  BillStatusEnum,
  billStatusMap,
  billTypeMap
} from '@fastgpt/global/support/wallet/bill/constants';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import QRCodePayModal, { type QRPayProps } from '@/components/support/wallet/QRCodePayModal';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import BillDetailModal from './BillDetailModal';
import { accountPageRootStyles } from '@/pageComponents/account/styles';
import type {
  BillItemType,
  GetBillListQueryType
} from '@fastgpt/global/openapi/support/wallet/bill/api';
import { FixedTableLayout } from '@fastgpt/web/components/common/FixedTable';

/** 根据顶部操作栏传入的套餐类型加载账单，筛选变化时由分页 Hook 重置页码。 */
const BillTable = ({ billType }: { billType?: GetBillListQueryType['type'] }) => {
  const { t } = useClientTranslation('account_bill');
  const { toast } = useToast();
  const [billDetailId, setBillDetailId] = useState<string>();
  const [qrPayData, setQRPayData] = useState<QRPayProps>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    data: bills,
    isLoading,
    Pagination,
    getData,
    total,
    pageSize
  } = usePagination(getBills, {
    defaultPageSize: 20,
    pageSizeCacheKey: 'account-bill-records',
    storeToQuery: true,
    params: {
      type: billType
    },
    refreshDeps: [billType],
    scrollContainerRef
  });

  const { runAsync: handleRefreshPayOrder, loading: isRefreshing } = useRequest(
    async (bill: BillItemType) => {
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

        // 企微支付直接打开 URL
        if (payWay === 'wecom' && paymentData.payUrl) {
          toast({
            title: t('account_bill:wecom_not_pay_tip'),
            status: 'success'
          });
          window.open(paymentData.payUrl, '_blank');
          return;
        }

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

  const { runAsync: handleCancelBill, loading: isCancelling } = useRequest(
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
    <MyBox {...accountPageRootStyles} isLoading={isLoading} display={'flex'} flexDir={'column'}>
      <FixedTableLayout
        horizontalScroll
        scrollMode="normal"
        bodyRef={scrollContainerRef}
        rootProps={{ flex: ['0 0 auto', '1 0 0'], h: ['60dvh', 0], minH: 0 }}
        headerProps={{ px: [2, 4] }}
        bodyProps={{
          flex: '1 1 0',
          h: 0,
          minH: 0,
          overflowY: 'auto',
          px: [2, 4]
        }}
        renderHeader={({ headerTableWidth }) => (
          <Table
            minW={'950px'}
            sx={{ tableLayout: 'fixed', width: `${headerTableWidth} !important` }}
          >
            <colgroup>
              <col style={{ width: '60px' }} />
              <col style={{ width: '160px' }} />
              <col style={{ width: '210px' }} />
              <col style={{ width: '160px' }} />
              <col style={{ width: '160px' }} />
              <col style={{ width: '240px' }} />
            </colgroup>
            <Thead>
              <Tr>
                <Th>#</Th>
                <Th>{t('account_bill:package_type')}</Th>
                <Th>{t('account_bill:time')}</Th>
                <Th>{t('account_bill:support_wallet_amount')}</Th>
                <Th>{t('account_bill:status')}</Th>
                <Th></Th>
              </Tr>
            </Thead>
          </Table>
        )}
        renderBody={() => (
          <>
            <Table minW={'950px'} w={'100%'} sx={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '60px' }} />
                <col style={{ width: '160px' }} />
                <col style={{ width: '210px' }} />
                <col style={{ width: '160px' }} />
                <col style={{ width: '160px' }} />
                <col style={{ width: '240px' }} />
              </colgroup>
              <Tbody fontSize={'sm'}>
                {bills.map((item, i) => (
                  <Tr key={item._id}>
                    <Td>{i + 1}</Td>
                    <Td>{t(billTypeMap[item.type]?.label as any)}</Td>
                    <Td>
                      {item.createTime ? dayjs(item.createTime).format('YYYY/MM/DD HH:mm:ss') : '-'}
                    </Td>
                    <Td>{t('account_bill:yuan', { amount: formatStorePrice2Read(item.price) })}</Td>
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
                              <Button
                                isLoading={isCancelling}
                                mr={2}
                                size={'sm'}
                                variant={'whiteBase'}
                              >
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
          </>
        )}
        footer={
          total >= pageSize ? (
            <Flex mt={3} justifyContent={'center'}>
              <Pagination />
            </Flex>
          ) : undefined
        }
      />
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
