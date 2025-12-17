import React, { useMemo } from 'react';
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
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getBillDetail } from '@/web/support/wallet/bill/api';
import { i18nT } from '@fastgpt/web/i18n/utils';

type BillDetailModalProps = {
  billId: string;
  onClose: () => void;
};

const BillDetailModal = ({ billId, onClose }: BillDetailModalProps) => {
  const { t } = useTranslation();

  const { data: bill, loading } = useRequest2(() => getBillDetail(billId), {
    refreshDeps: [billId],
    manual: false
  });

  const customConfigItems = useMemo(() => {
    if (bill?.metadata.standSubLevel !== 'custom') return [];
    const customSub = bill?.couponDetail?.subscriptions?.find(
      (sub) => sub.type === 'standard' && sub.level === 'custom' && sub.customConfig
    );

    if (!customSub?.customConfig) return [];

    const config = customSub.customConfig;
    const items = [];

    if (config.maxTeamMember !== undefined) {
      items.push({
        key: i18nT('account:max_team_member'),
        value: config.maxTeamMember,
        unit: ''
      });
    }
    if (config.maxAppAmount !== undefined) {
      items.push({
        key: i18nT('account:max_app_amount'),
        value: config.maxAppAmount,
        unit: ''
      });
    }
    if (config.maxDatasetAmount !== undefined) {
      items.push({
        key: i18nT('account:max_dataset_amount'),
        value: config.maxDatasetAmount,
        unit: ''
      });
    }
    if (config.requestsPerMinute !== undefined) {
      items.push({
        key: i18nT('account:requests_per_minute'),
        value: config.requestsPerMinute,
        unit: ''
      });
    }
    if (config.maxDatasetSize !== undefined) {
      items.push({
        key: i18nT('account:max_dataset_size'),
        value: config.maxDatasetSize,
        unit: ''
      });
    }
    if (config.chatHistoryStoreDuration !== undefined) {
      items.push({
        key: i18nT('account:chat_history_store_duration'),
        value: config.chatHistoryStoreDuration,
        unit: 'day'
      });
    }
    if (config.websiteSyncPerDataset !== undefined) {
      items.push({
        key: i18nT('account:website_sync_per_dataset'),
        value: config.websiteSyncPerDataset,
        unit: ''
      });
    }
    if (config.appRegistrationCount !== undefined) {
      items.push({
        key: i18nT('account:app_registration_count'),
        value: config.appRegistrationCount,
        unit: ''
      });
    }
    if (config.auditLogStoreDuration !== undefined) {
      items.push({
        key: i18nT('account:audit_log_store_duration'),
        value: config.auditLogStoreDuration,
        unit: 'day'
      });
    }
    if (config.ticketResponseTime !== undefined) {
      items.push({
        key: i18nT('account:ticket_response_time'),
        value: config.ticketResponseTime,
        unit: 'h'
      });
    }
    if (config.customDomain !== undefined) {
      items.push({
        key: i18nT('account:custom_domain'),
        value: config.customDomain,
        unit: ''
      });
    }

    return items;
  }, [bill?.couponDetail?.subscriptions]);

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/modal/bill.svg"
      title={t('account:bill_detail')}
      maxW={['90vw', '700px']}
      isLoading={loading}
    >
      <ModalBody minH={400}>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 120px'}>{t('account:order_number')}:</FormLabel>
          <Box>{bill?.orderId}</Box>
        </Flex>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 120px'}>{t('account:generation_time')}:</FormLabel>
          <Box>{dayjs(bill?.createTime).format('YYYY/MM/DD HH:mm:ss')}</Box>
        </Flex>
        {bill?.type && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account:order_type')}:</FormLabel>
            <Box>{t(billTypeMap[bill.type]?.label as any)}</Box>
          </Flex>
        )}
        {bill?.status && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account:status')}:</FormLabel>
            <Box>{t(billStatusMap[bill.status]?.label as any)}</Box>
          </Flex>
        )}
        {!!bill?.discountCouponName && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account_info:discount_coupon')}:</FormLabel>
            <Box>{t(bill?.discountCouponName as any)}</Box>
          </Flex>
        )}
        {!!bill?.metadata?.payWay && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account:payment_method')}:</FormLabel>
            <Box>{t(billPayWayMap[bill?.metadata.payWay]?.label as any)}</Box>
          </Flex>
        )}
        {!!bill?.price && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account:support_wallet_amount')}:</FormLabel>
            <Box>{t('account:yuan', { amount: formatStorePrice2Read(bill?.price) })}</Box>
          </Flex>
        )}
        {bill?.metadata && !!bill?.price && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account:has_invoice')}:</FormLabel>
            {bill?.metadata.payWay === 'balance' ? (
              t('user:bill.not_need_invoice')
            ) : (
              <Box>{bill.hasInvoice ? t('account:yes') : t('account:no')}</Box>
            )}
          </Flex>
        )}
        {!!bill?.metadata?.subMode && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account:subscription_period')}:</FormLabel>
            <Box>{t(subModeMap[bill.metadata.subMode]?.label as any)}</Box>
          </Flex>
        )}
        {!!bill?.metadata?.standSubLevel && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account:subscription_package')}:</FormLabel>
            <Box>{t(standardSubLevelMap[bill.metadata.standSubLevel]?.label as any)}</Box>
          </Flex>
        )}
        {bill?.metadata?.month !== undefined && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account:subscription_mode_month')}:</FormLabel>
            <Box>{`${bill.metadata?.month} ${t('account:month')}`}</Box>
          </Flex>
        )}
        {bill?.metadata?.datasetSize !== undefined && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account:extra_dataset_size')}:</FormLabel>
            <Box>{bill.metadata?.datasetSize}</Box>
          </Flex>
        )}
        {bill?.metadata?.extraPoints !== undefined && (
          <Flex alignItems={'center'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account:extra_ai_points')}:</FormLabel>
            <Box>{bill.metadata.extraPoints}</Box>
          </Flex>
        )}
        {customConfigItems.length > 0 && (
          <Flex alignItems={'flex-start'} pb={4}>
            <FormLabel flex={'0 0 120px'}>{t('account:custom_config_details')}:</FormLabel>
            <Box flex={1} fontSize="sm" color="gray.600">
              {customConfigItems.map((item, idx) => (
                <Box key={idx} pb={0.5}>
                  {t(item.key)}: {item.value}
                  {item.unit &&
                    (item.unit === 'day'
                      ? t('account:day')
                      : item.unit === 'h'
                        ? t('account:hour')
                        : item.unit)}
                </Box>
              ))}
            </Box>
          </Flex>
        )}
      </ModalBody>
    </MyModal>
  );
};

export default BillDetailModal;
