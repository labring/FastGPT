import React, { useMemo, useState } from 'react';
import { Box, Flex, Tab, TabIndicator, TabList, Tabs } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import AppListContextProvider, { AppListContext } from '@/pageComponents/dashboard/agent/context';
import FolderPath from '@/components/common/folder/Path';
import { useRouter } from 'next/router';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import List from '@/pageComponents/chat/ChatTeamApp/List';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import NextHead from '@/components/common/NextHead';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import ChatSliderMobileDrawer from '@/pageComponents/chat/slider/ChatSliderMobileDrawer';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';

const MyApps = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPc } = useSystem();
  const { feConfigs } = useSystemStore();

  const { paths, myApps, isFetchingApps, setSearchKey } = useContextSelector(
    AppListContext,
    (v) => v
  );

  const chatSettings = useContextSelector(ChatPageContext, (v) => v.chatSettings);

  const onOpenSlider = useContextSelector(ChatContext, (v) => v.onOpenSlider);

  const map = useMemo(
    () => ({
      all: t('common:core.module.template.all_team_app'),
      [AppTypeEnum.simple]: t('app:type.Chat_Agent'),
      [AppTypeEnum.workflow]: t('app:type.Workflow bot'),
      [AppTypeEnum.workflowTool]: t('app:toolType_workflow'),
      [AppTypeEnum.httpPlugin]: t('app:toolType_http'),
      [AppTypeEnum.httpToolSet]: t('app:toolType_http'),
      [AppTypeEnum.folder]: t('common:Folder'),
      [AppTypeEnum.mcpToolSet]: t('app:toolType_mcp'),
      [AppTypeEnum.tool]: t('app:toolType_mcp'),
      [AppTypeEnum.hidden]: t('app:type.hidden')
    }),
    [t]
  );

  const [appType, setAppType] = useState<AppTypeEnum | 'all'>('all');
  const tabs = ['all' as const, AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.workflowTool];

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <NextHead title={chatSettings?.homeTabTitle} icon={getWebReqUrl(feConfigs?.favicon)} />

      {!isPc && (
        <Flex
          py={4}
          color="myGray.900"
          gap={2}
          alignItems={'center'}
          pr={2}
          justifyContent={'space-between'}
        >
          <MyIcon
            ml={3}
            w="20px"
            color="myGray.500"
            name="core/chat/sidebar/menu"
            onClick={onOpenSlider}
          />

          <Box w="70%">
            <SearchInput
              onChange={(e) => setSearchKey(e.target.value)}
              placeholder={t('app:search_app')}
              maxLength={30}
            />
          </Box>

          <ChatSliderMobileDrawer
            showList={false}
            showMenu={false}
            banner={chatSettings?.wideLogoUrl}
            menuConfirmButtonText={t('common:core.chat.Confirm to clear history')}
          />
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
          <Flex pt={paths.length > 0 ? 3 : [0, 6]} alignItems={'center'} gap={3}>
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
                      {map[item as keyof typeof map]}
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
