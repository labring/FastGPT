import { redeemCoupon } from '@/web/support/user/team/api';
import { Button, Input, VStack, Text, ModalBody, Box, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import React from 'react';
import { useTranslation } from 'next-i18next';

const RedeemCouponModal = ({
  onClose,
  onSuccess
}: {
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
    successToast: t('common:Success')
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="support/account/coupon"
      title={t('account_info:redeem_coupon')}
    >
      <ModalBody>
        <Box fontWeight={500} color={'myGray.900'} mb={'1'}>
          {t('account_info:redeem_coupon')}
        </Box>
        <Input
          placeholder={t('account_info:redeem_coupon')}
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value)}
        />
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('account_info:cancel')}
        </Button>
        <Button ml={2} isLoading={loading} onClick={() => redeemCouponAsync(couponCode)}>
          {t('account_info:confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default RedeemCouponModal;
