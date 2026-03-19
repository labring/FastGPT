import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { LoginContainer } from '@/pageComponents/login';
import I18nLngSelector from '@/components/Select/I18nLngSelector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import type { LoginSuccessResponse } from '@/global/support/api/userRes';
import { useSystemStore } from '@/web/common/system/useSystemStore';

type LoginModalProps = {
  onSuccess: (e: LoginSuccessResponse) => any;
};

const LoginModal = ({ onSuccess }: LoginModalProps) => {
  const { isPc } = useSystem();
  const { feConfigs } = useSystemStore();

  return (
    <Flex h={'100%'} userSelect={'none'}>
      {/* Language selector */}
      <Box position="absolute" top="24px" right="24px" zIndex={10}>
        <I18nLngSelector />
      </Box>

      {/* 左侧图片区域 - 仅 PC 端显示 */}
      {isPc && (
        <Flex
          w={'60%'}
          flexDirection={'column'}
          alignItems={'flex-start'}
          bg={`url(${feConfigs?.systemBackground ? feConfigs.systemBackground : getWebReqUrl('/icon/sangfor-login-bg2.svg')}) center / cover no-repeat`}
          position={'relative'}
          padding={'6% 5% 0'}
        />
      )}

      {/* 右侧登录表单区域 */}
      <Flex
        w={isPc ? '40%' : '100%'}
        flexDirection={'column'}
        alignItems={'center'}
        justifyContent={'center'}
        bg={[`url(${getWebReqUrl('/icon/login-bg-phone2.svg')}) no-repeat`, 'white']}
        backgroundSize={'cover'}
        minH={'100%'}
      >
        <Flex
          flexDirection={'column'}
          w={isPc ? '60%' : '100%'}
          minWidth={isPc ? '320px' : undefined}
          h={isPc ? 'auto' : '100%'}
          px={isPc ? 0 : '8'}
          py={isPc ? 0 : '38px'}
        >
          <LoginContainer onSuccess={onSuccess} />
        </Flex>
      </Flex>
    </Flex>
  );
};

export default LoginModal;
