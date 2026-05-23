import {
  Box,
  Button,
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerOverlay,
  Flex
} from '@chakra-ui/react';
import { getDocPath } from '@/web/common/system/doc';
import { useLocalStorageState } from 'ahooks';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import { useState } from 'react';

const cookieVersion = '1';

const CookieConsentModalClient = () => {
  const { t } = useTranslation();
  const [localCookieVersion, setLocalCookieVersion] =
    useLocalStorageState<string>('localCookieVersion');
  const [isOpen, setIsOpen] = useState(() => localCookieVersion !== cookieVersion);

  const handleAgree = () => {
    setLocalCookieVersion(cookieVersion);
    setIsOpen(false);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Drawer placement="bottom" size={'xs'} isOpen={isOpen} onClose={handleClose}>
      <DrawerOverlay backgroundColor={'rgba(0,0,0,0.2)'} />
      <DrawerContent py={'1.75rem'} px={'3rem'}>
        <DrawerCloseButton size={'sm'} />
        <Flex align={'center'} justify={'space-between'}>
          <Box>
            <Box color={'myGray.900'} fontWeight={'500'} fontSize={'1rem'}>
              {t('login:cookies_tip')}
            </Box>
            <Box
              color={'primary.700'}
              fontWeight={'500'}
              fontSize={'1rem'}
              textDecorationLine={'underline'}
              cursor={'pointer'}
              w={'fit-content'}
              onClick={() => window.open(getDocPath('/guide/version/cloud/privacy'), '_blank')}
            >
              {t('login:privacy_policy')}
            </Box>
          </Box>
          <Button ml={'0.75rem'} onClick={handleAgree}>
            {t('login:agree')}
          </Button>
        </Flex>
      </DrawerContent>
    </Drawer>
  );
};

// Cookie 同意状态依赖 localStorage。服务端渲染 Drawer 会留下 Chakra Portal 占位，
// 客户端首屏如果直接返回 null 会触发 hydration mismatch。
const CookieConsentModal = dynamic(() => Promise.resolve(CookieConsentModalClient), {
  ssr: false
});

export default CookieConsentModal;
