import React from 'react';
import { Box, Grid, HStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from '@/pageComponents/dashboard/agent/context';
import { AppTypeEnum, ToolTypeList } from '@fastgpt/global/core/app/constants';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import AppTypeTag from '@/pageComponents/chat/ChatTeamApp/TypeTag';

import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import UserBox from '@fastgpt/web/components/common/UserBox';
import { ChatSettingContext } from '@/web/core/chat/context/chatSettingContext';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';

const List = ({ appType }: { appType: AppTypeEnum | 'all' }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPc } = useSystem();

  const myApps = useContextSelector(AppListContext, (v) =>
    v.myApps.filter(
      (app) =>
        appType === 'all' ||
        [
          appType,
          ToolTypeList.includes(appType) ? AppTypeEnum.toolFolder : AppTypeEnum.folder
        ].includes(app.type)
    )
  );
  const handlePaneChange = useContextSelector(ChatSettingContext, (v) => v.handlePaneChange);

  return (
    <>
      <Grid
        py={[0, 4]}
        gridTemplateColumns={[
          '1fr',
          'repeat(2,1fr)',
          'repeat(2,1fr)',
          'repeat(3,1fr)',
          'repeat(4,1fr)'
        ]}
        gridGap={5}
        alignItems={'stretch'}
      >
        {myApps.map((app) => {
          return (
            <MyTooltip
              key={app._id}
              h="100%"
              label={
                app.type === AppTypeEnum.folder ? t('common:open_folder') : t('app:go_to_chat')
              }
            >
              <MyBox
                lineHeight={1.5}
                h="100%"
                pt={5}
                pb={3}
                px={5}
                cursor={'pointer'}
                border={'base'}
                boxShadow={'2'}
                bg={'white'}
                borderRadius={'lg'}
                position={'relative'}
                display={'flex'}
                flexDirection={'column'}
                _hover={{
                  borderColor: 'primary.300',
                  boxShadow: '1.5',
                  '& .more': {
                    display: 'flex'
                  },
                  '& .time': {
                    display: ['flex', 'none']
                  }
                }}
                onClick={() => {
                  if (app.type === AppTypeEnum.folder) {
                    router.push({
                      query: {
                        ...router.query,
                        parentId: app._id
                      }
                    });
                  } else {
                    handlePaneChange(ChatSidebarPaneEnum.RECENTLY_USED_APPS, app._id);
                  }
                }}
              >
                <HStack>
                  <Avatar src={app.avatar} borderRadius={'sm'} w={'1.5rem'} />
                  <Box flex={'1 0 0'} color={'myGray.900'}>
                    {app.name}
                  </Box>
                  <Box mr={'-1.25rem'}>
                    <AppTypeTag type={app.type} />
                  </Box>
                </HStack>
                <Box
                  flex={['1 0 60px', '1 0 72px']}
                  mt={3}
                  pr={8}
                  textAlign={'justify'}
                  wordBreak={'break-all'}
                  fontSize={'xs'}
                  color={'myGray.500'}
                >
                  <Box className={'textEllipsis2'} whiteSpace={'pre-wrap'}>
                    {app.intro || t('common:no_intro')}
                  </Box>
                </Box>
                <HStack h={'24px'} fontSize={'mini'} color={'myGray.500'} w="full">
                  <HStack flex={'1 0 0'}>
                    <UserBox
                      sourceMember={app.sourceMember}
                      fontSize="xs"
                      avatarSize="1rem"
                      spacing={0.5}
                    />
                  </HStack>
                  <HStack>
                    {isPc && (
                      <HStack spacing={0.5}>
                        <MyIcon name={'history'} w={'0.85rem'} color={'myGray.400'} />
                        <Box color={'myGray.500'}>
                          {t(formatTimeToChatTime(app.updateTime) as any).replace('#', ':')}
                        </Box>
                      </HStack>
                    )}
                  </HStack>
                </HStack>
              </MyBox>
            </MyTooltip>
          );
        })}
      </Grid>
      {myApps.length === 0 && <EmptyTip text={t('common:core.app.no_app')} pt={'30vh'} />}
    </>
  );
};
export default List;
