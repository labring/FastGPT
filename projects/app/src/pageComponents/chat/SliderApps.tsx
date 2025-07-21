import React, { useCallback, useState } from 'react';
import { Flex, Box, HStack, Image, Skeleton } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { type AppListItemType } from '@fastgpt/global/core/app/type';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { useUserStore } from '@/web/support/user/useUserStore';
import UserAvatarPopover from '@/pageComponents/chat/UserAvatarPopover';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import SelectOneResource from '@/components/common/folder/SelectOneResource';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type {
  GetResourceFolderListProps,
  GetResourceListItemResponse
} from '@fastgpt/global/common/parentFolder/type';
import { getMyApps } from '@/web/core/app/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

const SliderApps = ({ apps, activeAppId }: { apps: AppListItemType[]; activeAppId: string }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const isTeamChat = router.pathname === '/chat/team';
  const { userInfo } = useUserStore();
  const [imageLoaded, setImageLoaded] = useState(false);

  const getAppList = useCallback(async ({ parentId }: GetResourceFolderListProps) => {
    return getMyApps({
      parentId,
      type: [AppTypeEnum.folder, AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.plugin]
    }).then((res) =>
      res.map<GetResourceListItemResponse>((item) => ({
        id: item._id,
        name: item.name,
        avatar: item.avatar,
        isFolder: item.type === AppTypeEnum.folder
      }))
    );
  }, []);

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
    <Flex flexDirection={'column'} w={'100%'} h={'100%'}>
      <Box mt={4} pl={3}>
        <Flex alignItems={'center'} py={2}>
          <Skeleton
            w="143px"
            h="33px"
            pl={2}
            borderRadius="md"
            startColor="gray.100"
            endColor="gray.300"
            isLoaded={imageLoaded}
          >
            <Image
              w="135px"
              h="33px"
              src="/imgs/fastgpt_slogan.png"
              alt="FastGPT slogan"
              loading="eager"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageLoaded(true)}
            />
          </Skeleton>
        </Flex>
      </Box>

      <MyDivider h={1} my={1} mx="16px" w="calc(100% - 32px)" />

      {!isTeamChat && (
        <>
          <HStack
            px={3}
            my={2}
            color={'myGray.500'}
            fontSize={'sm'}
            justifyContent={'space-between'}
          >
            <Box pl={2}>{t('common:core.chat.Recent use')}</Box>
            <MyPopover
              placement="bottom-end"
              offset={[20, 10]}
              p={4}
              trigger="hover"
              Trigger={
                <HStack
                  spacing={0.5}
                  cursor={'pointer'}
                  px={2}
                  py={'0.5'}
                  borderRadius={'md'}
                  mr={-2}
                  userSelect={'none'}
                  _hover={{
                    bg: 'myGray.200'
                  }}
                >
                  <Box>{t('common:More')}</Box>
                  <MyIcon name={'common/select'} w={'1rem'} />
                </HStack>
              }
            >
              {({ onClose }) => (
                <Box minH={'200px'}>
                  <SelectOneResource
                    maxH={'60vh'}
                    value={activeAppId}
                    onSelect={(item) => {
                      if (!item) return;
                      onChangeApp(item.id);
                      onClose();
                    }}
                    server={getAppList}
                  />
                </Box>
              )}
            </MyPopover>
          </HStack>
        </>
      )}

      <MyBox flex={'1 0 0'} h={0} overflow={'overlay'} px={4} position={'relative'}>
        {apps.map((item) => (
          <Flex
            key={item._id}
            py={2}
            px={2}
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

      <Box px={3} py={4}>
        {userInfo ? (
          <UserAvatarPopover>
            <Flex alignItems="center" gap={2} w="100%">
              <Avatar
                flexShrink={0}
                src={userInfo.avatar}
                bg="myGray.200"
                borderRadius="50%"
                w={8}
                h={8}
              />
              <Box className="textEllipsis" flexGrow={1} fontSize={'sm'}>
                {userInfo.username}
              </Box>
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
            <Box
              flexGrow={1}
              textOverflow="ellipsis"
              overflow="hidden"
              whiteSpace="nowrap"
              fontWeight={500}
              color="myGray.600"
            >
              {t('login:Login')}
            </Box>
          </Flex>
        )}
      </Box>
    </Flex>
  );
};

export default React.memo(SliderApps);
