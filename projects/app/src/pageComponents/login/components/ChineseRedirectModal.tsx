import {
  Box,
  Button,
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerOverlay,
  Flex
} from '@chakra-ui/react';
import { GET } from '@/web/common/api/request';
import { useEffect, useState } from 'react';
import { useLocalStorageState } from 'ahooks';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';

const ipDetectURL = 'https://qifu-api.baidubce.com/ip/local/geo/v1/district';

const ChineseRedirectModal = () => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const chineseRedirectUrl = feConfigs?.chineseRedirectUrl;

  const [isOpen, setIsOpen] = useState(false);
  const [showRedirect, setShowRedirect] = useLocalStorageState<boolean>('showRedirect', {
    defaultValue: true
  });

  useEffect(() => {
    if (!chineseRedirectUrl || !showRedirect) return;

    const checkIpInChina = async () => {
      try {
        const res = await GET<any>(ipDetectURL);
        const country = res?.country;
        const isChina =
          country === '中国' &&
          res.prov !== '中国香港' &&
          res.prov !== '中国澳门' &&
          res.prov !== '中国台湾';

        if (isChina) {
          setIsOpen(true);
        }
      } catch (error) {
        console.log('IP detection failed:', error);
      }
    };

    checkIpInChina();
  }, [chineseRedirectUrl, showRedirect]);

  const handleRedirect = () => {
    if (chineseRedirectUrl) {
      window.open(chineseRedirectUrl, '_self');
    }
  };

  const handleNoRemind = () => {
    setShowRedirect(false);
    setIsOpen(false);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  if (!chineseRedirectUrl || !isOpen) {
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
              {t('login:Chinese_ip_tip')}
            </Box>
            <Box
              color={'primary.700'}
              fontWeight={'500'}
              fontSize={'1rem'}
              textDecorationLine={'underline'}
              cursor={'pointer'}
              w={'fit-content'}
              onClick={handleNoRemind}
            >
              {t('login:no_remind')}
            </Box>
          </Box>
          <Button ml={'0.75rem'} onClick={handleRedirect}>
            {t('login:redirect')}
          </Button>
        </Flex>
      </DrawerContent>
    </Drawer>
  );
};

export default ChineseRedirectModal;
