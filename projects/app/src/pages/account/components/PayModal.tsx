import React, { useState, useCallback, useMemo } from 'react';
import { ModalFooter, ModalBody, Button, Input, Box, Grid, Link } from '@chakra-ui/react';
import { getWxPayQRCode } from '@/web/support/wallet/bill/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRouter } from 'next/router';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { BillTypeEnum } from '@fastgpt/global/support/wallet/bill/constants';

import QRCodePayModal, { type QRPayProps } from '@/components/support/wallet/QRCodePayModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { EXTRA_PLAN_CARD_ROUTE } from '@/web/support/wallet/sub/constants';

const PayModal = ({
  onClose,
  defaultValue,
  onSuccess
}: {
  defaultValue?: number;
  onClose: () => void;
  onSuccess?: () => any;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { subPlans } = useSystemStore();
  const [inputVal, setInputVal] = useState<number | undefined>(defaultValue);
  const [loading, setLoading] = useState(false);
  const [qrPayData, setQRPayData] = useState<QRPayProps>();

  const handleClickPay = useCallback(async () => {
    if (!inputVal || inputVal <= 0 || isNaN(+inputVal)) return;
    setLoading(true);
    try {
      // 获取支付二维码
      const res = await getWxPayQRCode({
        type: BillTypeEnum.balance,
        balance: inputVal
      });
      setQRPayData({
        readPrice: res.readPrice,
        codeUrl: res.codeUrl,
        billId: res.billId
      });
    } catch (err) {
      toast({
        title: getErrText(err),
        status: 'error'
      });
    }
    setLoading(false);
  }, [inputVal, toast]);

  const payList = useMemo(() => {
    const list = Object.values(subPlans?.standard || {});
    const priceList = list.map((item) => item.price);
    return priceList.concat(priceList.map((item) => item * 10)).filter(Boolean);
  }, [subPlans?.standard]);

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      title={t('common:user.Pay')}
      iconSrc="/imgs/modal/pay.svg"
    >
      <ModalBody px={0} display={'flex'} flexDirection={'column'}>
        <Box px={6} fontSize={'sm'} mb={2} py={2} maxW={'400px'}>
          该余额仅用于自动续费标准套餐。如需购买额外套餐，可
          <Link href={EXTRA_PLAN_CARD_ROUTE} color={'primary.600'} textDecoration={'underline'}>
            直接下单
          </Link>
          ，无需充值余额。
        </Box>
        <Grid gridTemplateColumns={'repeat(3,1fr)'} gridGap={5} mb={4} px={6}>
          {payList.map((item) => (
            <Button
              key={item}
              variant={item === inputVal ? 'solid' : 'outline'}
              onClick={() => setInputVal(item)}
            >
              {item}元
            </Button>
          ))}
        </Grid>
        <Box px={6}>
          <Input
            value={inputVal}
            type={'number'}
            step={1}
            placeholder={'其他金额，请取整数'}
            onChange={(e) => {
              setInputVal(Math.floor(+e.target.value));
            }}
          ></Input>
        </Box>
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common:common.Close')}
        </Button>
        <Button
          ml={3}
          isLoading={loading}
          isDisabled={!inputVal || inputVal === 0}
          onClick={handleClickPay}
        >
          获取充值二维码
        </Button>
      </ModalFooter>

      {!!qrPayData && <QRCodePayModal {...qrPayData} onSuccess={onSuccess} />}
    </MyModal>
  );
};

export default PayModal;
