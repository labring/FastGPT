import React from 'react';
import { Modal, ModalOverlay, ModalContent, ModalBody, Box } from '@chakra-ui/react';
import { LoginContainer } from '@/pageComponents/login';
import I18nLngSelector from '@/components/Select/I18nLngSelector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';

interface LoginModalProps {
  isOpen: boolean;
  onSuccess?: () => void;
  ChineseRedirectUrl?: string;
}

const LoginModal = ({ isOpen, onSuccess, ChineseRedirectUrl }: LoginModalProps) => {
  const { isPc } = useSystem();

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}}
      closeOnOverlayClick={false}
      closeOnEsc={false}
      isCentered
      size="lg"
    >
      <ModalOverlay />
      <ModalContent
        mx={4}
        maxH="90vh"
        overflow="auto"
        w={['100%', '556px']}
        h={['100%', 'auto']}
        maxW="556px"
        borderRadius={[0, '16px']}
      >
        <ModalBody
          px={['5vw', '88px']}
          py={['5vh', '64px']}
          minH={['100vh', '600px']}
          display="flex"
          flexDirection="column"
          position="relative"
        >
          {/* 语言选择器 - 模态框专用位置 */}
          {isPc && (
            <Box position="absolute" top="24px" right="24px" zIndex={10}>
              <I18nLngSelector />
            </Box>
          )}

          <LoginContainer
            onSuccess={onSuccess}
            chineseRedirectUrl={ChineseRedirectUrl}
            autoInit={true}
            enabled={isOpen}
          />
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default LoginModal;
