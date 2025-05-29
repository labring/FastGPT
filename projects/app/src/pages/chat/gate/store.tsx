import React, { useEffect, useMemo, useState } from 'react';
import NextHead from '@/components/common/NextHead';
import { useRouter } from 'next/router';
import { getInitChatInfo } from '@/web/core/chat/api';
import { Box, Flex } from '@chakra-ui/react';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import FoldButton from '@/pageComponents/chat/gatechat/FoldButton';
import PageContainer from '@/components/PageContainer';
import { useUserStore } from '@/web/support/user/useUserStore';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { getMyApps } from '@/web/core/app/api';
import { getTeamTags } from '@fastgpt/service/core/app/tags/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

import { useMount } from 'ahooks';

import { GetChatTypeEnum } from '@/global/core/chat/constants';
import ChatContextProvider, { ChatContext } from '@/web/core/chat/context/chatContext';
import type { AppListItemType } from '@fastgpt/global/core/app/type';
import { useContextSelector } from 'use-context-selector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import GateNavBar from '../../../pageComponents/chat/gatechat/GateNavBar';
import GatePageContainer from '@/components/GatePageContainer';
import MySelect from '@fastgpt/web/components/common/MySelect';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import AppCard from '@/pageComponents/chat/gatechat/AppCard';
import type { GateSchemaType } from '@fastgpt/global/support/user/team/gate/type';
import { getTeamGateConfig } from '@/web/support/user/team/gate/api';
import { listFeatureApps } from '@/web/support/user/team/gate/featureApp';

const Chat = ({
  myApps,
  serverTagList = [],
  serverTagMap = {},
  gateConfig // 添加 gateConfig 参数
}: {
  myApps: AppListItemType[];
  serverTagList?: any[];
  serverTagMap?: Record<string, any>;
  gateConfig?: GateSchemaType; // 添加类型定义
}) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('');

  const { userInfo } = useUserStore();
  const { setLastChatAppId, chatId, appId } = useChatStore();

  const forbidLoadChat = useContextSelector(ChatContext, (v) => v.forbidLoadChat);

  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);
  const chatBoxData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  // 使用服务端渲染的标签数据
  const [tagList, setTagList] = useState<any[]>(serverTagList);

  // 使用服务端渲染的标签映射
  const tagMap = useMemo(() => {
    if (Object.keys(serverTagMap).length > 0) {
      // 将对象转换为 Map
      const map = new Map<string, any>();
      Object.keys(serverTagMap).forEach((key) => {
        map.set(key, serverTagMap[key]);
      });
      return map;
    }

    // 如果没有服务端数据，则创建新的映射（兼容旧版本）
    const map = new Map<string, any>();
    tagList.forEach((tag) => {
      map.set(tag._id, tag);
    });
    return map;
  }, [serverTagMap, tagList]);

  // Get unique tags from all apps
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    myApps.forEach((app) => {
      app.tags?.forEach((tag) => tags.add(tag));
    });
    return [
      { label: t('common:All'), value: '' },
      ...Array.from(tags).map((tag) => ({
        label: tagMap.get(tag)?.name || tag,
        value: tag
      }))
    ];
  }, [myApps, t, tagMap]);

  // Filter apps based on search and selected tag
  const filteredApps = useMemo(() => {
    return myApps.filter((app) => {
      const searchFilter = search
        ? app.name.toLowerCase().includes(search.toLowerCase()) ||
          app.intro?.toLowerCase().includes(search.toLowerCase())
        : true;

      const tagFilter = selectedTag ? app.tags?.includes(selectedTag) : true;

      return searchFilter && tagFilter;
    });
  }, [myApps, search, selectedTag]);

  // Load chat init data
  const { loading } = useRequest2(
    async () => {
      if (!appId || forbidLoadChat.current) return;

      const res = await getInitChatInfo({ appId, chatId });
      res.userAvatar = userInfo?.avatar;

      // Wait for state update to complete
      setChatBoxData(res);

      // reset chat variables
      resetVariables({
        variables: res.variables,
        variableList: res.app?.chatConfig?.variables
      });
    },
    {
      manual: false,
      refreshDeps: [appId, chatId],
      onError(e: any) {
        // reset all chat tore
        if (e?.code === 501) {
          setLastChatAppId('');
          router.replace('/dashboard/apps');
        }
      },
      onFinally() {
        forbidLoadChat.current = false;
      }
    }
  );

  const [sidebarFolded, setSidebarFolded] = useState(false);

  return (
    <Flex h={'100%'}>
      <NextHead title={gateConfig?.name} icon={gateConfig?.logo}></NextHead>
      {isPc && <GateNavBar apps={myApps} activeAppId={appId} gateConfig={gateConfig} />}

      {(!datasetCiteData || isPc) && (
        <GatePageContainer flex={'1 0 0'} w={0} position={'relative'}>
          {sidebarFolded && isPc && appId && (
            <Box position="absolute" left="-8px" top="50%" transform="translateY(-50%)" zIndex={10}>
              <FoldButton
                isFolded={true}
                onClick={() => setSidebarFolded(false)}
                position="navbar"
              />
            </Box>
          )}
          <Flex h={'100%'} flexDirection={['column', 'row']}>
            <Flex
              position={'relative'}
              h={[0, '100%']}
              w={['100%', 0]}
              flex={'1 0 0'}
              flexDirection={'column'}
              p={4}
            >
              {/* Filter Controls */}
              <Flex alignItems="center" justifyContent="space-between" mb={4} gap={4}>
                {/* 左侧Tab标签栏 */}
                <Flex overflowX="auto" gap={6} flex={1} minW={0}>
                  {allTags.map((tag) => (
                    <Box
                      key={tag.value}
                      px={2}
                      py={1}
                      minW="48px"
                      fontSize="16px"
                      fontWeight={selectedTag === tag.value ? 600 : 400}
                      color={selectedTag === tag.value ? 'blue.600' : 'gray.500'}
                      borderBottom={
                        selectedTag === tag.value ? '2px solid #2667FF' : '2px solid transparent'
                      }
                      cursor="pointer"
                      whiteSpace="nowrap"
                      onClick={() => setSelectedTag(tag.value)}
                      transition="all 0.2s"
                    >
                      {tag.label}
                    </Box>
                  ))}
                </Flex>
                {/* 右侧搜索和下拉 */}
                <Flex gap={2} alignItems="center" minW="340px">
                  <Box flex={1} minW="200px">
                    <SearchInput
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t('app:search_app')}
                    />
                  </Box>
                  <Box w={'120px'}>
                    <MySelect
                      value={selectedTag}
                      onChange={setSelectedTag}
                      list={allTags}
                      placeholder={t('common:select_tag')}
                    />
                  </Box>
                </Flex>
              </Flex>

              {/* App Cards Grid */}
              <Flex wrap="wrap" gap={4}>
                {filteredApps.map((app) => (
                  <AppCard key={app._id} app={app} selectedId={appId} tagMap={tagMap} />
                ))}
              </Flex>
            </Flex>
          </Flex>
        </GatePageContainer>
      )}

      {datasetCiteData && (
        <PageContainer flex={'1 0 0'} w={0} maxW={'560px'}>
          <ChatQuoteList
            rawSearch={datasetCiteData.rawSearch}
            metadata={datasetCiteData.metadata}
            onClose={() => setCiteModalData(undefined)}
          />
        </PageContainer>
      )}
    </Flex>
  );
};

const Render = (props: {
  appId: string;
  isStandalone?: string;
  serverTagList?: any[];
  serverTagMap?: Record<string, any>;
}) => {
  const { appId, isStandalone, serverTagList = [], serverTagMap = {} } = props;
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { source, chatId, lastChatAppId, setSource, setAppId } = useChatStore();
  const [gateConfig, setGateConfig] = useState<GateSchemaType | undefined>(undefined);
  // 加载 gateConfig
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await getTeamGateConfig();
        setGateConfig(config);
      } catch (error) {
        console.error('Failed to load gate config:', error);
      }
    };
    loadConfig();
  }, []);
  const { data: myApps = [], runAsync: loadMyApps } = useRequest2(
    () => listFeatureApps({ getRecentlyChat: true }),
    {
      manual: false,
      refreshDeps: [appId]
    }
  );

  // 初始化聊天框
  useMount(async () => {
    // 检查gate status，如果为false则重定向到应用列表页面
    if (gateConfig && !gateConfig.status) {
      toast({
        status: 'warning',
        title: t('common:Gate.service.is.unavailable')
      });
      router.replace('/dashboard/apps');
      return;
    }

    // pc: redirect to latest model chat
    if (!appId) {
      const apps = await loadMyApps();
      if (apps.length === 0) {
        toast({
          status: 'error',
          title: t('common:core.chat.You need to a chat app')
        });
        router.replace('/dashboard/apps');
      } else {
        router.replace({
          query: {
            ...router.query,
            appId: lastChatAppId || apps[0]._id
          }
        });
      }
    }
    setSource('online');
  });

  // 监听gateConfig变化，如果status变为false则重定向
  useEffect(() => {
    if (gateConfig && !gateConfig.status) {
      toast({
        status: 'warning',
        title: t('common:Gate.service.is.unavailable')
      });
      router.replace('/dashboard/apps');
    }
  }, [gateConfig, router, toast, t]);

  // Watch appId
  useEffect(() => {
    setAppId(appId);
  }, [appId, setAppId]);

  const chatHistoryProviderParams = useMemo(
    () => ({ appId, source: ChatSourceEnum.online }),
    [appId]
  );
  const chatRecordProviderParams = useMemo(() => {
    return {
      appId,
      type: GetChatTypeEnum.normal,
      chatId: chatId
    };
  }, [appId, chatId]);

  // 在所有 hooks 之后进行状态检查
  if (gateConfig && !gateConfig.status) {
    return null;
  }

  return source === ChatSourceEnum.online ? (
    <ChatContextProvider params={chatHistoryProviderParams}>
      <ChatItemContextProvider
        isResponseDetail={false}
        showRouteToAppDetail={isStandalone !== '1'}
        showRouteToDatasetDetail={isStandalone !== '1'}
        isShowReadRawSource={true}
        showNodeStatus
      >
        <ChatRecordContextProvider params={chatRecordProviderParams}>
          <Chat
            myApps={myApps}
            serverTagList={serverTagList}
            serverTagMap={serverTagMap}
            gateConfig={gateConfig} // 传递 gateConfig
          />
        </ChatRecordContextProvider>
      </ChatItemContextProvider>
    </ChatContextProvider>
  ) : null;
};

export async function getServerSideProps(context: any) {
  const props = {
    ...(await serviceSideProps(context, [
      'file',
      'app',
      'chat',
      'workflow',
      'account_gate',
      'common'
    ]))
  };

  try {
    // 服务端获取 teamId
    const { req } = context;
    const { teamId } = await authUserPer({
      req,
      authToken: true,
      authApiKey: true,
      per: ReadPermissionVal
    });

    // 服务端获取标签列表
    const tagList = await getTeamTags(teamId);
    // 创建标签映射
    const tagMap: Record<string, any> = {};
    tagList.forEach((tag: any) => {
      tagMap[tag._id] = tag;
    });

    return {
      props: {
        ...props,
        serverTagList: JSON.parse(JSON.stringify(tagList)),
        serverTagMap: JSON.parse(JSON.stringify(tagMap))
      }
    };
  } catch (error) {
    console.error('获取标签数据失败:', error);
    return { props };
  }
}

export default Render;
