import { ChatBoxContext } from '@/components/core/chat/ChatContainer/ChatBox/Provider';
import { DEFAULT_LOGO_BANNER_URL } from '@/pageComponents/chat/constants';
import { Box, Flex, Image } from '@chakra-ui/react';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useContextSelector } from 'use-context-selector';

const DesktopHomeHero = () => {
  const { t } = useClientTranslation('chat');
  const wideLogo = useContextSelector(ChatBoxContext, (v) => v.wideLogo);
  const slogan = useContextSelector(ChatBoxContext, (v) => v.slogan);
  const displaySlogan = slogan || t('chat:setting.home.slogan.default');

  return (
    <Flex flexDir="column" justifyContent="flex-end" alignItems="center" gap={4}>
      <Image
        alt="fastgpt logo"
        w="224px"
        maxW="100%"
        src={wideLogo || DEFAULT_LOGO_BANNER_URL}
        fallbackSrc={DEFAULT_LOGO_BANNER_URL}
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

export default DesktopHomeHero;
