'use client';

import { serviceSideProps } from '@/web/common/i18n/utils';
import { getPreviewPluginNode, getSystemPlugins } from '@/web/core/app/api/plugin';
import { getTeamSystemPluginList, postToggleInstallPlugin } from '@/web/core/plugin/team/api';
import { getPluginToolTags } from '@/web/core/plugin/toolTag/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Grid, Input, InputGroup, VStack } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useMemo, useState } from 'react';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import type { ToolCardItemType } from '@fastgpt/web/components/core/plugins/ToolCard';
import ToolCard from '@fastgpt/web/components/core/plugins/ToolCard';
import PluginTagFilter from '@fastgpt/web/components/core/plugins/PluginTagFilter';
import ToolDetailDrawer from '@fastgpt/web/components/core/plugins/ToolDetailDrawer';
import { splitCombinePluginId } from '@fastgpt/global/core/app/plugin/utils';
import { PluginSourceEnum } from '@fastgpt/global/core/app/plugin/constants';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useUserStore } from '../../../web/support/user/useUserStore';
import { useRouter } from 'next/router';
import { getDocPath } from '@/web/common/system/doc';
import type { GetTeamSystemPluginListResponseType } from '@fastgpt/global/openapi/core/plugin/team/api';

const ToolKitProvider = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { userInfo } = useUserStore();

  const [installedFilter, setInstalledFilter] = useState<'all' | 'installed' | 'uninstalled'>(
    'all'
  );
  const [searchText, setSearchText] = useState('');

  const [selectedTool, setSelectedTool] = useState<ToolCardItemType | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [loadingPluginId, setLoadingPluginId] = useState<string | null>(null);

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const { data: tags = [] } = useRequest2(getPluginToolTags, {
    manual: false
  });

  // TODO: 把 filter 放到后端
  const [tools, setTools] = useState<GetTeamSystemPluginListResponseType>([]);
  const { loading: loadingTools } = useRequest2(() => getTeamSystemPluginList({ type: 'tool' }), {
    manual: false,
    onSuccess(data) {
      setTools(data);
    }
  });

  const { runAsync: toggleInstall } = useRequest2(
    async (data: { pluginId: string; installed: boolean }) => {
      setLoadingPluginId(data.pluginId);
      try {
        await postToggleInstallPlugin({
          ...data,
          type: 'tool'
        });
        setTools((prev) =>
          prev.map((t) => (t.id === data.pluginId ? { ...t, installed: data.installed } : t))
        );
      } finally {
        setLoadingPluginId(null);
      }
    }
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
        if (selectedTagIds.length === 0) return true;
        return tool.tags?.some((tag) => selectedTagIds.includes(tag));
      })
      .filter((tool) => {
        if (installedFilter === 'all') return true;
        const isInstalled = tool.installed;
        if (installedFilter === 'installed') return !!isInstalled;
        if (installedFilter === 'uninstalled') return !isInstalled;
        return true;
      })
      .map<ToolCardItemType>((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.intro,
        icon: tool.avatar,
        author: tool.author,
        tags: tool.tags,
        status: tool.status,
        installed: tool.installed
      }));
  }, [tools, searchText, selectedTagIds, installedFilter]);

  return (
    <Box h={'full'} py={6} pr={6}>
      <MyBox
        bg={'white'}
        h={'full'}
        rounded={'8px'}
        position={'relative'}
        display={'flex'}
        flexDirection={'column'}
        isLoading={loadingTools && displayTools.length === 0}
      >
        <Box px={8} flexShrink={0}>
          <Button
            position={'absolute'}
            right={8}
            top={8}
            onClick={() => {
              const url = getDocPath('/docs/introduction/guide/plugins/dev_system_tool');

              if (url) {
                window.open(url, '_blank');
              }
            }}
          >
            {t('app:toolkit_contribute_resource')}
          </Button>
          <Box mt={8} mb={4} fontSize={'20px'} fontWeight={'medium'} color={'black'}>
            {t('common:navbar.Tools')}
          </Box>
          <Flex mt={2} mb={4} alignItems={'center'}>
            <Flex alignItems={'center'}>
              <Flex
                alignItems={'center'}
                transition={'all 0.3s'}
                w={isSearchExpanded ? '320px' : 'auto'}
                mr={4}
              >
                {isSearchExpanded ? (
                  <InputGroup>
                    <MyIcon
                      position={'absolute'}
                      zIndex={10}
                      left={2.5}
                      name={'common/searchLight'}
                      w={5}
                      color={'primary.600'}
                      top={'50%'}
                      transform={'translateY(-50%)'}
                    />
                    <Input
                      px={8}
                      h={10}
                      borderRadius={'md'}
                      placeholder={t('common:search_tool')}
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      autoFocus
                      onBlur={() => {
                        if (!searchText) {
                          setIsSearchExpanded(false);
                        }
                      }}
                    />
                    {searchText && (
                      <MyIcon
                        position={'absolute'}
                        zIndex={10}
                        right={2.5}
                        name={'common/closeLight'}
                        w={4}
                        top={'50%'}
                        transform={'translateY(-50%)'}
                        color={'myGray.500'}
                        cursor={'pointer'}
                        onClick={() => {
                          setSearchText('');
                          setIsSearchExpanded(false);
                        }}
                      />
                    )}
                  </InputGroup>
                ) : (
                  <Flex
                    alignItems={'center'}
                    justifyContent={'center'}
                    cursor={'pointer'}
                    borderRadius={'md'}
                    _hover={{ bg: 'myGray.100' }}
                    onClick={() => setIsSearchExpanded(true)}
                    p={2}
                    py={1.5}
                    border={'1px solid'}
                    borderColor={'myGray.200'}
                  >
                    <MyIcon name={'common/searchLight'} w={5} color={'primary.600'} mr={2} />
                    <Box fontSize={'16px'} fontWeight={'medium'} color={'myGray.500'}>
                      {t('common:Search')}
                    </Box>
                  </Flex>
                )}
              </Flex>
            </Flex>
            <PluginTagFilter
              tags={tags}
              selectedTagIds={selectedTagIds}
              onTagSelect={setSelectedTagIds}
            />
            <Box w={40} />
            <MyMenu
              trigger="hover"
              Button={
                <Flex alignItems={'center'} cursor={'pointer'} pl={1}>
                  <MyIcon name="core/chat/chevronDown" w={4} mr={1} />
                  <Box fontSize={'12px'}>
                    {installedFilter === 'installed'
                      ? t('app:toolkit_installed')
                      : installedFilter === 'uninstalled'
                        ? t('app:toolkit_uninstalled')
                        : t('common:All')}
                  </Box>
                </Flex>
              }
              menuList={[
                {
                  children: [
                    {
                      label: t('common:All'),
                      onClick: () => setInstalledFilter('all'),
                      isActive: installedFilter === 'all'
                    },
                    {
                      label: t('app:toolkit_installed'),
                      onClick: () => setInstalledFilter('installed'),
                      isActive: installedFilter === 'installed'
                    },
                    {
                      label: t('app:toolkit_uninstalled'),
                      onClick: () => setInstalledFilter('uninstalled'),
                      isActive: installedFilter === 'uninstalled'
                    }
                  ]
                }
              ]}
            />
          </Flex>
        </Box>

        <Box flex={1} overflowY={'auto'} px={8} pb={6}>
          {displayTools.length > 0 ? (
            <Grid
              gridTemplateColumns={['1fr', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']}
              gridGap={5}
              alignItems={'stretch'}
            >
              {displayTools.map((tool) => {
                return (
                  <ToolCard
                    key={tool.id}
                    item={tool}
                    systemTitle={feConfigs?.systemTitle}
                    isLoading={loadingPluginId === tool.id}
                    mode="team"
                    onClickButton={(installed) => toggleInstall({ pluginId: tool.id, installed })}
                    onClickCard={() => setSelectedTool(tool)}
                  />
                );
              })}
            </Grid>
          ) : (
            <VStack>
              {!loadingTools && <EmptyTip pb={4} />}
              {userInfo?.username === 'root' && (
                <Button
                  onClick={() => {
                    router.push('/config/tools');
                  }}
                  w={'160px'}
                >
                  {t('app:click_to_config')}
                </Button>
              )}
            </VStack>
          )}
        </Box>
      </MyBox>

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
          isLoading={loadingPluginId === selectedTool.id}
          // @ts-ignore
          onFetchDetail={async (toolId: string) => {
            if (splitCombinePluginId(toolId).source === PluginSourceEnum.systemTool) {
              const tools = await getSystemPlugins({ parentId: toolId });
              return {
                tools: [selectedTool, ...tools],
                downloadUrl: ''
              };
            } else {
              const toolDetail = await getPreviewPluginNode({ appId: toolId });
              return {
                tools: [
                  {
                    ...selectedTool,
                    versionList: [
                      {
                        inputs: toolDetail.inputs.filter(
                          (input) => input.key !== NodeInputKeyEnum.forbidStream
                        ),
                        outputs: toolDetail.outputs.filter(
                          (output) => output.key !== NodeOutputKeyEnum.errorText
                        )
                      }
                    ]
                  }
                ],
                downloadUrl: ''
              };
            }
          }}
        />
      )}
    </Box>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app']))
    }
  };
}

export default ToolKitProvider;
