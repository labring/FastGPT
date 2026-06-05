import { DEFAULT_LOGO_BANNER_COLLAPSED_URL } from '@/pageComponents/chat/constants';
import { Box, Flex, Image } from '@chakra-ui/react';
import { ChatBoxContext } from '../../Provider';
import { useContextSelector } from 'use-context-selector';

const MobileHomeHero = () => {
  const squareLogo = useContextSelector(ChatBoxContext, (v) => v.squareLogo);
  const slogan = useContextSelector(ChatBoxContext, (v) => v.slogan);
  const displaySlogan = slogan || '今天想做点什么？';

  return (
    <Flex flexDir="column" alignItems="flex-start" gap={4} pt="107px">
      <Image
        alt="fastgpt logo"
        w="48px"
        maxW="100%"
        src={squareLogo || DEFAULT_LOGO_BANNER_COLLAPSED_URL}
        fallbackSrc={DEFAULT_LOGO_BANNER_COLLAPSED_URL}
      />
      <Box
        color="#111824"
        fontFamily='"PingFang SC"'
        fontSize="32px"
        fontStyle="normal"
        fontWeight={400}
        lineHeight="40px"
      >
        {displaySlogan}
      </Box>
    </Flex>
  );
};

export default MobileHomeHero;
