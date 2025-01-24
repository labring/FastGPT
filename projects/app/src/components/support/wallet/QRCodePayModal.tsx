import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, ModalBody } from '@chakra-ui/react';
import { checkBalancePayResult } from '@/web/support/wallet/bill/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import LightTip from '@fastgpt/web/components/common/LightTip';
import QRCode from 'qrcode';

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
  const canvasRef = useRef<HTMLDivElement>(null);

  const drawCode = useCallback(() => {
    const canvas = document.createElement('canvas');
    QRCode.toCanvas(canvas, codeUrl, {
      width: qrCodeSize,
      margin: 0,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })
      .then(() => {
        if (canvasRef.current) {
          canvasRef.current.innerHTML = '';
          canvasRef.current.appendChild(canvas);
        } else {
          drawCode();
        }
      })
      .catch((err) => {
        console.error('QRCode generation error:', err);
      });
  }, [codeUrl]);

  useEffect(() => {
    drawCode();
  }, [drawCode]);

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
            return clearTimeout(timer);
          } catch (error) {
            toast({
              title: getErrText(error),
              status: 'error'
            });
          }
        }
      } catch (error) {}
      clearTimeout(timer);
      timer = setTimeout(check, 2000);
    };

    check();

    return () => clearTimeout(timer);
  }, [billId, drawCode, onSuccess, toast]);

  return (
    <MyModal isOpen title={t('common:user.Pay')} iconSrc="/imgs/modal/pay.svg">
      <ModalBody textAlign={'center'} pb={10} whiteSpace={'pre-wrap'}>
        {tip && <LightTip text={tip} mb={8} textAlign={'left'} />}
        <Box ref={canvasRef} display={'inline-block'} h={`${qrCodeSize}px`}></Box>
        <Box mt={5} textAlign={'center'}>
          {t('common:pay.wechat', { price: readPrice })}
        </Box>
      </ModalBody>
    </MyModal>
  );
};

export default React.memo(QRCodePayModal);
