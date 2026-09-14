import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trans } from 'next-i18next';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { Box, Flex, Button, Link } from '@chakra-ui/react';
import { checkBalancePayResult, putUpdatePayment } from '@/web/support/wallet/bill/api';
import LightTip from '@fastgpt/web/components/common/LightTip';
import QRCode from 'qrcode';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
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
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getPaymentRenderType, type PaymentRenderData } from './utils';

export type QRPayProps = CreateBillResponseType & {
  billId: string;
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
  const { t } = useClientTranslation();
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

    calculateQRSize();
    window.addEventListener('resize', calculateQRSize);

    return () => {
      window.removeEventListener('resize', calculateQRSize);
    };
  }, [tip, discountCouponName]);

  const [payWayRenderData, setPayWayRenderData] = useState<PaymentRenderData>({
    qrCode,
    iframeCode,
    markdown
  });
  const paymentRenderType = getPaymentRenderType(payWayRenderData);

  const [selectedPayment, setSelectedPayment] = useState(payment);
  const { runAsync: handlePaymentChange, loading: isUpdating } = useRequest(
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
  useRequest(() => checkBalancePayResult(billId), {
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
    if (paymentRenderType === 'qrCode') {
      return (
        <Box
          key={paymentRenderType}
          ref={canvasRef}
          display={'inline-block'}
          alignSelf={'center'}
          h={`${dynamicQRSize}px`}
        />
      );
    }
    if (paymentRenderType === 'iframeCode') {
      const iframeSize = QR_CODE_SIZE + 5;
      const renderedSize = dynamicQRSize + 5;
      const iframeScale = renderedSize / iframeSize;

      return (
        <Box
          key={paymentRenderType}
          alignSelf={'center'}
          w={`${renderedSize}px`}
          h={`${renderedSize}px`}
          overflow={'hidden'}
        >
          <iframe
            srcDoc={payWayRenderData.iframeCode}
            scrolling="no"
            style={{
              width: iframeSize,
              height: iframeSize,
              border: 'none',
              display: 'block',
              transform: `scale(${iframeScale})`,
              transformOrigin: 'top left'
            }}
          />
        </Box>
      );
    }
    if (paymentRenderType === 'markdown') {
      return <Markdown source={payWayRenderData.markdown} />;
    }
    return null;
  };

  return (
    <MyModal
      isLoading={isUpdating}
      isOpen
      title={t('common:user.Pay')}
      w={'600px'}
      onClose={onClose}
      closeOnOverlayClick={false}
      blockScrollOnMount
      bodyStyles={{ textAlign: 'center' }}
    >
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
          {t('common:discount_coupon_used') + t(discountCouponName as any)}
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
            i18nKey={i18nT('common:pay.payment_form_tip')}
            components={{
              payLink: <Link href={feConfigs.payFormUrl} target="_blank" color="primary.600" />
            }}
          />
        </Box>
      )}
    </MyModal>
  );
};

export default React.memo(QRCodePayModal);
