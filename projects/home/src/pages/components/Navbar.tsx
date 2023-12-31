import React, { useEffect, useMemo, useState } from 'react';
import { Flex, Box, type BoxProps, Button, useDisclosure, useMediaQuery } from '@chakra-ui/react';
import { feConfigs } from '@/web/common/system/staticData';
import { useTranslation } from 'next-i18next';
import Avatar from '@/components/Avatar';
import CommunityModal from '@/components/CommunityModal';
import MyIcon from '@/components/Icon';

const Navbar = () => {
  const { t } = useTranslation();
  const [scrollTop, setScrollTop] = useState(0);
  const {
    isOpen: isOpenCommunity,
    onOpen: onOpenCommunity,
    onClose: onCloseCommunity
  } = useDisclosure();
  const { isOpen: isOpenMenu, onOpen: onOpenMenu, onClose: onCloseMenu } = useDisclosure();
  const [isPc] = useMediaQuery('(min-width: 900px)');

  const menuList = [
    {
      label: t('home.Commercial'),
      key: 'Commercial',
      onClick: () => {
        window.open(feConfigs?.commercialDocUrl);
      }
    },
    {
      label: t('home.Community'),
      key: 'community',
      onClick: () => {
        onOpenCommunity();
      }
    },
    {
      label: t('home.Docs'),
      key: 'docs',
      onClick: () => {
        window.open(feConfigs?.docUrl);
      }
    }
  ];
  const bgOpacity = useMemo(() => {
    const rate = scrollTop / 120;
    if (rate > 0.7) {
      return 0.7;
    }
    return rate;
  }, [scrollTop]);

  const menuStyles: BoxProps = {
    mr: 4,
    px: 5,
    py: 2,
    cursor: 'pointer',
    transition: '0.5s',
    borderRadius: 'xl',
    fontSize: 'lg',
    _hover: {
      bg: 'myGray.200'
    }
  };

  useEffect(() => {
    const scrollListen = (e: any) => {
      setScrollTop(e?.target?.scrollTop);
    };
    const dom = document.getElementById('home');
    if (!dom) return;

    dom.addEventListener('scroll', scrollListen);

    return () => {
      dom.removeEventListener('scroll', scrollListen);
    };
  }, []);

  return (
    <Box
      bg={`rgba(255,255,255,${bgOpacity})`}
      backdropFilter={'blur(24px)'}
      py={[3, 5]}
      px={5}
      transition={'0.4s ease'}
      h={isOpenMenu ? '100vh' : 'auto'}
    >
      <Flex maxW={'1300px'} m={'auto'} alignItems={'center'}>
        <Avatar src="/icon/logo.svg" w={['30px', '38px']} />
        <Box
          className="textlg"
          fontSize={['3xl', '4xl']}
          fontWeight={'bold'}
          ml={3}
          fontStyle={'italic'}
        >
          FastGPT
        </Box>
        <Box flex={1} />
        {isPc ? (
          <>
            {menuList.map((item) => (
              <Box key={item.key} {...menuStyles} onClick={item.onClick}>
                {item.label}
              </Box>
            ))}
            <Box px={4} color={'myGray.500'}>
              |
            </Box>
            <Box {...menuStyles} onClick={() => window.open(feConfigs?.loginUrl, '_self')}>
              {t('home.Login')}
            </Box>
            <Button
              ml={4}
              h={'36px'}
              borderRadius={'3xl'}
              onClick={() => window.open(feConfigs?.startUrl, '_self')}
            >
              {t('home.Start Now')}
            </Button>
          </>
        ) : (
          <MyIcon
            name={isOpenMenu ? 'closeLight' : 'menu'}
            w={'20px'}
            onClick={() => (isOpenMenu ? onCloseMenu() : onOpenMenu())}
          />
        )}
      </Flex>
      {isOpenMenu && !isPc && (
        <Box mt={'15vh'} ml={'10vw'}>
          {menuList.map((item) => (
            <Box key={item.key} mb={8} onClick={item.onClick}>
              {item.label}
            </Box>
          ))}
          <Box bg={'myGray.500'} h={'1.5px'} w={'20px'} mb={8} />
          <Box mb={10} onClick={() => window.open(feConfigs?.loginUrl, '_self')}>
            {t('home.Login')}
          </Box>
          <Button
            h={'36px'}
            borderRadius={'3xl'}
            onClick={() => window.open(feConfigs?.startUrl, '_self')}
          >
            {t('home.Start Now')}
          </Button>
        </Box>
      )}
      {isOpenCommunity && <CommunityModal onClose={onCloseCommunity} />}
    </Box>
  );
};

export default Navbar;
