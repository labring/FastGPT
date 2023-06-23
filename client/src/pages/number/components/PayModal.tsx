import React, { useState, useCallback } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  Input,
  Box,
  Grid
} from '@chakra-ui/react';
import { getPayCode, checkPayResult } from '@/api/user';
import { useToast } from '@/hooks/useToast';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import { getErrText } from '@/utils/tools';
import Markdown from '@/components/Markdown';

const PayModal = ({ onClose }: { onClose: () => void }) => {
  const router = useRouter();
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
      new QRCode(document.getElementById('payQRCode'), {
        text: res.codeUrl,
        width: 128,
        height: 128,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
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
    <>
      <Modal
        isOpen={true}
        onClose={() => {
          if (payId) return;
          onClose();
        }}
      >
        <ModalOverlay />
        <ModalContent minW={'auto'}>
          <ModalHeader>充值</ModalHeader>
          {!payId && <ModalCloseButton />}

          <ModalBody py={0}>
            {!payId && (
              <>
                <Grid gridTemplateColumns={'repeat(4,1fr)'} gridGap={5} mb={4}>
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
                <Box mb={4}>
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
                <Markdown
                  source={`
| 计费项 | 价格: 元/ 1K tokens(包含上下文)|
| --- | --- |
| 知识库 - 索引 | 0.001 |
| chatgpt - 对话 | 0.015 |
| chatgpt16K - 对话 | 0.015 |
| gpt4 - 对话 | 0.1 |
| 文件拆分 | 0.015 |`}
                />
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
        </ModalContent>
      </Modal>
    </>
  );
};

export default PayModal;
