import React from 'react';
import { Box, Flex, Text, useTheme, Container } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import ChatInputBox from '@/pageComponents/account/gateway/chat/ChatInputBox';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useUserStore } from '@/web/support/user/useUserStore';
import { HUMAN_ICON } from '@fastgpt/global/common/system/constants';
import { serviceSideProps } from '@/web/common/i18n/utils';

const ChatContent = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { userInfo } = useUserStore();

  return (
    <Container maxW="100vw" h="100vh" p={0} m={0}>
      <Flex w="100%" h="100%" bg="#F4F4F7">
        {/* Left Navigation Panel */}
        <Flex
          w="15%"
          minW="200px"
          maxW="250px"
          h="100%"
          bg="#F4F4F7"
          direction="column"
          justify="space-between"
          p={6}
        >
          {/* Logo and Navigation Items */}
          <Flex direction="column" align="flex-start" gap={4}>
            <Flex align="center" gap={3}>
              <Box
                w="36px"
                h="36px"
                bg="white"
                border="0.75px solid #ECECEC"
                borderRadius="9px"
                overflow="hidden"
              >
                <Avatar w="100%" h="100%" src={userInfo?.team?.avatar} borderRadius="9px" />
              </Box>
              <Text fontSize="xl" fontWeight="bold" color="#111824" fontFamily="Inter">
                {userInfo?.team?.teamName || 'FastGPT'}
              </Text>
            </Flex>

            {/* Divider */}
            <Box w="100%" h="2px" bg="#E8EBF0" />

            {/* Navigation Items */}
            <Flex direction="column" gap={6}>
              <Flex
                align="center"
                p={2}
                gap={2}
                w="100%"
                bg="rgba(17, 24, 36, 0.05)"
                borderRadius="8px"
              >
                <Text
                  color="#3370FF"
                  fontSize="sm"
                  fontWeight="medium"
                  letterSpacing="0.1px"
                  fontFamily="PingFang SC"
                >
                  {t('common:navbar.Chat')}
                </Text>
              </Flex>
            </Flex>
          </Flex>

          {/* User Profile */}
          <Flex align="center" gap={2}>
            <Box
              flex={'0 0 auto'}
              border={'2px solid #fff'}
              borderRadius={'50%'}
              overflow={'hidden'}
            >
              <Avatar
                w={'36px'}
                h={'36px'}
                src={userInfo?.avatar || HUMAN_ICON}
                borderRadius={'50%'}
              />
            </Box>
            <Text
              fontSize="sm"
              fontWeight="medium"
              letterSpacing="0.1px"
              color="#111824"
              fontFamily="PingFang SC"
            >
              {userInfo?.username || '未登录'}
            </Text>
          </Flex>
        </Flex>

        {/* Main Content Area */}
        <Box flex={1} h="calc(100% - 32px)" bg="white" borderRadius="12px" m={4} mt={4} mb={4}>
          {/* Chat Content */}
          <Flex direction="column" align="center" justify="center" h="100%" gap={6}>
            {/* Logo and Welcome Message */}
            <Flex direction="column" align="center" gap={4} maxW="400px">
              <Flex align="center" gap={5}>
                <Box
                  w="60px"
                  h="60px"
                  bg="white"
                  border="1.25px solid #ECECEC"
                  borderRadius="15px"
                  overflow="hidden"
                >
                  <Avatar w="100%" h="100%" src={userInfo?.team?.avatar} borderRadius="15px" />
                </Box>
                <Text fontSize="2xl" fontWeight="bold" color="#111824" fontFamily="Inter">
                  {userInfo?.team?.teamName || 'FastGPT'}
                </Text>
              </Flex>
              <Text fontSize="lg" color="#707070" fontFamily="PingFang SC" textAlign="center">
                你好👋，我是 {userInfo?.team?.teamName || 'FastGPT'} ! 请问有什么可以帮你？
              </Text>
            </Flex>

            {/* Chat Input Box */}
            <ChatInputBox />
          </Flex>
        </Box>
      </Flex>
    </Container>
  );
};
export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account', 'account_team', 'common']))
    }
  };
}
const Render = () => {
  const { userInfo } = useUserStore();

  return !!userInfo?.team ? <ChatContent /> : null;
};

export default React.memo(Render);
