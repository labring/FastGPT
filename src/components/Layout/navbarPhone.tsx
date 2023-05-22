import React, { useMemo } from 'react';
import { useRouter } from 'next/router';
import MyIcon from '../Icon';
import { Flex } from '@chakra-ui/react';
import { useChatStore } from '@/store/chat';

const NavbarPhone = () => {
  const router = useRouter();
  const { lastChatModelId, lastChatId } = useChatStore();
  const navbarList = useMemo(
    () => [
      {
        icon: 'tabbarChat',
        link: `/chat?modelId=${lastChatModelId}&chatId=${lastChatId}`,
        activeLink: ['/chat']
      },
      {
        icon: 'tabbarModel',
        link: `/model`,
        activeLink: ['/model']
      },
      {
        icon: 'tabbarMore',
        link: '/tools',
        activeLink: ['/tools']
      },
      {
        icon: 'tabbarMe',
        link: '/number',
        activeLink: ['/number']
      }
    ],
    [lastChatId, lastChatModelId]
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
            px={3}
            {...(item.activeLink.includes(router.asPath)
              ? {
                  color: '#7089f1'
                }
              : {
                  color: 'myGray.500'
                })}
            _after={
              item.activeLink.includes(router.asPath)
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
            <MyIcon name={item.icon as any} width={'20px'} height={'20px'} />
          </Flex>
        ))}
      </Flex>
    </>
  );
};

export default NavbarPhone;
