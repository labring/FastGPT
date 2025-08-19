'use client';

import React, { useMemo, useState } from 'react';
import { Box, Flex, Tab, TabIndicator, TabList, TabPanel, TabPanels, Tabs } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import AppListContextProvider, { AppListContext } from '@/pageComponents/dashboard/apps/context';
import FolderPath from '@/components/common/folder/Path';
import { useRouter } from 'next/router';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import List from '@/pageComponents/chat/ChatTeamApp/List';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Drawer, DrawerContent, DrawerOverlay } from '@chakra-ui/react';
import ChatHistorySlider from '@/pageComponents/chat/ChatHistorySlider';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import NextHead from '@/components/common/NextHead';
import { ChatSettingContext } from '@/web/core/chat/context/chatSettingContext';

const MyApps = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPc } = useSystem();
  const { paths, myApps, isFetchingApps, setSearchKey } = useContextSelector(
    AppListContext,
    (v) => v
  );

  const pane = useContextSelector(ChatSettingContext, (v) => v.pane);
  const chatSettings = useContextSelector(ChatSettingContext, (v) => v.chatSettings);
  const handlePaneChange = useContextSelector(ChatSettingContext, (v) => v.handlePaneChange);

  const onCloseSlider = useContextSelector(ChatContext, (v) => v.onCloseSlider);
  const isOpenSlider = useContextSelector(ChatContext, (v) => v.isOpenSlider);
  const onOpenSlider = useContextSelector(ChatContext, (v) => v.onOpenSlider);

  const map = useMemo(
    () =>
      ({
        all: t('common:core.module.template.all_team_app'),
        [AppTypeEnum.simple]: t('app:type.Simple bot'),
        [AppTypeEnum.workflow]: t('app:type.Workflow bot'),
        [AppTypeEnum.plugin]: t('app:type.Plugin'),
        [AppTypeEnum.httpPlugin]: t('app:type.Http plugin'),
        [AppTypeEnum.folder]: t('common:Folder'),
        [AppTypeEnum.toolSet]: t('app:type.MCP tools'),
        [AppTypeEnum.tool]: t('app:type.MCP tools'),
        [AppTypeEnum.hidden]: t('app:type.hidden')
      }) satisfies Record<AppTypeEnum | 'all', string>,
    [t]
  );

  const [appType, setAppType] = useState<AppTypeEnum | 'all'>('all');
  const tabs = ['all' as const, AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.plugin];

  return (
    <Flex flexDirection={'column'} h={'100%'} pt={['46px', 0]}>
      <NextHead title={chatSettings?.homeTabTitle || 'FastGPT'} icon="/icon/logo.svg" />

      {!isPc && (
        <Flex h="46px" w="100vw" top="0" position="absolute" borderBottom="sm" color="myGray.900">
          <MyIcon
            ml={3}
            w="20px"
            color="myGray.900"
            name="core/chat/sidebar/menu"
            onClick={onOpenSlider}
          />

          <Drawer
            size="xs"
            placement="left"
            autoFocus={false}
            isOpen={isOpenSlider}
            onClose={onCloseSlider}
          >
            <DrawerOverlay backgroundColor="rgba(255,255,255,0.5)" />
            <DrawerContent maxWidth="75vw">
              <ChatHistorySlider
                confirmClearText={t('common:core.chat.Confirm to clear history')}
                pane={pane}
                chatSettings={chatSettings}
                onPaneChange={handlePaneChange}
              />
            </DrawerContent>
          </Drawer>
        </Flex>
      )}

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
          px={[3, 6]}
          flex={'1 0 0'}
          flexDirection={'column'}
          h={'100%'}
          overflowY={'auto'}
          overflowX={'hidden'}
        >
          <Flex pt={paths.length > 0 ? 3 : [4, 6]} alignItems={'center'} gap={3}>
            {isPc && (
              <Tabs variant="unstyled" onChange={(index) => setAppType(tabs[index])}>
                <TabList gap={5}>
                  {tabs.map((item, index) => (
                    <Tab
                      key={item}
                      color={appType === item ? 'primary.700' : 'myGray.500'}
                      fontWeight={500}
                      px={0}
                    >
                      {map[item]}
                    </Tab>
                  ))}
                </TabList>
                <TabIndicator mt="-1.5px" height="2px" bg="primary.600" borderRadius="1px" />
              </Tabs>
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
            <List appType={appType} />
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
