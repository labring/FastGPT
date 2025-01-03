import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, ModalBody } from '@chakra-ui/react';
import { checkBalancePayResult } from '@/web/support/wallet/bill/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRouter } from 'next/router';
import { getErrText } from '@fastgpt/global/common/error/utils';
import LightTip from '@fastgpt/web/components/common/LightTip';
import Script from 'next/script';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';

export type QRPayProps = {
  readPrice: number;
  codeUrl: string;
  billId: string;
};

const qrCodeSize = 168;

const QRCodePayModal = ({
  tip,
  readPrice,
  codeUrl,
  billId,
  onSuccess
}: QRPayProps & { tip?: string; onSuccess?: () => any }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const dom = useRef<HTMLDivElement>(null);

  const drawCode = useCallback(() => {
    if (dom.current && window.QRCode && !dom.current.innerHTML) {
      new window.QRCode(dom.current, {
        text: codeUrl,
        width: qrCodeSize,
        height: qrCodeSize,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.H
      });
    }
  }, [codeUrl]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
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
  }, [billId, drawCode, onSuccess, toast]);

  return (
    <>
      <Script
        src={getWebReqUrl('/js/qrcode.min.js')}
        strategy="lazyOnload"
        onLoad={drawCode}
      ></Script>

      <MyModal isOpen title={t('common:user.Pay')} iconSrc="/imgs/modal/pay.svg">
        <ModalBody textAlign={'center'} pb={10} whiteSpace={'pre-wrap'}>
          {tip && <LightTip text={tip} mb={8} textAlign={'left'} />}
          <Box ref={dom} id={'payQRCode'} display={'inline-block'} h={`${qrCodeSize}px`}></Box>
          <Box mt={5} textAlign={'center'}>
            {t('common:pay.wechat', { price: readPrice })}
          </Box>
        </ModalBody>
      </MyModal>
    </>
  );
};

export default React.memo(QRCodePayModal);
