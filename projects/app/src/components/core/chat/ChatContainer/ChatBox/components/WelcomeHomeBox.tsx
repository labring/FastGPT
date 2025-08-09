import { ChatBoxContext } from '@/components/core/chat/ChatContainer/ChatBox/Provider';
import { Box, Flex, Image } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';

const WelcomeHomeBox = () => {
  const wideLogo = useContextSelector(ChatBoxContext, (v) => v.wideLogo);
  const slogan = useContextSelector(ChatBoxContext, (v) => v.slogan);

  return (
    <Flex flexDir="column" justifyContent="flex-end" alignItems="center" gap={4} h="full">
      <Image
        alt="fastgpt logo"
        maxW={['388px', '50%']}
        src={wideLogo || '/imgs/fastgpt_banner.png'}
      />
      <Box color="myGray.500">{slogan}</Box>
    </Flex>
  );
};

export default WelcomeHomeBox;
