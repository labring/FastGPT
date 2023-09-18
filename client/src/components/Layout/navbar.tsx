import React, { useMemo } from 'react';
import { Box, Flex, Link } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useUserStore } from '@/store/user';
import { useChatStore } from '@/store/chat';
import { HUMAN_ICON } from '@/constants/chat';
import { feConfigs } from '@/store/static';
import NextLink from 'next/link';
import Badge from '../Badge';
import Avatar from '../Avatar';
import MyIcon from '../Icon';
import { useTranslation } from 'next-i18next';
import { useGlobalStore } from '@/store/global';
import MyTooltip from '../MyTooltip';

export enum NavbarTypeEnum {
  normal = 'normal',
  small = 'small'
}

const Navbar = ({ unread }: { unread: number }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { userInfo } = useUserStore();
  const { gitStar } = useGlobalStore();
  const { lastChatAppId, lastChatId } = useChatStore();
  const navbarList = useMemo(
    () => [
      {
        label: t('navbar.Chat'),
        icon: 'chat',
        activeIcon: 'chatFill',
        link: `/chat?appId=${lastChatAppId}&chatId=${lastChatId}`,
        activeLink: ['/chat']
      },
      {
        label: t('navbar.Apps'),
        icon: 'appLight',
        activeIcon: 'appFill',
        link: `/app/list`,
        activeLink: ['/app/list', '/app/detail']
      },
      {
        label: t('navbar.Datasets'),
        icon: 'dbLight',
        activeIcon: 'dbFill',
        link: `/kb/list`,
        activeLink: ['/kb/list', '/kb/detail']
      },
      ...(feConfigs?.show_appStore
        ? [
            {
              label: t('navbar.Store'),
              icon: 'appStoreLight',
              activeIcon: 'appStoreFill',
              link: '/appStore',
              activeLink: ['/appStore']
            }
          ]
        : []),
      {
        label: t('navbar.Account'),
        icon: 'meLight',
        activeIcon: 'meFill',
        link: '/account',
        activeLink: ['/account']
      }
    ],
    [lastChatAppId, lastChatId, t]
  );

  const itemStyles: any = {
    my: 3,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    w: '54px',
    h: '54px',
    borderRadius: 'md',
    _hover: {
      bg: 'myWhite.600'
    }
  };

  return (
    <Flex
      flexDirection={'column'}
      alignItems={'center'}
      pt={6}
      bg={'white'}
      h={'100%'}
      w={'100%'}
      boxShadow={'2px 0px 8px 0px rgba(0,0,0,0.1)'}
      userSelect={'none'}
    >
      {/* logo */}
      <Box
        flex={'0 0 auto'}
        mb={5}
        border={'2px solid #fff'}
        borderRadius={'50%'}
        overflow={'hidden'}
        cursor={'pointer'}
        onClick={() => router.push('/account')}
      >
        <Avatar
          w={'36px'}
          h={'36px'}
          borderRadius={'50%'}
          src={userInfo?.avatar}
          fallbackSrc={HUMAN_ICON}
        />
      </Box>
      {/* 导航列表 */}
      <Box flex={1}>
        {navbarList.map((item) => (
          <Box
            key={item.link}
            {...itemStyles}
            {...(item.activeLink.includes(router.pathname)
              ? {
                  color: 'myBlue.700',
                  bg: 'white !important',
                  boxShadow: '1px 1px 10px rgba(0,0,0,0.2)'
                }
              : {
                  color: 'myGray.500',
                  backgroundColor: 'transparent'
                })}
            {...(item.link !== router.asPath
              ? {
                  onClick: () => router.push(item.link)
                }
              : {})}
          >
            <MyIcon
              name={
                item.activeLink.includes(router.pathname)
                  ? (item.activeIcon as any)
                  : (item.icon as any)
              }
              width={'20px'}
              height={'20px'}
            />
            <Box fontSize={'12px'} transform={'scale(0.9)'} mt={'5px'} lineHeight={1}>
              {item.label}
            </Box>
          </Box>
        ))}
      </Box>

      {unread > 0 && (
        <Box>
          <Link
            as={NextLink}
            {...itemStyles}
            prefetch
            href={`/account?currentTab=inform`}
            mb={0}
            color={'#9096a5'}
          >
            <Badge count={unread}>
              <MyIcon name={'inform'} width={'22px'} height={'22px'} />
            </Badge>
          </Link>
        </Box>
      )}
      {feConfigs?.show_doc && (
        <MyTooltip label={t('home.Docs')} placement={'right-end'}>
          <Box
            {...itemStyles}
            mb={0}
            color={'#9096a5'}
            onClick={() => {
              window.open(`https://doc.fastgpt.run/docs/intro`);
            }}
          >
            <MyIcon name={'courseLight'} width={'26px'} height={'26px'} />
          </Box>
        </MyTooltip>
      )}
      {feConfigs?.show_git && (
        <MyTooltip label={`Git Star: ${gitStar}`} placement={'right-end'}>
          <Link
            as={NextLink}
            href="https://github.com/labring/FastGPT"
            target={'_blank'}
            {...itemStyles}
            mt={0}
            color={'#9096a5'}
          >
            <MyIcon name={'git'} width={'22px'} height={'22px'} />
          </Link>
        </MyTooltip>
      )}
    </Flex>
  );
};

export default Navbar;
