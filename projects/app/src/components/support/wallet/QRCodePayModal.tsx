import MyModal from '@/components/MyModal';
import React, { useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, ModalBody, ModalFooter } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { checkBalancePayResult } from '@/web/support/wallet/bill/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRouter } from 'next/router';

export type QRPayProps = {
  readPrice: number;
  codeUrl: string;
  billId: string;
};

const QRCodePayModal = ({ readPrice, codeUrl, billId }: QRPayProps) => {
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
      onSuccess(res) {
        if (!res) return;
        toast({
          title: res,
          status: 'success'
        });
        router.reload();
      }
    }
  );

  return (
    <MyModal isOpen title={t('user.Pay')} iconSrc="/imgs/modal/pay.svg">
      <ModalBody textAlign={'center'}>
        <Box mb={3}>请微信扫码支付: {readPrice}元，请勿关闭页面</Box>
        <Box id={'payQRCode'} display={'inline-block'}></Box>
      </ModalBody>
      <ModalFooter />
    </MyModal>
  );
};

export default React.memo(QRCodePayModal);
