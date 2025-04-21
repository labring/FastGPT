import { redeemCoupon } from '@/web/support/user/team/api';
import { Button, Input, VStack, Text } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import React from 'react';
import { useTranslation } from 'react-i18next';

const RedeemCouponModal = ({
  isOpen,
  onClose,
  onSuccess
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const { t } = useTranslation();

  const [couponCode, setCouponCode] = React.useState('');

  const { runAsync: redeemCouponAsync, loading } = useRequest2(redeemCoupon, {
    manual: true,
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    successToast: t('common.Success')
  });

  return (
    <MyModal
      isOpen={isOpen}
      onClose={onClose}
      iconSrc="support/account/coupon"
      title={t('account_info:redeem_coupon')}
    >
      <VStack px={'24px'} py={'36px'}>
        <Text fontWeight={500} fontSize={'14px'} mb={'8px'} mr={'auto'}>
          {t('account_info:redeem_coupon')}
        </Text>
        <Input
          mb={'24px'}
          placeholder={t('account_info:redeem_coupon')}
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value)}
        />
        <Button isLoading={loading} ml={'auto'} onClick={() => redeemCouponAsync(couponCode)}>
          {t('account_info:confirm')}
        </Button>
      </VStack>
    </MyModal>
  );
};

export default RedeemCouponModal;
