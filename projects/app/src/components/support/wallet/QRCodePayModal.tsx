import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, ModalBody } from '@chakra-ui/react';
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
  tip,
  readPrice,
  codeUrl,
  billId,
  onSuccess
}: QRPayProps & { tip?: string; onSuccess?: () => any }) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { toast } = useToast();
  const dom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    const drawCode = () => {
      if (dom.current && window.QRCode && !dom.current.innerHTML) {
        new window.QRCode(dom.current, {
          text: codeUrl,
          width: 128,
          height: 128,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.H
        });
      }
    };
    const check = async () => {
      try {
        const res = await checkBalancePayResult(billId);
        if (res) {
          try {
            await onSuccess?.();
            toast({
              title: res,
              status: 'success'
            });
            setTimeout(() => {
              router.reload();
            }, 1000);
            return;
          } catch (error) {
            toast({
              title: getErrText(error),
              status: 'error'
            });
          }
        }
      } catch (error) {}

      drawCode();

      timer = setTimeout(check, 2000);
    };

    check();

    return () => clearTimeout(timer);
  }, [billId, onSuccess, toast]);

  return (
    <MyModal isOpen title={t('common:user.Pay')} iconSrc="/imgs/modal/pay.svg">
      <ModalBody textAlign={'center'} py={6} whiteSpace={'pre-wrap'}>
        {tip && (
          <Box fontSize={'sm'} whiteSpace={'pre'} mb={3}>
            {tip}
          </Box>
        )}
        <Box ref={dom} id={'payQRCode'} display={'inline-block'} h={'128px'}></Box>
        <Box mt={3} textAlign={'center'}>
          {t('common:pay.wechat', { price: readPrice })}
        </Box>
      </ModalBody>
    </MyModal>
  );
};

export default React.memo(QRCodePayModal);
