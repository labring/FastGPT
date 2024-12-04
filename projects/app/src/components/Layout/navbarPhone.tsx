import React, { useMemo } from 'react';
import { useRouter } from 'next/router';
import { Flex, Box } from '@chakra-ui/react';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useTranslation } from 'next-i18next';
import Badge from '../Badge';
import MyIcon from '@fastgpt/web/components/common/Icon';

const NavbarPhone = ({ unread }: { unread: number }) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { lastChatAppId } = useChatStore();
  const navbarList = useMemo(
    () => [
      {
        label: t('common:navbar.Chat'),
        icon: 'core/chat/chatLight',
        activeIcon: 'core/chat/chatFill',
        link: `/chat?appId=${lastChatAppId}`,
        activeLink: ['/chat'],
        unread: 0
      },
      {
        label: t('common:navbar.Studio'),
        icon: 'core/app/aiLight',
        activeIcon: 'core/app/aiFill',
        link: `/app/list`,
        activeLink: ['/app/list', '/app/detail'],
        unread: 0
      },
      {
        label: t('common:navbar.Datasets'),
        icon: 'core/dataset/datasetLight',
        activeIcon: 'core/dataset/datasetFill',
        link: `/dataset/list`,
        activeLink: ['/dataset/list', '/dataset/detail'],
        unread: 0
      },
      {
        label: t('common:navbar.Toolkit'),
        icon: 'phoneTabbar/tool',
        activeIcon: 'phoneTabbar/toolFill',
        link: `/toolkit`,
        activeLink: ['/toolkit'],
        unread: 0
      },
      {
        label: t('common:navbar.Account'),
        icon: 'support/user/userLight',
        activeIcon: 'support/user/userFill',
        link: '/account',
        activeLink: [
          '/account/bill',
          '/account/info',
          '/account/team',
          '/account/usage',
          '/account/apikey',
          '/account/individuation',
          '/account/inform',
          '/account/promotion'
        ],
        unread
      }
    ],
    [t, lastChatAppId, unread]
  );

  return (
    <>
      <Flex
        alignItems={'center'}
        h={'100%'}
        justifyContent={'space-between'}
        backgroundColor={'white'}
        position={'relative'}
        px={4}
      >
        {navbarList.map((item) => (
          <Flex
            position={'relative'}
            key={item.link}
            cursor={'pointer'}
            borderRadius={'md'}
            textAlign={'center'}
            alignItems={'center'}
            h={'100%'}
            pt={1}
            px={3}
            transform={'scale(0.9)'}
            {...(item.activeLink.includes(router.pathname)
              ? {
                  color: 'primary.600'
                }
              : {
                  color: 'myGray.500'
                })}
            onClick={() => {
              if (item.link === router.asPath) return;
              router.push(item.link);
            }}
          >
            <Badge isDot count={item.unread}>
              <MyIcon
                name={
                  (item.activeLink.includes(router.pathname) ? item.activeIcon : item.icon) as any
                }
                width={'20px'}
                height={'20px'}
              />
              <Box fontSize={'12px'}>{item.label}</Box>
            </Badge>
          </Flex>
        ))}
      </Flex>
    </>
  );
};

export default NavbarPhone;
