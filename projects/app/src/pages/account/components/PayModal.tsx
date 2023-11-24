import React, { useState, useCallback } from 'react';
import { ModalFooter, ModalBody, Button, Input, Box, Grid } from '@chakra-ui/react';
import { getPayCode, checkPayResult } from '@/web/support/wallet/pay/api';
import { useToast } from '@/web/common/hooks/useToast';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useTranslation } from 'next-i18next';
import Markdown from '@/components/Markdown';
import MyModal from '@/components/MyModal';
import { priceMd } from '@/web/common/system/staticData';

const PayModal = ({ onClose }: { onClose: () => void }) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [inputVal, setInputVal] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [payId, setPayId] = useState('');

  const handleClickPay = useCallback(async () => {
    if (!inputVal || inputVal <= 0 || isNaN(+inputVal)) return;
    setLoading(true);
    try {
      // 获取支付二维码
      const res = await getPayCode(inputVal);
      new window.QRCode(document.getElementById('payQRCode'), {
        text: res.codeUrl,
        width: 128,
        height: 128,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.H
      });
      setPayId(res.payId);
    } catch (err) {
      toast({
        title: getErrText(err),
        status: 'error'
      });
    }
    setLoading(false);
  }, [inputVal, toast]);

  useQuery(
    [payId],
    () => {
      if (!payId) return null;
      return checkPayResult(payId);
    },
    {
      enabled: !!payId,
      refetchInterval: 3000,
      onSuccess(res) {
        if (!res) return;
        toast({
          title: '充值成功',
          status: 'success'
        });
        router.reload();
      }
    }
  );

  return (
    <MyModal
      isOpen={true}
      onClose={payId ? undefined : onClose}
      title={t('user.Pay')}
      iconSrc="/imgs/modal/pay.svg"
      isCentered={!payId}
    >
      <ModalBody px={0} minH={payId ? 'auto' : '70vh'} display={'flex'} flexDirection={'column'}>
        {!payId && (
          <>
            <Grid gridTemplateColumns={'repeat(4,1fr)'} gridGap={5} mb={4} px={6}>
              {[10, 20, 50, 100].map((item) => (
                <Button
                  key={item}
                  variant={item === inputVal ? 'solid' : 'outline'}
                  onClick={() => setInputVal(item)}
                >
                  {item}元
                </Button>
              ))}
            </Grid>
            <Box mb={4} px={6}>
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
            <Box flex={[1, '1 0 0']} overflow={'overlay'} px={6}>
              <Markdown source={priceMd} />
            </Box>
          </>
        )}
        {/* 付费二维码 */}
        <Box textAlign={'center'}>
          {payId && <Box mb={3}>请微信扫码支付: {inputVal}元，请勿关闭页面</Box>}
          <Box id={'payQRCode'} display={'inline-block'}></Box>
        </Box>
      </ModalBody>

      <ModalFooter>
        {!payId && (
          <>
            <Button variant={'base'} onClick={onClose}>
              取消
            </Button>
            <Button
              ml={3}
              isLoading={loading}
              isDisabled={!inputVal || inputVal === 0}
              onClick={handleClickPay}
            >
              获取充值二维码
            </Button>
          </>
        )}
      </ModalFooter>
    </MyModal>
  );
};

export default PayModal;
