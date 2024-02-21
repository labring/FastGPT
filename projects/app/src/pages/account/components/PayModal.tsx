import React, { useState, useCallback } from 'react';
import { ModalFooter, ModalBody, Button, Input, Box, Grid } from '@chakra-ui/react';
import { getWxPayQRCode } from '@/web/support/wallet/bill/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRouter } from 'next/router';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useTranslation } from 'next-i18next';
import MyModal from '@/components/MyModal';
import { BillTypeEnum } from '@fastgpt/global/support/wallet/bill/constants';

import QRCodePayModal, { type QRPayProps } from '@/components/support/wallet/QRCodePayModal';

const PayModal = ({
  onClose,
  defaultValue,
  onSuccess
}: {
  defaultValue?: number;
  onClose: () => void;
  onSuccess?: () => any;
}) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { toast } = useToast();
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

  return (
    <MyModal isOpen={true} onClose={onClose} title={t('user.Pay')} iconSrc="/imgs/modal/pay.svg">
      <ModalBody px={0} display={'flex'} flexDirection={'column'}>
        <Grid gridTemplateColumns={'repeat(3,1fr)'} gridGap={5} mb={4} px={6}>
          {[10, 20, 50, 100, 200, 500].map((item) => (
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
          {t('common.Close')}
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
