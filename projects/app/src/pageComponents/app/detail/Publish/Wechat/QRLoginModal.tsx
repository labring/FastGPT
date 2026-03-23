import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Box, Button, Flex, ModalBody, ModalFooter, Spinner, Text } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { POST, GET } from '@/web/common/api/request';
import QRCode from 'qrcode';
import MyLoading from '@fastgpt/web/components/common/MyLoading';
import { formatFileSize } from '@fastgpt/global/common/file/tools';

type QRStatus = 'loading' | 'wait' | 'scanned' | 'confirmed' | 'expired' | 'error';

const QRLoginModal = ({
  shareId,
  onSuccess,
  onClose
}: {
  shareId: string;
  onSuccess: () => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [status, setStatus] = useState<QRStatus>('loading');
  const [qrText, setQrText] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const pollingRef = useRef(false);

  const stopPolling = useCallback(() => {
    pollingRef.current = false;
  }, []);

  // 串行轮询：等上一个请求完成后再发起下一个
  const startPolling = useCallback(() => {
    pollingRef.current = true;

    const poll = async () => {
      while (pollingRef.current && mountedRef.current) {
        try {
          const data = await GET<{ status: string }>('/support/outLink/wechat/qrcode/status', {
            shareId
          });
          if (!mountedRef.current || !pollingRef.current) return;

          switch (data.status) {
            case 'scaned':
              setStatus('scanned');
              break;
            case 'confirmed':
              setStatus('confirmed');
              pollingRef.current = false;
              toast({
                title: t('publish:wechat.login_success'),
                status: 'success'
              });
              setTimeout(onSuccess, 1000);
              return;
            case 'expired':
              setStatus('expired');
              pollingRef.current = false;
              return;
          }
        } catch {
          if (!mountedRef.current) return;
          setStatus('error');
          setErrMsg(t('publish:wechat.status_check_failed'));
          pollingRef.current = false;
          return;
        }

        // 等待 2s 后再发起下一轮
        await new Promise((r) => setTimeout(r, 2000));
      }
    };

    poll();
  }, [shareId, toast, t, onSuccess]);

  // 用 qrcode 库渲染二维码到 canvas
  const drawQRCode = useCallback((text: string) => {
    if (!text || !canvasRef.current) return;
    const canvas = document.createElement('canvas');
    QRCode.toCanvas(canvas, text, {
      width: 220,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    })
      .then(() => {
        if (canvasRef.current) {
          canvasRef.current.innerHTML = '';
          canvasRef.current.appendChild(canvas);
        }
      })
      .catch(console.error);
  }, []);

  const generateQR = useCallback(async () => {
    try {
      setStatus('loading');
      setErrMsg('');
      stopPolling();

      const data = await POST<{
        qrcode: string;
        qrcode_img_content: string;
      }>('/support/outLink/wechat/qrcode/generate', { shareId });

      if (!mountedRef.current) return;

      setQrText(data.qrcode_img_content);
      setStatus('wait');

      startPolling();
    } catch {
      if (!mountedRef.current) return;
      setStatus('error');
      setErrMsg(t('publish:wechat.qr_generate_failed'));
    }
  }, [shareId, startPolling, stopPolling, t]);

  // qrText 变化时重新渲染二维码
  useEffect(() => {
    drawQRCode(qrText);
  }, [qrText, drawQRCode]);

  useEffect(() => {
    mountedRef.current = true;
    generateQR();
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, []);

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
            <Text fontSize="60px">👀</Text>
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
            <Text fontSize="60px">✅</Text>
            <Text mt={4} fontSize="lg" fontWeight="medium" color="green.600">
              {t('publish:wechat.confirmed_tip')}
            </Text>
          </Flex>
        );
      case 'expired':
        return (
          <Flex direction="column" align="center" justify="center" minH="350px">
            <Text fontSize="60px">⏰</Text>
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
            <Text fontSize="60px">❌</Text>
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
      <ModalBody py={6}>{renderContent()}</ModalBody>
      <ModalFooter>
        <Button variant="whiteBase" onClick={onClose}>
          {t('common:Close')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default QRLoginModal;
