import React, { useMemo } from 'react';
import { Box, BoxProps, Flex, Link, LinkProps } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { HUMAN_ICON } from '@fastgpt/global/common/system/constants';
import NextLink from 'next/link';
import Badge from '../Badge';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

export enum NavbarTypeEnum {
  normal = 'normal',
  small = 'small'
}

const itemStyles: BoxProps & LinkProps = {
  my: 2,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  w: '48px',
  h: '58px',
  borderRadius: 'md'
};
const hoverStyle: LinkProps = {
  _hover: {
    bg: 'myGray.05',
    color: 'primary.600'
  }
};

const Navbar = ({ unread }: { unread: number }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { userInfo } = useUserStore();
  const { gitStar, feConfigs } = useSystemStore();
  const { lastChatAppId } = useChatStore();

  const navbarList = useMemo(
    () => [
      {
        label: t('common:navbar.Chat'),
        icon: 'core/chat/chatLight',
        activeIcon: 'core/chat/chatFill',
        link: `/chat?appId=${lastChatAppId}`,
        activeLink: ['/chat']
      },
      {
        label: t('common:navbar.Studio'),
        icon: 'core/app/aiLight',
        activeIcon: 'core/app/aiFill',
        link: `/app/list`,
        activeLink: ['/app/list', '/app/detail']
      },
      {
        label: t('common:navbar.Datasets'),
        icon: 'core/dataset/datasetLight',
        activeIcon: 'core/dataset/datasetFill',
        link: `/dataset/list`,
        activeLink: ['/dataset/list', '/dataset/detail']
      },
      {
        label: t('common:navbar.Toolkit'),
        icon: 'phoneTabbar/tool',
        activeIcon: 'phoneTabbar/toolFill',
        link: `/toolkit`,
        activeLink: ['/toolkit']
      },
      {
        label: t('common:navbar.Account'),
        icon: 'support/user/userLight',
        activeIcon: 'support/user/userFill',
        link: '/account/info',
        activeLink: [
          '/account/bill',
          '/account/info',
          '/account/team',
          '/account/usage',
          '/account/apikey',
          '/account/individuation',
          '/account/inform',
          '/account/promotion'
        ]
      }
    ],
    [lastChatAppId, t]
  );

  const isSecondNavbarPage = useMemo(() => {
    return ['/toolkit'].includes(router.pathname);
  }, [router.pathname]);

  return (
    <Flex
      flexDirection={'column'}
      alignItems={'center'}
      pt={6}
      h={'100%'}
      w={'100%'}
      userSelect={'none'}
      pb={2}
      bg={isSecondNavbarPage ? 'myGray.50' : 'transparent'}
    >
      {/* logo */}
      <Box
        flex={'0 0 auto'}
        mb={3}
        border={'2px solid #fff'}
        borderRadius={'50%'}
        overflow={'hidden'}
        cursor={'pointer'}
        onClick={() => router.push('/account')}
      >
        <Avatar w={'2rem'} h={'2rem'} src={userInfo?.avatar} borderRadius={'50%'} />
      </Box>
      {/* 导航列表 */}
      <Box flex={1}>
        {navbarList.map((item) => (
          <Box
            key={item.link}
            {...itemStyles}
            {...(item.activeLink.includes(router.pathname)
              ? {
                  color: 'primary.600',
                  bg: 'white',
                  boxShadow:
                    '0px 0px 1px 0px rgba(19, 51, 107, 0.08), 0px 4px 4px 0px rgba(19, 51, 107, 0.05)'
                }
              : {
                  color: 'myGray.500',
                  bg: 'transparent',
                  _hover: {
                    bg: isSecondNavbarPage ? 'white' : 'rgba(255,255,255,0.9)'
                  }
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
            {...hoverStyle}
            prefetch
            href={`/account/inform`}
            mb={0}
            color={'myGray.500'}
            height={'48px'}
          >
            <Badge count={unread}>
              <MyIcon name={'support/user/informLight'} width={'22px'} height={'22px'} />
            </Badge>
          </Link>
        </Box>
      )}

      {feConfigs?.navbarItems
        ?.filter((item) => item.isActive)
        .map((item) => (
          <MyTooltip key={item.id} label={item.name} placement={'right-end'}>
            <Link
              as={NextLink}
              href={item.url}
              target={'_blank'}
              {...itemStyles}
              {...hoverStyle}
              mt={0}
              color={'myGray.500'}
              height={'48px'}
            >
              <Avatar src={item.avatar} borderRadius={'md'} />
            </Link>
          </MyTooltip>
        ))}

      {feConfigs?.show_git && (
        <MyTooltip label={`Git Star: ${gitStar}`} placement={'right-end'}>
          <Link
            as={NextLink}
            href="https://github.com/labring/FastGPT"
            target={'_blank'}
            {...itemStyles}
            {...hoverStyle}
            mt={0}
            color={'myGray.500'}
            height={'48px'}
          >
            <MyIcon name={'common/gitInlight'} width={'26px'} height={'26px'} />
          </Link>
        </MyTooltip>
      )}
    </Flex>
  );
};

export default Navbar;
