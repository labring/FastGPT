import React, { useMemo } from 'react';
import { Box, type BoxProps, Flex, Link, type LinkProps } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import NextLink from 'next/link';
import Badge from '../Badge';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';

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
  const { lastChatAppId, lastPane } = useChatStore();

  const navbarList = useMemo(
    () => [
      {
        label: t('common:navbar.Chat'),
        icon: 'navbar/chatLight',
        activeIcon: 'navbar/chatFill',
        link: `/chat?appId=${lastChatAppId}&pane=${lastPane}`,
        activeLink: ['/chat']
      },
      {
        label: t('common:navbar.Studio'),
        icon: 'navbar/dashboardLight',
        activeIcon: 'navbar/dashboardFill',
        link: `/dashboard/agent`,
        activeLink: [
          '/dashboard/agent',
          '/dashboard/create',
          '/app/detail',
          '/dashboard/tool',
          '/dashboard/systemTool',
          '/dashboard/templateMarket',
          '/dashboard/mcpServer',
          '/dashboard/evaluation',
          '/dashboard/evaluation/create'
        ]
      },
      {
        label: t('common:navbar.Datasets'),
        icon: 'navbar/datasetLight',
        activeIcon: 'navbar/datasetFill',
        link: `/dataset/list`,
        activeLink: ['/dataset/list', '/dataset/detail']
      },
      {
        label: t('common:navbar.Account'),
        icon: 'navbar/userLight',
        activeIcon: 'navbar/userFill',
        link: '/account/info',
        activeLink: [
          '/account/bill',
          '/account/info',
          '/account/team',
          '/account/usage',
          '/account/thirdParty',
          '/account/apikey',
          '/account/setting',
          '/account/inform',
          '/account/promotion',
          '/account/model'
        ]
      },
      ...(userInfo?.username === 'root'
        ? [
            {
              label: t('common:navbar.Config'),
              icon: 'support/config/configLight',
              activeIcon: 'support/config/configFill',
              link: '/config/tool',
              activeLink: ['/config/tool', '/config/tool/marketplace']
            }
          ]
        : [])
    ],
    [lastChatAppId, lastPane, t, userInfo?.username]
  );

  const isDashboardPage = useMemo(() => {
    return router.pathname.startsWith('/dashboard');
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
      bg={isDashboardPage ? 'white' : 'transparent'}
    >
      {/* logo */}
      <Box flex={'0 0 auto'} mb={3}>
        <MyImage w={9} h={9} src={LOGO_ICON} />
      </Box>
      {/* 导航列表 */}
      <Box flex={1}>
        {navbarList.map((item) => {
          const isActive = item.activeLink.includes(router.pathname);

          return (
            <Box
              key={item.link}
              {...itemStyles}
              {...(isActive
                ? {
                    bg: 'white',
                    boxShadow:
                      '0px 0px 1px 0px rgba(19, 51, 107, 0.08), 0px 4px 4px 0px rgba(19, 51, 107, 0.05)'
                  }
                : {
                    bg: 'transparent',
                    _hover: {
                      bg: isDashboardPage ? 'white' : 'rgba(255,255,255,0.9)'
                    }
                  })}
              {...(item.link !== router.asPath
                ? {
                    onClick: () => {
                      if (item.link.startsWith('/chat')) {
                        window.open(getWebReqUrl(item.link), '_blank', 'noopener,noreferrer');
                        return;
                      }
                      router.push(item.link);
                    }
                  }
                : {})}
            >
              <MyIcon
                {...(isActive
                  ? {
                      name: item.activeIcon as any,
                      color: 'primary.600'
                    }
                  : {
                      name: item.icon as any,
                      color: 'myGray.400'
                    })}
                width={'24px'}
                height={'24px'}
              />
              <Box
                fontSize={'12px'}
                transform={'scale(0.9)'}
                mt={'5px'}
                lineHeight={1}
                color={isActive ? 'primary.700' : 'myGray.500'}
              >
                {item.label}
              </Box>
            </Box>
          );
        })}
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
              color={'myGray.400'}
              height={'48px'}
            >
              <Avatar src={item.avatar} borderRadius={'md'} width={'26px'} height={'26px'} />
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
            color={'myGray.400'}
            height={'48px'}
          >
            <MyIcon name={'common/gitInlight'} width={'26px'} height={'26px'} />
          </Link>
        </MyTooltip>
      )}

      <Box flex={'0 0 auto'} mb={4} cursor={'pointer'} onClick={() => router.push('/account/info')}>
        <Avatar w={9} src={userInfo?.avatar} borderRadius={'50%'} />
      </Box>
    </Flex>
  );
};

export default Navbar;
