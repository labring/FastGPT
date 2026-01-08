import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation, Trans } from 'next-i18next';
import { Box, ModalBody, Flex, Button, Text, Link } from '@chakra-ui/react';
import { checkBalancePayResult, putUpdatePayment } from '@/web/support/wallet/bill/api';
import LightTip from '@fastgpt/web/components/common/LightTip';
import QRCode from 'qrcode';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  BillPayWayEnum,
  BillStatusEnum,
  QR_CODE_SIZE
} from '@fastgpt/global/support/wallet/bill/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import Markdown from '@/components/Markdown';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { CreateBillResponseType } from '@fastgpt/global/openapi/support/wallet/bill/api';

export type QRPayProps = CreateBillResponseType & {
  tip?: string;
  discountCouponName?: string;
};

const QRCodePayModal = ({
  tip,
  readPrice,
  billId,
  payment,
  qrCode,
  iframeCode,
  markdown,
  onSuccess,
  discountCouponName,
  onClose
}: QRPayProps & {
  tip?: string;
  onSuccess?: () => any;
  onClose?: () => void;
}) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const { feConfigs } = useSystemStore();

  const isAlipayConfigured = feConfigs.payConfig?.alipay;
  const isWxConfigured = feConfigs.payConfig?.wx;
  const isBankConfigured = feConfigs.payConfig?.bank;

  const MIN_QR_SIZE = 150;
  const [dynamicQRSize, setDynamicQRSize] = useState(QR_CODE_SIZE);

  useEffect(() => {
    const calculateQRSize = () => {
      const windowHeight = window.innerHeight;
      const reservedSpace = 470 + (tip ? 60 : 0) + (discountCouponName ? 30 : 0);
      const availableHeight = windowHeight - reservedSpace;

      const newSize = Math.min(QR_CODE_SIZE, Math.max(MIN_QR_SIZE, availableHeight));

      setDynamicQRSize(newSize);
    };

    window.addEventListener('resize', calculateQRSize);

    return () => {
      window.removeEventListener('resize', calculateQRSize);
    };
  }, [tip, discountCouponName]);

  const [payWayRenderData, setPayWayRenderData] = useState<{
    qrCode?: string;
    iframeCode?: string;
    markdown?: string;
  }>({
    qrCode,
    iframeCode,
    markdown
  });

  const [selectedPayment, setSelectedPayment] = useState(payment);
  const { runAsync: handlePaymentChange, loading: isUpdating } = useRequest2(
    async (newPayment: BillPayWayEnum) => {
      if (newPayment === selectedPayment) {
        return;
      }

      const response = await putUpdatePayment({ billId, payWay: newPayment });
      setPayWayRenderData(response);
      setSelectedPayment(newPayment);
    },
    {
      refreshDeps: [billId, selectedPayment]
    }
  );

  // Check pay result
  useRequest2(() => checkBalancePayResult(billId), {
    manual: false,
    pollingInterval: 2000,
    onSuccess: ({ status, description }) => {
      if (status === BillStatusEnum.SUCCESS) {
        toast.toast({
          description: t('common:pay_success'),
          status: 'success',
          duration: 2000
        });
        onSuccess?.();
      } else {
        console.log(status, description);
      }
    }
  });

  // UI render
  // Draw QR code
  const drawCode = useCallback(() => {
    if (!payWayRenderData.qrCode) return;

    const canvas = document.createElement('canvas');

    QRCode.toCanvas(canvas, payWayRenderData.qrCode, {
      width: dynamicQRSize,
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
  }, [payWayRenderData.qrCode, dynamicQRSize]);
  useEffect(() => {
    drawCode();
  }, [drawCode]);
  // Payment Button
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
    if (payWayRenderData.qrCode) {
      return <Box ref={canvasRef} display={'inline-block'} h={`${dynamicQRSize}px`} />;
    }
    if (payWayRenderData.iframeCode) {
      return (
        <iframe
          srcDoc={payWayRenderData.iframeCode}
          style={{
            width: dynamicQRSize + 5,
            height: dynamicQRSize + 5,
            border: 'none',
            display: 'inline-block'
          }}
        />
      );
    }
    if (payWayRenderData.markdown) {
      return <Markdown source={payWayRenderData.markdown} />;
    }
    return null;
  };

  return (
    <MyModal
      isLoading={isUpdating}
      isOpen
      title={t('common:user.Pay')}
      iconSrc="/imgs/modal/wallet.svg"
      w={'600px'}
      onClose={onClose}
      closeOnOverlayClick={false}
    >
      <ModalBody textAlign={'center'} padding={['16px 24px', '32px 52px']}>
        {tip && <LightTip text={tip} mb={6} textAlign={'left'} />}
        <Box>{t('common:pay_money')}</Box>
        <Box
          color="primary.600"
          fontSize="32px"
          fontWeight="600"
          lineHeight="40px"
          mb={discountCouponName ? 1 : 6}
        >
          ¥{readPrice.toFixed(2)}
        </Box>
        {discountCouponName && (
          <Box color={'myGray.900'} fontSize={'14px'} fontWeight={'500'} mb={6}>
            {t('common:discount_coupon_used') + t(discountCouponName)}
          </Box>
        )}

        {renderPaymentContent()}

        {selectedPayment !== BillPayWayEnum.bank && (
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
        )}

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

        {feConfigs.payFormUrl && (
          <Box mt={4} textAlign="center" fontSize="sm">
            <Trans
              i18nKey="common:pay.payment_form_tip"
              components={{
                payLink: <Link href={feConfigs.payFormUrl} target="_blank" color="primary.600" />
              }}
            />
          </Box>
        )}
      </ModalBody>
    </MyModal>
  );
};

export default React.memo(QRCodePayModal);
