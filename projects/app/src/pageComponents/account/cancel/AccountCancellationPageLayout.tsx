import { Box, Button, Flex, type FlexProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';

/** 注销流程独立页骨架，复用登录页背景但不渲染账号导航和语言切换。 */
export const AccountCancellationPageLayout = ({
  children,
  showBack = false,
  onBack,
  cardProps
}: {
  children: React.ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  cardProps?: FlexProps;
}) => {
  const { t } = useTranslation();

  return (
    <Flex
      position="relative"
      minH="100dvh"
      w="100%"
      alignItems="center"
      justifyContent="center"
      overflow="hidden"
      bg="white"
    >
      {showBack && (
        <Button
          position="absolute"
          top="24px"
          left="24px"
          zIndex={2}
          h="32px"
          minW={0}
          p={0}
          variant="unstyled"
          display="flex"
          alignItems="center"
          gap={1}
          color="primary.600"
          fontSize="20px"
          fontWeight="normal"
          lineHeight="32px"
          onClick={onBack}
          aria-label={t('common:back', '返回')}
        >
          <MyIcon name="common/arrowLeft" w="24px" h="24px" />
          <Box>{t('common:back', '返回')}</Box>
        </Button>
      )}

      <Flex
        position="relative"
        alignItems="center"
        justifyContent="center"
        w="100%"
        maxW="1328px"
        minH="100dvh"
        px={[5, 0]}
        py={[24, 0]}
        overflow="hidden"
        bg="white"
      >
        <Box
          position="absolute"
          top={['-190px', '-100px']}
          left="50%"
          w={['900px', '1230px']}
          h={['590px', '510px']}
          transform="translateX(-50%)"
          pointerEvents="none"
          bgImage="url(/icon/login-gradient-bg.svg)"
          bgRepeat="no-repeat"
          bgPosition="center top"
          bgSize="100% 100%"
        />

        <Flex
          position="relative"
          zIndex={1}
          flexDirection="column"
          w="min(560px, 100%)"
          bg="white"
          px={[6, '90px']}
          py={[10, '90px']}
          borderRadius={['12px', '16px']}
          boxShadow="0px 16px 40px rgba(30, 64, 175, 0.10), 0px 1px 3px rgba(15, 23, 42, 0.06)"
          {...cardProps}
        >
          {children}
        </Flex>
      </Flex>
    </Flex>
  );
};
