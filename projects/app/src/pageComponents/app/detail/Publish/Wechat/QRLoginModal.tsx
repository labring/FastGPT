import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Box, Button, Flex, Text } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { POST, GET } from '@/web/common/api/request';
import QRCode from 'qrcode';
import { useMemoizedFn } from 'ahooks';
import MyLoading from '@fastgpt/web/components/common/MyLoading';
import type {
  WechatQrcodeGenerateResponseType,
  WechatQrcodeStatusResponseType
} from '@fastgpt/global/openapi/support/outLink/provider/wechat';
import { delay, retryFn } from '@fastgpt/global/common/system/utils';

type QRStatus = 'loading' | 'wait' | 'scanned' | 'confirmed' | 'expired' | 'error';

const QRLoginModal = ({
  outLinkId,
  onSuccess,
  onClose
}: {
  outLinkId: string;
  onSuccess: () => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [status, setStatus] = useState<QRStatus>('loading');
  const [qrText, setQrText] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<AbortController>();
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const stopPolling = useCallback(() => {
    sessionRef.current?.abort();
    clearTimeout(successTimerRef.current);
  }, []);

  /** 串行查询当前扫码会话；重试或关闭后，旧请求的结果和延迟回调均失效。 */
  const startPolling = useMemoizedFn((session: AbortController, attemptId: string) => {
    const poll = async () => {
      while (!session.signal.aborted) {
        try {
          // 确认已落库但轮询入队失败时，可用同一会话安全重试。
          const data = await retryFn(() => {
            session.signal.throwIfAborted();
            return GET<WechatQrcodeStatusResponseType>(
              '/support/outLink/wechat/qrcode/status',
              { outLinkId, attemptId },
              { cancelToken: session }
            );
          }, 1);
          if (session.signal.aborted) return;

          switch (data.status) {
            case 'scaned':
              setStatus('scanned');
              break;
            case 'confirmed':
              setStatus('confirmed');
              toast({
                title: t('publish:wechat.login_success'),
                status: 'success'
              });
              successTimerRef.current = setTimeout(() => {
                if (!session.signal.aborted) onSuccess();
              }, 1000);
              return;
            case 'expired':
              setStatus('expired');
              return;
          }
        } catch {
          if (session.signal.aborted) return;
          setStatus('error');
          setErrMsg(t('publish:wechat.status_check_failed'));
          return;
        }

        // 等待 2s 后再发起下一轮
        await delay(2000);
      }
    };

    poll();
  });

  // 用 qrcode 库渲染二维码到 canvas
  const drawQRCode = useCallback((text: string) => {
    const session = sessionRef.current;
    if (!text || !canvasRef.current || !session) return;
    const canvas = document.createElement('canvas');
    QRCode.toCanvas(canvas, text, {
      width: 220,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    })
      .then(() => {
        if (!session.signal.aborted) {
          canvasRef.current?.replaceChildren(canvas);
        }
      })
      .catch(console.error);
  }, []);

  /** 稳定函数引用，避免渲染时的回调变化重新触发初始化；每次生成开启独立会话。 */
  const generateQR = useMemoizedFn(async () => {
    stopPolling();
    const session = new AbortController();
    sessionRef.current = session;
    try {
      setStatus('loading');
      setErrMsg('');

      const data = await POST<WechatQrcodeGenerateResponseType>(
        '/support/outLink/wechat/qrcode/generate',
        { outLinkId },
        { cancelToken: session }
      );

      if (session.signal.aborted) return;

      setQrText(data.qrcode_img_content);
      setStatus('wait');

      startPolling(session, data.attemptId);
    } catch {
      if (session.signal.aborted) return;
      setStatus('error');
      setErrMsg(t('publish:wechat.qr_generate_failed'));
    }
  });

  // 等待态会重新挂载 canvas 容器，即使重试返回相同内容也需要重新绘制
  useEffect(() => {
    if (status === 'wait') drawQRCode(qrText);
  }, [qrText, status, drawQRCode]);

  useEffect(() => {
    generateQR();
    return stopPolling;
  }, [outLinkId, generateQR, stopPolling]);

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <Flex direction="column" align="center" justify="center" minH="350px">
            <MyLoading fixed={false} text={t('publish:wechat.generating_qr')} />
          </Flex>
        );
      case 'wait':
        return (
          <Flex direction="column" align="center">
            <Box
              p={4}
              bg="white"
              borderRadius="lg"
              boxShadow="md"
              border="1px solid"
              borderColor="gray.200"
            >
              <Box ref={canvasRef} w="220px" h="220px" display="inline-block" />
            </Box>
            <Text mt={4} fontSize="lg" fontWeight="medium">
              {t('publish:wechat.scan_qr_tip')}
            </Text>
            <Text mt={1} fontSize="sm" color="gray.500">
              {t('publish:wechat.scan_qr_desc')}
            </Text>
          </Flex>
        );
      case 'scanned':
        return (
          <Flex direction="column" align="center" justify="center" minH="350px">
            <Text fontSize="60px" h={'60px'}>
              👀
            </Text>
            <Text mt={4} fontSize="lg" fontWeight="medium" color="blue.600">
              {t('publish:wechat.scanned_tip')}
            </Text>
            <Text mt={1} fontSize="sm" color="gray.500">
              {t('publish:wechat.scanned_desc')}
            </Text>
          </Flex>
        );
      case 'confirmed':
        return (
          <Flex direction="column" align="center" justify="center" minH="350px">
            <Box fontSize="60px" h={'60px'}>
              ✅
            </Box>
            <Box mt={4} fontSize="lg" fontWeight="medium" color="green.600">
              {t('publish:wechat.confirmed_tip')}
            </Box>
          </Flex>
        );
      case 'expired':
        return (
          <Flex direction="column" align="center" justify="center" minH="350px">
            <Text fontSize="60px" h={'60px'}>
              ⏰
            </Text>
            <Text mt={4} fontSize="lg" fontWeight="medium" color="orange.600">
              {t('publish:wechat.expired_tip')}
            </Text>
            <Button mt={4} colorScheme="blue" onClick={generateQR}>
              {t('publish:wechat.retry')}
            </Button>
          </Flex>
        );
      case 'error':
        return (
          <Flex direction="column" align="center" justify="center" minH="350px">
            <Text fontSize="60px" h={'60px'}>
              ❌
            </Text>
            <Text mt={4} color="red.500">
              {errMsg}
            </Text>
            <Button mt={4} colorScheme="blue" onClick={generateQR}>
              {t('publish:wechat.retry')}
            </Button>
          </Flex>
        );
    }
  };

  return (
    <MyModal isOpen onClose={onClose} title={t('publish:wechat.login_title')} size="md">
      {renderContent()}
    </MyModal>
  );
};

export default QRLoginModal;
