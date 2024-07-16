import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, ModalBody, ModalFooter } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { checkBalancePayResult } from '@/web/support/wallet/bill/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRouter } from 'next/router';
import { getErrText } from '@fastgpt/global/common/error/utils';

export type QRPayProps = {
  readPrice: number;
  codeUrl: string;
  billId: string;
};

const QRCodePayModal = ({
  readPrice,
  codeUrl,
  billId,
  onSuccess
}: QRPayProps & { onSuccess?: () => any }) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { toast } = useToast();
  const dom = document.getElementById('payQRCode');

  useEffect(() => {
    if (dom && window.QRCode) {
      new window.QRCode(dom, {
        text: codeUrl,
        width: 128,
        height: 128,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.H
      });
    }
  }, [dom]);

  useQuery(
    [billId],
    () => {
      if (!billId) return null;
      return checkBalancePayResult(billId);
    },
    {
      enabled: !!billId,
      refetchInterval: 3000,
      onSuccess: async (res) => {
        if (!res) return;

        try {
          await onSuccess?.();
          toast({
            title: res,
            status: 'success'
          });
        } catch (error) {
          toast({
            title: getErrText(error),
            status: 'error'
          });
        }

        setTimeout(() => {
          router.reload();
        }, 1000);
      }
    }
  );

  return (
    <MyModal isOpen title={t('common:user.Pay')} iconSrc="/imgs/modal/pay.svg">
      <ModalBody textAlign={'center'}>
        <Box mb={3}>请微信扫码支付: {readPrice}元，请勿关闭页面</Box>
        <Box id={'payQRCode'} display={'inline-block'} h={'128px'}></Box>
      </ModalBody>
      <ModalFooter />
    </MyModal>
  );
};

export default React.memo(QRCodePayModal);
