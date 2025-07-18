import React, { useCallback, useState } from 'react';
import { Flex, Box, HStack, Image, Text, Skeleton } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { type AppListItemType } from '@fastgpt/global/core/app/type';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { useUserStore } from '@/web/support/user/useUserStore';
import UserAvatarPopover from '@/pageComponents/chat/UserAvatarPopover';
import MyBox from '@fastgpt/web/components/common/MyBox';

const SliderApps = ({ apps, activeAppId }: { apps: AppListItemType[]; activeAppId: string }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const isTeamChat = router.pathname === '/chat/team';
  const { userInfo } = useUserStore();
  const [imageLoaded, setImageLoaded] = useState(false);

  const onChangeApp = useCallback(
    (appId: string) => {
      router.replace({
        query: {
          ...router.query,
          appId
        }
      });
    },
    [router]
  );

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <Box mt={4} pl={4}>
        <Flex alignItems={'center'} py={2}>
          {!imageLoaded && (
            <Skeleton
              w="135px"
              h="33px"
              borderRadius="md"
              startColor="gray.100"
              endColor="gray.300"
            />
          )}
          <Image
            w="135px"
            h="33px"
            src="/imgs/fastgpt_slogan.png"
            alt="FastGPT slogan"
            loading="eager"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageLoaded(true)}
            display={imageLoaded ? 'block' : 'none'}
          />
        </Flex>
      </Box>

      <MyDivider h={1} my={1} mx="16px" w="calc(100% - 32px)" />

      {!isTeamChat && (
        <HStack px={4} my={2} color={'myGray.500'} fontSize={'sm'} justifyContent={'space-between'}>
          <Box>{t('common:core.chat.Recent use')}</Box>
        </HStack>
      )}

      <MyBox flex={'1 0 0'} h={0} overflow={'overlay'} px={4} position={'relative'}>
        {apps.map((item) => (
          <Flex
            key={item._id}
            py={2}
            px={3}
            mb={3}
            cursor={'pointer'}
            borderRadius={'md'}
            alignItems={'center'}
            fontSize={'sm'}
            {...(item._id === activeAppId
              ? {
                  bg: 'white',
                  boxShadow: 'md',
                  color: 'primary.600'
                }
              : {
                  _hover: {
                    bg: 'myGray.200'
                  },
                  onClick: () => onChangeApp(item._id)
                })}
          >
            <Avatar src={item.avatar} w={'1.5rem'} borderRadius={'md'} />
            <Box ml={2} className={'textEllipsis'}>
              {item.name}
            </Box>
          </Flex>
        ))}
      </MyBox>

      <Flex p="4" alignItems="center">
        {userInfo ? (
          <UserAvatarPopover userInfo={userInfo}>
            <Flex alignItems="center" gap={2} w="100%">
              <Avatar
                flexShrink={0}
                src={userInfo.avatar}
                bg="myGray.200"
                borderRadius="50%"
                w={9}
                h={9}
              />
              <Text
                flexGrow={1}
                textOverflow="ellipsis"
                overflow="hidden"
                whiteSpace="nowrap"
                fontWeight={500}
              >
                {userInfo.username}
              </Text>
            </Flex>
          </UserAvatarPopover>
        ) : (
          <Flex
            alignItems="center"
            gap={2}
            w="100%"
            cursor="pointer"
            _hover={{ bg: 'myGray.100' }}
            borderRadius="md"
            p={2}
          >
            <Avatar flexShrink={0} bg="myGray.200" borderRadius="50%" w={9} h={9} />
            <Text
              flexGrow={1}
              textOverflow="ellipsis"
              overflow="hidden"
              whiteSpace="nowrap"
              fontWeight={500}
              color="myGray.600"
            >
              {t('login:Login')}
            </Text>
          </Flex>
        )}
      </Flex>
    </Flex>
  );
};

export default React.memo(SliderApps);
