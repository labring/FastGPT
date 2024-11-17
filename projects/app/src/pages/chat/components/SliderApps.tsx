import React, { useCallback } from 'react';
import { Flex, Box, IconButton, HStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { AppListItemType } from '@fastgpt/global/core/app/type';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import MyPopover from '@fastgpt/web/components/common/MyPopover/index';
import { getMyApps } from '@/web/core/app/api';
import {
  GetResourceFolderListProps,
  GetResourceListItemResponse
} from '@fastgpt/global/common/parentFolder/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import dynamic from 'next/dynamic';

const SelectOneResource = dynamic(() => import('@/components/common/folder/SelectOneResource'));

const SliderApps = ({ apps, activeAppId }: { apps: AppListItemType[]; activeAppId: string }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const isTeamChat = router.pathname === '/chat/team';

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
    <Flex flexDirection={'column'} h={'100%'}>
      <Box mt={4} px={4}>
        {!isTeamChat && (
          <Flex
            alignItems={'center'}
            cursor={'pointer'}
            py={2}
            px={3}
            borderRadius={'md'}
            _hover={{ bg: 'myGray.200' }}
            onClick={() => router.push('/app/list')}
          >
            <IconButton
              mr={3}
              icon={<MyIcon name={'common/backFill'} w={'1rem'} color={'primary.500'} />}
              bg={'white'}
              boxShadow={'1px 1px 9px rgba(0,0,0,0.15)'}
              size={'smSquare'}
              borderRadius={'50%'}
              aria-label={''}
            />
            {t('common:core.chat.Exit Chat')}
          </Flex>
        )}
      </Box>

      {!isTeamChat && (
        <>
          <MyDivider h={2} my={1} />
          <HStack
            px={4}
            my={2}
            color={'myGray.500'}
            fontSize={'sm'}
            justifyContent={'space-between'}
          >
            <Box>{t('common:core.chat.Recent use')}</Box>
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
                  <Box>{t('common:common.More')}</Box>
                  <MyIcon name={'common/select'} w={'1rem'} />
                </HStack>
              }
            >
              {({ onClose }) => (
                <Box minH={'200px'}>
                  <SelectOneResource
                    maxH={'60vh'}
                    value={activeAppId}
                    onSelect={(id) => {
                      if (!id) return;
                      onChangeApp(id);
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

      <Box flex={'1 0 0'} px={4} h={0} overflow={'overlay'}>
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
      </Box>
    </Flex>
  );
};

export default React.memo(SliderApps);
