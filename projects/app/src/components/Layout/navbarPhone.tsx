import React, { useMemo } from 'react';
import { useRouter } from 'next/router';
import { Flex, Box } from '@chakra-ui/react';
import { useChatStore } from '@/web/core/chat/storeChat';
import { useTranslation } from 'next-i18next';
import Badge from '../Badge';
import MyIcon from '@fastgpt/web/components/common/Icon';

const NavbarPhone = ({ unread }: { unread: number }) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { lastChatAppId, lastChatId } = useChatStore();
  const navbarList = useMemo(
    () => [
      {
        label: t('navbar.Chat'),
        icon: 'core/chat/chatLight',
        link: `/chat?appId=${lastChatAppId}&chatId=${lastChatId}`,
        activeLink: ['/chat'],
        unread: 0
      },
      {
        label: t('navbar.Apps'),
        icon: 'core/app/aiLight',
        link: `/app/list`,
        activeLink: ['/app/list', '/app/detail'],
        unread: 0
      },
      {
        label: t('navbar.Tools'),
        icon: 'phoneTabbar/more',
        link: '/tools',
        activeLink: ['/tools'],
        unread: 0
      },
      {
        label: t('navbar.Account'),
        icon: 'phoneTabbar/me',
        link: '/account',
        activeLink: ['/account'],
        unread
      }
    ],
    [t, lastChatAppId, lastChatId, unread]
  );

  return (
    <>
      <Flex
        alignItems={'center'}
        h={'100%'}
        justifyContent={'space-between'}
        backgroundColor={'white'}
        position={'relative'}
        px={10}
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
                  color: '#7089f1'
                }
              : {
                  color: 'myGray.500'
                })}
            _after={
              item.activeLink.includes(router.pathname)
                ? {
                    content: '""',
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%,-50%)',
                    borderRadius: '50%',
                    w: '18px',
                    h: '18px',
                    bg: ' #6782f1',
                    filter: 'blur(10px)',
                    boxShadow: '0px 2px 4px 0px rgba(0, 0, 0, 0.25)'
                  }
                : {}
            }
            onClick={() => {
              if (item.link === router.asPath) return;
              router.push(item.link);
            }}
          >
            <Badge isDot count={item.unread}>
              <MyIcon name={item.icon as any} width={'20px'} height={'20px'} />
              <Box fontSize={'12px'}>{item.label}</Box>
            </Badge>
          </Flex>
        ))}
      </Flex>
    </>
  );
};

export default NavbarPhone;
