// @file 系统工具市场页面，展示可安装的系统工具列表
'use client';

import { serviceSideProps } from '@/web/common/i18n/utils';
import { getTeamSystemPluginList, postToggleInstallPlugin } from '@/web/core/plugin/team/api';
import { getPluginToolTags } from '@/web/core/plugin/toolTag/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Grid, VStack } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useMemo, useState, useReducer, useRef } from 'react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import ToolCard, { type ToolCardItemType } from '@fastgpt/web/components/core/plugin/tool/ToolCard';
import ToolDetailDrawer from '@fastgpt/web/components/core/plugin/tool/ToolDetailDrawer';
import { useUserStore } from '../../../web/support/user/useUserStore';
import { useRouter } from 'next/router';
import type { GetTeamPluginListResponseType } from '@fastgpt/global/openapi/core/plugin/team/api';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { getTeamToolDetail } from '@/web/core/plugin/team/api';
import DashboardContainer from '@/pageComponents/dashboard/Container';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { MyTabs } from '@fastgpt/web/components/common/MyTabs';
import MyTabBar from '@/components/MyTabBar';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';

type LoadingAction = { type: 'TRY_ADD'; pluginId: string } | { type: 'REMOVE'; pluginId: string };

const loadingReducer = (state: Set<string>, action: LoadingAction): Set<string> => {
  if (action.type === 'TRY_ADD') {
    if (state.has(action.pluginId)) {
      return state;
    }
    const newSet = new Set(state);
    newSet.add(action.pluginId);
    return newSet;
  }
  if (action.type === 'REMOVE') {
    if (!state.has(action.pluginId)) {
      return state;
    }
    const newSet = new Set(state);
    newSet.delete(action.pluginId);
    return newSet;
  }
  return state;
};

const ToolKitProvider = ({ MenuIcon }: { MenuIcon: JSX.Element }) => {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { isPc } = useSystem();
  const { userInfo } = useUserStore();

  const [searchText, setSearchText] = useState('');

  const [selectedTool, setSelectedTool] = useState<ToolCardItemType | null>(null);
  const [loadingPluginIds, dispatchLoading] = useReducer(loadingReducer, new Set<string>());
  const loadingPromisesRef = useRef<Map<string, Promise<void>>>(new Map());

  const [selectedTagId, setSelectedTagId] = useState<string>('all');
  const { data: tags = [] } = useRequest(getPluginToolTags, {
    manual: false
  });

  const toolTabList = useMemo(
    () => [
      { label: t('common:navbar.MyTools'), value: 'my', path: '/dashboard/tool' },
      { label: t('common:navbar.system_tool'), value: 'system', path: '/dashboard/systemTool' }
    ],
    [t]
  );

  // TODO: 把 filter 放到后端
  const [tools, setTools] = useState<GetTeamPluginListResponseType>([]);
  const { loading: loadingTools } = useRequest(() => getTeamSystemPluginList({ type: 'tool' }), {
    manual: false,
    onSuccess(data) {
      setTools(data);
    }
  });

  const { runAsync: toggleInstall } = useRequest(
    async (data: { pluginId: string; installed: boolean }) => {
      const existingPromise = loadingPromisesRef.current.get(data.pluginId);
      if (existingPromise) {
        await existingPromise;
        return;
      }

      const operationPromise = (async () => {
        dispatchLoading({ type: 'TRY_ADD', pluginId: data.pluginId });

        try {
          await postToggleInstallPlugin({
            ...data,
            type: 'tool'
          });
          setTools((prev) =>
            prev.map((t) => (t.id === data.pluginId ? { ...t, installed: data.installed } : t))
          );
        } finally {
          dispatchLoading({ type: 'REMOVE', pluginId: data.pluginId });
          loadingPromisesRef.current.delete(data.pluginId);
        }
      })();
      loadingPromisesRef.current.set(data.pluginId, operationPromise);

      await operationPromise;
    },
    {
      manual: true
    }
  );

  const filterTabList = useMemo(
    () => [
      { key: 'all', label: t('common:All') },
      ...tags.map((tag) => ({
        key: tag.tagId,
        label: parseI18nString(tag.tagName, i18n.language)
      }))
    ],
    [tags, t, i18n.language]
  );

  const displayTools = useMemo(() => {
    return tools
      .filter((tool) => {
        if (!searchText) return true;
        const name = tool.name.toLowerCase();
        const intro = tool.intro?.toLowerCase() || '';
        const search = searchText.toLowerCase();
        return name.includes(search) || intro.includes(search);
      })
      .filter((tool) => {
        if (selectedTagId === 'all') return true;
        return tool.tags?.some((tagId) => tagId === selectedTagId);
      })
      .map<ToolCardItemType>((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.intro,
        icon: tool.avatar,
        author: tool.author,
        tags: tool.tags
          ?.map((tagId) => {
            const matched = tags.find((tag) => tag.tagId === tagId);
            return matched ? parseI18nString(matched.tagName, i18n.language) : null;
          })
          .filter(Boolean) as string[],
        status: tool.status,
        installed: tool.installed,
        associatedPluginId: tool.associatedPluginId
      }));
  }, [tools, searchText, selectedTagId, tags, i18n.language]);

  return (
    <Flex flexDirection={'column'} h={'full'}>
      <Box flex={'1 0 0'} h={0} px={4} pb={4}>
        <MyBox
          h={'full'}
          rounded={'8px'}
          position={'relative'}
          display={'flex'}
          flexDirection={'column'}
          isLoading={loadingTools && displayTools.length === 0}
        >
          <Box pt={6} flexShrink={0}>
            {/* 第一行：标题 + MyTabs 居中 */}
            {isPc ? (
              <Flex alignItems="center" mb={4} position="relative" minH="36px">
                <Box fontSize="20px" fontWeight="medium" color="myGray.900">
                  {t('common:navbar.Tools')}
                </Box>
                <Box position="absolute" left="50%" transform="translateX(-50%)">
                  <MyTabs
                    tabs={toolTabList}
                    value="system"
                    onChange={(value) => {
                      const tab = toolTabList.find((t) => t.value === value);
                      if (tab) router.push(tab.path);
                    }}
                  />
                </Box>
              </Flex>
            ) : (
              <Box mb={4}>{MenuIcon}</Box>
            )}

            {/* 第二行：MyTabBar tag 筛选（左）+ 搜索框（右） */}
            <Flex mb={4} alignItems="center" gap={3}>
              <Box flex={1} minW={0}>
                <MyTabBar
                  tabs={filterTabList}
                  activeKey={selectedTagId}
                  onChange={(key) => setSelectedTagId(key)}
                />
              </Box>
              <Box w="250px" flexShrink={0} ml={'40px'}>
                <SearchInput
                  h="36px"
                  bg="white"
                  placeholder={t('common:Search')}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
              </Box>
            </Flex>
          </Box>

          <Box flex={1} overflowY={'auto'} pb={6}>
            {displayTools.length > 0 ? (
              <Grid
                gridTemplateColumns={[
                  '1fr',
                  'repeat(2,1fr)',
                  'repeat(2,1fr)',
                  'repeat(3,1fr)',
                  'repeat(4,1fr)'
                ]}
                gridGap={3}
                alignItems={'stretch'}
              >
                {displayTools.map((tool) => {
                  return (
                    <ToolCard
                      key={tool.id}
                      item={tool}
                      systemTitle={feConfigs?.systemTitle}
                      mode="team"
                      onInstall={() => toggleInstall({ pluginId: tool.id, installed: true })}
                      onDelete={() => toggleInstall({ pluginId: tool.id, installed: false })}
                      onClickCard={() => setSelectedTool(tool)}
                      isInstallingOrDeleting={loadingPluginIds.has(tool.id)}
                    />
                  );
                })}
              </Grid>
            ) : (
              <VStack>
                {!loadingTools && (
                  <>
                    <EmptyTip pb={4} />
                    {userInfo?.username === 'root' && (
                      <Button
                        onClick={() => {
                          router.push('/config/tool');
                        }}
                        w={'160px'}
                      >
                        {t('app:click_to_config')}
                      </Button>
                    )}
                  </>
                )}
              </VStack>
            )}
          </Box>
        </MyBox>
      </Box>

      {!!selectedTool && (
        <ToolDetailDrawer
          onClose={() => setSelectedTool(null)}
          selectedTool={selectedTool}
          showPoint={false}
          onToggleInstall={(installed) => {
            if (selectedTool) {
              toggleInstall({ pluginId: selectedTool.id, installed });
            }
          }}
          systemTitle={feConfigs.systemTitle}
          isLoading={loadingPluginIds.has(selectedTool.id)}
          onFetchDetail={async (toolId: string) => {
            const res = await getTeamToolDetail({ toolId });
            return {
              tools: res.tools,
              downloadUrl: ''
            };
          }}
          mode="team"
        />
      )}
    </Flex>
  );
};

function ContextRender() {
  return (
    <DashboardContainer>
      {({ MenuIcon }) => <ToolKitProvider MenuIcon={MenuIcon} />}
    </DashboardContainer>
  );
}

export default ContextRender;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'account']))
    }
  };
}
