import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { LoginContainer } from '@/pageComponents/login';
import I18nLngSelector from '@/components/Select/I18nLngSelector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import type { LoginSuccessResponse } from '@/global/support/api/userRes';

type LoginModalProps = {
  onSuccess: (e: LoginSuccessResponse) => any;
};

const LoginModal = ({ onSuccess }: LoginModalProps) => {
  const { isPc } = useSystem();

  return (
    <Flex
      alignItems={'center'}
      justifyContent={'center'}
      bg={['white', `url(${getWebReqUrl('/icon/login-bg.svg')}) no-repeat`]}
      backgroundSize={['cover', 'cover']}
      userSelect={'none'}
      h={'100%'}
    >
      {/* Language selector - login page */}
      {isPc && (
        <Box position="absolute" top="24px" right="24px" zIndex={10}>
          <I18nLngSelector />
        </Box>
      )}

      <Flex
        flexDirection={'column'}
        w={['100%', '560px']}
        h={['100%', '690px']}
        bg={[`url(${getWebReqUrl('/icon/login-bg-phone.svg')}) no-repeat`, 'white']}
        backgroundSize={'cover'}
        px={['8', '90px']}
        py={['38px', '90px']}
        borderRadius={[0, '16px']}
        boxShadow={[
          '',
          '0px 32px 64px -12px rgba(19, 51, 107, 0.20), 0px 0px 1px 0px rgba(19, 51, 107, 0.20)'
        ]}
        position="relative"
      >
        <LoginContainer onSuccess={onSuccess} />
      </Flex>
    </Flex>
  );
};

export default LoginModal;
