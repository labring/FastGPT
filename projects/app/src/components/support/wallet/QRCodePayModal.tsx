import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, ModalBody, Flex, Button } from '@chakra-ui/react';
import { checkBalancePayResult, getQRCodeInPayModal } from '@/web/support/wallet/bill/api';
import LightTip from '@fastgpt/web/components/common/LightTip';
import QRCode from 'qrcode';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  BillPayWayEnum,
  BillStatusEnum,
  DrawBillQRItem,
  QR_CODE_SIZE
} from '@fastgpt/global/support/wallet/bill/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import Markdown from '@/components/Markdown';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useToast } from '@fastgpt/web/hooks/useToast';

export type QRPayProps = {
  readPrice: number;
  qrItem: string;
  billId: string;
  payment: BillPayWayEnum;
  tip?: string;
  type: DrawBillQRItem;
};

const QRCodePayModal = ({
  tip,
  readPrice,
  qrItem,
  billId,
  payment,
  onSuccess,
  type
}: QRPayProps & { tip?: string; onSuccess?: () => any }) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const { feConfigs } = useSystemStore();

  const isAlipayConfigured = feConfigs.payConfig?.alipay;
  const isWxConfigured = feConfigs.payConfig?.wx;
  const isBankConfigured = feConfigs.payConfig?.bank;

  const [selectedPayment, setSelectedPayment] = useState(payment);
  const [currentQrItem, setCurrentQrItem] = useState(qrItem);
  const [drawType, setDrawType] = useState(type);

  const drawCode = useCallback(() => {
    if (selectedPayment !== BillPayWayEnum.wx) return;

    const canvas = document.createElement('canvas');

    QRCode.toCanvas(canvas, currentQrItem, {
      width: QR_CODE_SIZE,
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
        }
      })
      .catch(console.error);
  }, [currentQrItem, selectedPayment]);

  useEffect(() => {
    drawCode();
  }, [drawCode]);

  useEffect(() => {
    if (payment === BillPayWayEnum.alipay && !isWxConfigured) {
      setSelectedPayment(BillPayWayEnum.alipay);
    }
  }, [payment, isWxConfigured]);

  useEffect(() => {
    payment && setSelectedPayment(payment);
  }, [payment]);

  const handlePaymentChange = async (newPayment: BillPayWayEnum) => {
    if (newPayment === selectedPayment) {
      return;
    }
    try {
      const response = await getQRCodeInPayModal({ billId, payWay: newPayment });
      setSelectedPayment(newPayment);
      setDrawType(response.type);
      setCurrentQrItem(response.qrItem);
    } catch (error: any) {
      toast.toast({
        description: error.message,
        status: 'error',
        duration: 2000,
        isClosable: true
      });
    }
  };

  const getPaymentButtonStyles = (isActive: boolean) => ({
    baseStyle: {
      display: 'flex',
      padding: '13px 22px 13px 19px',
      justifyContent: 'center',
      alignItems: 'center',
      flex: '1 0 0',
      borderRadius: '7.152px',
      border: isActive ? '1px solid #3370FF' : '1px solid #E8EBF0',
      background: '#FFF',
      _hover: {
        background: isActive ? '#FFF' : '#F7F8FA',
        border: isActive ? '1px solid #3370FF' : '1px solid #E8EBF0'
      },
      _active: {
        background: '#FFF',
        borderColor: '#3370FF'
      }
    }
  });

  const renderPaymentContent = () => {
    switch (drawType) {
      case 'qr':
        return <Box ref={canvasRef} display={'inline-block'} h={`${QR_CODE_SIZE}px`} />;
      case 'markdown':
        return <Markdown source={currentQrItem} />;
      case 'iframe':
        return (
          <iframe
            srcDoc={currentQrItem}
            style={{
              width: QR_CODE_SIZE + 5,
              height: QR_CODE_SIZE + 5,
              border: 'none',
              display: 'inline-block'
            }}
          />
        );
      default:
        return null;
    }
  };

  useRequest2(() => checkBalancePayResult(billId), {
    manual: false,
    pollingInterval: 2000,
    onSuccess: (res) => {
      if (res === BillStatusEnum.SUCCESS) {
        toast.toast({
          description: t('common:pay_success'),
          status: 'success',
          duration: 2000,
          isClosable: true
        });
        onSuccess?.();
      }
    },
    onError: (res) => {
      toast.toast({
        description: res.message,
        status: 'error',
        duration: 2000,
        isClosable: true
      });
    }
  });

  return (
    <MyModal isOpen title={t('common:user.Pay')} iconSrc="/imgs/modal/wallet.svg" w={'600px'}>
      <ModalBody textAlign={'center'} padding={['16px 24px', '32px 52px']}>
        {tip && <LightTip text={tip} mb={6} textAlign={'left'} />}
        <Box>{t('common:pay_money')}</Box>
        <Box color="primary.600" fontSize="32px" fontWeight="600" lineHeight="40px" mb={6}>
          ¥{readPrice}.00
        </Box>

        {renderPaymentContent()}

        <Box
          mt={5}
          textAlign={'center'}
          display="flex"
          alignItems="center"
          justifyContent="center"
          gap={1}
        >
          <MyIcon name={'common/info'} w={4} h={4} />
          {t('common:pay.noclose')}
        </Box>

        <Flex justifyContent="center" gap={3} mt={6}>
          {isWxConfigured && (
            <Button
              flex={1}
              h={10}
              onClick={() => handlePaymentChange(BillPayWayEnum.wx)}
              color={'myGray.900'}
              leftIcon={<MyIcon name={'common/wechat'} />}
              sx={getPaymentButtonStyles(selectedPayment === BillPayWayEnum.wx).baseStyle}
            >
              {t('common:pay.wx_payment')}
            </Button>
          )}
          {isAlipayConfigured && (
            <Button
              flex={1}
              h={10}
              color={'myGray.900'}
              onClick={() => handlePaymentChange(BillPayWayEnum.alipay)}
              leftIcon={<MyIcon name={'common/alipay'} />}
              sx={getPaymentButtonStyles(selectedPayment === BillPayWayEnum.alipay).baseStyle}
            >
              {t('common:pay_alipay_payment')}
            </Button>
          )}
          {isBankConfigured && (
            <Button
              flex={1}
              h={10}
              color={'myGray.900'}
              onClick={() => handlePaymentChange(BillPayWayEnum.bank)}
              sx={getPaymentButtonStyles(selectedPayment === BillPayWayEnum.bank).baseStyle}
            >
              {t('common:pay_corporate_payment')}
            </Button>
          )}
        </Flex>
      </ModalBody>
    </MyModal>
  );
};

export default React.memo(QRCodePayModal);
