import React from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { Box, Flex, ModalBody } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import dayjs from 'dayjs';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import {
  billTypeMap,
  billStatusMap,
  billPayWayMap
} from '@fastgpt/global/support/wallet/bill/constants';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/usage/tools';
import { standardSubLevelMap, subModeMap } from '@fastgpt/global/support/wallet/sub/constants';
import type { BillSchemaType } from '@fastgpt/global/support/wallet/bill/type';

interface BillDetailModalProps {
  bill: BillSchemaType & { couponName?: string };
  onClose: () => void;
}

const BillDetailModal = ({ bill, onClose }: BillDetailModalProps) => {
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
        {!!bill.couponName && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account_info:discount_coupon')}:</FormLabel>
            <Box>{t(bill.couponName as any)}</Box>
          </Flex>
        )}
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
};

export default BillDetailModal;
