import { ChatBoxContext } from '@/components/core/chat/ChatContainer/ChatBox/Provider';
import { Box, Flex } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';

const WelcomeHomeBox = () => {
  const slogan = useContextSelector(ChatBoxContext, (v) => v.slogan);
  const { feConfigs } = useSystemStore();

  return (
    <Flex flexDir="column" justifyContent="flex-end" alignItems="center" gap={4}>
      <MyImage
        alt="logo"
        w="32px"
        h="32px"
        src={feConfigs?.systemLogo || LOGO_ICON}
        borderRadius="8px"
      />
      <Box color="myGray.500">{slogan}</Box>
    </Flex>
  );
};

export default WelcomeHomeBox;
