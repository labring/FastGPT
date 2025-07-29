import React from 'react';
import { Box } from '@chakra-ui/react';
import { LoginContainer } from '@/pageComponents/login';
import I18nLngSelector from '@/components/Select/I18nLngSelector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyModal from '@fastgpt/web/components/common/MyModal';

type LoginModalProps = {
  onSuccess?: () => void;
};

const LoginModal = ({ onSuccess }: LoginModalProps) => {
  const { isPc } = useSystem();

  return (
    <MyModal
      isOpen
      closeOnOverlayClick={false}
      isCentered
      size="lg"
      w={['100%', '556px']}
      h={['100%', 'auto']}
      maxW="556px"
      maxH={['100vh', '90vh']}
      borderRadius={[0, '16px']}
      overflow="hidden"
    >
      <Box
        px={['5vw', '88px']}
        py={['5vh', '64px']}
        minH={['100vh', '600px']}
        display="flex"
        flexDirection="column"
        position="relative"
      >
        {/* language selector - modal */}
        {isPc && (
          <Box position="absolute" top="24px" right="24px" zIndex={10}>
            <I18nLngSelector />
          </Box>
        )}

        <LoginContainer onSuccess={onSuccess} />
      </Box>
    </MyModal>
  );
};

export default LoginModal;
