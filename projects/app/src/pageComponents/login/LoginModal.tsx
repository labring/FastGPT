import React from 'react';
import { Modal, ModalOverlay, ModalContent, ModalBody } from '@chakra-ui/react';
import { LoginContainer } from '@/pageComponents/login';

interface LoginModalProps {
  isOpen: boolean;
  onSuccess?: () => void;
  ChineseRedirectUrl?: string;
}

const LoginModal = ({ isOpen, onSuccess, ChineseRedirectUrl }: LoginModalProps) => {
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
          <LoginContainer
            onSuccess={onSuccess}
            chineseRedirectUrl={ChineseRedirectUrl}
            autoInit={true}
            enabled={isOpen}
            languageSelectorPosition="absolute-top-right"
          />
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default LoginModal;
