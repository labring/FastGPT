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
import type { BillTypeEnum } from '@fastgpt/global/support/wallet/bill/constants';
import {
  BillStatusEnum,
  billPayWayMap,
  billStatusMap,
  billTypeMap
} from '@fastgpt/global/support/wallet/bill/constants';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { standardSubLevelMap, subModeMap } from '@fastgpt/global/support/wallet/sub/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

const BillTable = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [billType, setBillType] = useState<BillTypeEnum | undefined>(undefined);
  const [billDetail, setBillDetail] = useState<BillSchemaType>();

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
    params: {
      type: billType
    },
    defaultRequest: false
  });

  const { runAsync: handleRefreshPayOrder, loading: isRefreshing } = useRequest2(
    async (payId: string) => {
      const { status, description } = await checkBalancePayResult(payId);
      if (status === BillStatusEnum.SUCCESS) {
        toast({
          title: t('common:pay_success'),
          status: 'success'
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

  useEffect(() => {
    getData(1);
  }, [billType]);

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
              <Th>{t('account_bill:support_wallet_amount')}</Th>
              <Th>{t('account_bill:status')}</Th>
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
                <Td>{t('account_bill:yuan', { amount: formatStorePrice2Read(item.price) })}</Td>
                <Td>{t(billStatusMap[item.status]?.label as any)}</Td>
                <Td>
                  {item.status === 'NOTPAY' && (
                    <Button
                      isLoading={isRefreshing}
                      mr={4}
                      onClick={() => handleRefreshPayOrder(item._id)}
                      size={'sm'}
                    >
                      {t('account_bill:update')}
                    </Button>
                  )}
                  <Button variant={'whiteBase'} size={'sm'} onClick={() => setBillDetail(item)}>
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
      title={t('account_bill:bill_detail')}
      maxW={['90vw', '700px']}
    >
      <ModalBody>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 120px'}>{t('account_bill:order_number')}:</FormLabel>
          <Box>{bill.orderId}</Box>
        </Flex>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 120px'}>{t('account_bill:generation_time')}:</FormLabel>
          <Box>{dayjs(bill.createTime).format('YYYY/MM/DD HH:mm:ss')}</Box>
        </Flex>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 120px'}>{t('account_bill:order_type')}:</FormLabel>
          <Box>{t(billTypeMap[bill.type]?.label as any)}</Box>
        </Flex>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 120px'}>{t('account_bill:status')}:</FormLabel>
          <Box>{t(billStatusMap[bill.status]?.label as any)}</Box>
        </Flex>
        {!!bill.metadata?.payWay && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account_bill:payment_method')}:</FormLabel>
            <Box>{t(billPayWayMap[bill.metadata.payWay]?.label as any)}</Box>
          </Flex>
        )}
        {!!bill.price && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account_bill:support_wallet_amount')}:</FormLabel>
            <Box>{t('account_bill:yuan', { amount: formatStorePrice2Read(bill.price) })}</Box>
          </Flex>
        )}
        {bill.metadata && !!bill.price && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account_bill:has_invoice')}:</FormLabel>
            {bill.metadata.payWay === 'balance' ? (
              t('user:bill.not_need_invoice')
            ) : (
              <Box>{bill.hasInvoice ? t('account_bill:yes') : t('account_bill:no')}</Box>
            )}
          </Flex>
        )}
        {!!bill.metadata?.subMode && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account_bill:subscription_period')}:</FormLabel>
            <Box>{t(subModeMap[bill.metadata.subMode]?.label as any)}</Box>
          </Flex>
        )}
        {!!bill.metadata?.standSubLevel && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account_bill:subscription_package')}:</FormLabel>
            <Box>{t(standardSubLevelMap[bill.metadata.standSubLevel]?.label as any)}</Box>
          </Flex>
        )}
        {bill.metadata?.month !== undefined && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account_bill:subscription_mode_month')}:</FormLabel>
            <Box>{`${bill.metadata?.month} ${t('account_bill:month')}`}</Box>
          </Flex>
        )}
        {bill.metadata?.datasetSize !== undefined && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account_bill:extra_dataset_size')}:</FormLabel>
            <Box>{bill.metadata?.datasetSize}</Box>
          </Flex>
        )}
        {bill.metadata?.extraPoints !== undefined && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account_bill:extra_ai_points')}:</FormLabel>
            <Box>{bill.metadata.extraPoints}</Box>
          </Flex>
        )}
      </ModalBody>
    </MyModal>
  );
}
