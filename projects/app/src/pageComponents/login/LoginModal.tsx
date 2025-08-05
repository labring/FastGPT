import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
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
      borderRadius={[0, '16px']}
      overflow="auto"
      minH={['100vh', '690px']}
    >
      <Flex
        w={['100%', '560px']}
        px={['5vw', '90px']}
        py={['5vh', '90px']}
        h="690px"
        flexGrow={1}
        maxW="560px"
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
      </Flex>
    </MyModal>
  );
};

export default LoginModal;
