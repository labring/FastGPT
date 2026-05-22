import { ChatBoxContext } from '@/components/core/chat/ChatContainer/ChatBox/Provider';
import { Box, Flex, Text } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';

const WelcomeHomeBox = () => {
  const slogan = useContextSelector(ChatBoxContext, (v) => v.slogan);
  const { feConfigs } = useSystemStore();

  return (
    <Flex flexDir="column" justifyContent="flex-end" alignItems="center" gap={4}>
      <Flex align="center" gap="8px">
        <MyImage
          alt="logo"
          w="32px"
          h="32px"
          src={feConfigs?.systemLogo || LOGO_ICON}
          borderRadius="8px"
          flexShrink={0}
        />
        <Text fontSize="18px" fontWeight={600} color="myGray.900" whiteSpace="nowrap">
          {feConfigs?.systemTitle}
        </Text>
      </Flex>
      <Box color="myGray.500">{slogan}</Box>
    </Flex>
  );
};

export default WelcomeHomeBox;
