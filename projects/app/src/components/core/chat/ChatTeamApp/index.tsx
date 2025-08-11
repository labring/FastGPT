'use client';

import React, { useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import AppListContextProvider, { AppListContext } from '@/pageComponents/dashboard/apps/context';
import FolderPath from '@/components/common/folder/Path';
import { useRouter } from 'next/router';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import List from '@/components/core/chat/ChatTeamApp/List';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';

const MyApps = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPc } = useSystem();
  const {
    paths,
    parentId,
    myApps,
    appType,
    loadMyApps,
    onUpdateApp,
    setMoveAppId,
    isFetchingApps,
    folderDetail,
    refetchFolderDetail,
    searchKey,
    setSearchKey
  } = useContextSelector(AppListContext, (v) => v);

  const appTypeName = useMemo(() => {
    const map: Record<AppTypeEnum | 'all', string> = {
      all: t('common:core.module.template.Team app'),
      [AppTypeEnum.simple]: t('app:type.Simple bot'),
      [AppTypeEnum.workflow]: t('app:type.Workflow bot'),
      [AppTypeEnum.plugin]: t('app:type.Plugin'),
      [AppTypeEnum.httpPlugin]: t('app:type.Http plugin'),
      [AppTypeEnum.folder]: t('common:Folder'),
      [AppTypeEnum.toolSet]: t('app:type.MCP tools'),
      [AppTypeEnum.tool]: t('app:type.MCP tools'),
      [AppTypeEnum.hidden]: t('app:type.hidden')
    };
    return map[appType] || map['all'];
  }, [appType, t]);

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      {paths.length > 0 && (
        <Box pt={[4, 6]} pl={5}>
          <FolderPath
            paths={paths}
            hoverStyle={{ bg: 'myGray.200' }}
            forbidLastClick
            onClick={(parentId) => {
              router.push({
                query: {
                  ...router.query,
                  parentId
                }
              });
            }}
          />
        </Box>
      )}
      <Flex gap={5} flex={'1 0 0'} h={0}>
        <Flex
          flex={'1 0 0'}
          flexDirection={'column'}
          h={'100%'}
          pr={folderDetail ? [3, 2] : [3, 6]}
          pl={6}
          overflowY={'auto'}
          overflowX={'hidden'}
        >
          <Flex pt={paths.length > 0 ? 3 : [4, 6]} alignItems={'center'} gap={3}>
            {isPc && (
              <Box fontSize={'lg'} color={'myGray.900'} fontWeight={500}>
                {appTypeName}
              </Box>
            )}
            <Box flex={1} />

            {isPc && (
              <SearchInput
                maxW={['auto', '250px']}
                onChange={(e) => setSearchKey(e.target.value)}
                placeholder={t('app:search_app')}
                maxLength={30}
              />
            )}
          </Flex>

          {!isPc && (
            <Box mt={2}>
              {
                <SearchInput
                  maxW={['auto', '250px']}
                  onChange={(e) => setSearchKey(e.target.value)}
                  placeholder={t('app:search_app')}
                  maxLength={30}
                />
              }
            </Box>
          )}

          <MyBox flex={'1 0 0'} isLoading={myApps.length === 0 && isFetchingApps}>
            <List />
          </MyBox>
        </Flex>
      </Flex>
    </Flex>
  );
};

function ContextRender() {
  return (
    <AppListContextProvider>
      <MyApps />
    </AppListContextProvider>
  );
}

export default ContextRender;
