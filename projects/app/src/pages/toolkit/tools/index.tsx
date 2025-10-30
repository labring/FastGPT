'use client';

import { serviceSideProps } from '@/web/common/i18n/utils';
import {
  getPluginTags,
  getPreviewPluginNode,
  getSystemPlugins,
  getTeamInstalledPluginIds,
  postToggleInstallPlugin
} from '@/web/core/app/api/plugin';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Grid, Input, InputGroup } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useMemo, useState, useCallback } from 'react';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import type { ToolCardItemType } from '@fastgpt/web/components/core/plugins/ToolCard';
import ToolCard from '@fastgpt/web/components/core/plugins/ToolCard';
import PluginTagFilter from '@fastgpt/web/components/core/plugins/PluginTagFilter';
import ToolDetailDrawer from '@fastgpt/web/components/core/plugins/ToolDetailDrawer';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { splitCombinePluginId } from '@fastgpt/global/core/app/plugin/utils';
import { PluginSourceEnum } from '@fastgpt/global/core/app/plugin/constants';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';

const ToolKitProvider = () => {
  const { t, i18n } = useTranslation();
  const { feConfigs } = useSystemStore();
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [installedFilter, setInstalledFilter] = useState<'all' | 'installed' | 'uninstalled'>(
    'all'
  );
  const [selectedTool, setSelectedTool] = useState<ToolCardItemType | null>(null);
  const [searchText, setSearchText] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [loadingPluginId, setLoadingPluginId] = useState<string | null>(null);

  const { data: tools = [], loading: loadingTools } = useRequest2(
    () => getSystemPlugins({ source: 'team' }),
    {
      manual: false
    }
  );
  const { data: tags = [], loading: loadingTags } = useRequest2(getPluginTags, {
    manual: false
  });
  const {
    data: installStatus,
    run: refreshInstallStatus,
    loading: loadingInstallStatus
  } = useRequest2(getTeamInstalledPluginIds, {
    manual: false
  });
  const { runAsync: toggleInstall } = useRequest2(
    async (data: { pluginId: string; installed: boolean }) => {
      setLoadingPluginId(data.pluginId);
      try {
        return await postToggleInstallPlugin(data);
      } finally {
        setLoadingPluginId(null);
      }
    },
    {
      onSuccess: () => refreshInstallStatus()
    }
  );
  const getPluginInstallStatus = useCallback(
    (pluginId: string) => {
      if (!installStatus) return null;
      if (installStatus.uninstalledIds.includes(pluginId)) {
        return false;
      }
      if (installStatus.installedIds.includes(pluginId)) {
        return true;
      }
      const plugin = tools.find((item) => item.id === pluginId);
      return !!plugin?.defaultInstalled;
    },
    [installStatus, tools]
  );

  const displayTools: ToolCardItemType[] = useMemo(() => {
    const filteredTools = tools
      .filter((tool) => {
        if (!searchText) return true;
        const name = tool.name.toLowerCase();
        const intro = tool.intro?.toLowerCase() || '';
        const search = searchText.toLowerCase();
        return name.includes(search) || intro.includes(search);
      })
      .filter((tool) => {
        if (selectedTagIds.length === 0) return true;
        return tool.tags?.some((tag) => selectedTagIds.includes(tag.tagId));
      })
      .filter((tool) => {
        if (installedFilter === 'all') return true;
        const isInstalled = getPluginInstallStatus(tool.id);
        if (installedFilter === 'installed') return !!isInstalled;
        if (installedFilter === 'uninstalled') return !isInstalled;
        return true;
      });

    return filteredTools.map((tool) => ({
      ...tool,
      name: parseI18nString(tool.name || '', i18n.language),
      description: parseI18nString(tool.intro || '', i18n.language),
      icon: tool.avatar,
      tags: tool.tags?.map((tag) => parseI18nString(tag.tagName || '', i18n.language)),
      status: tool.status === 1 ? (getPluginInstallStatus(tool.id) ? 3 : 1) : tool.status
    }));
  }, [tools, searchText, selectedTagIds, installedFilter, getPluginInstallStatus]);

  return (
    <Box h={'full'} py={6} pr={6}>
      <MyBox
        bg={'white'}
        h={'full'}
        rounded={'8px'}
        position={'relative'}
        display={'flex'}
        flexDirection={'column'}
        isLoading={loadingTools || loadingTags || loadingInstallStatus}
      >
        <Box px={8} flexShrink={0}>
          <Button
            position={'absolute'}
            right={8}
            top={8}
            onClick={() => {
              console.log('feConfigs?.systemPluginCourseUrl', feConfigs?.systemPluginCourseUrl);
              if (feConfigs?.systemPluginCourseUrl) {
                window.open(feConfigs.systemPluginCourseUrl);
              }
            }}
          >
            {t('app:toolkit_contribute_resource')}
          </Button>
          <Box mt={8} mb={4} fontSize={'20px'} fontWeight={'medium'} color={'black'}>
            {t('common:navbar.Tools')}
          </Box>
          <Flex my={2} alignItems={'center'}>
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
                    onToggleInstall={(installed) => toggleInstall({ pluginId: tool.id, installed })}
                    systemTitle={feConfigs.systemTitle}
                    onClick={() => setSelectedTool(tool)}
                    isLoading={loadingPluginId === tool.id}
                  />
                );
              })}
            </Grid>
          ) : (
            <EmptyTip />
          )}
        </Box>
      </MyBox>

      {!!selectedTool && (
        <ToolDetailDrawer
          onClose={() => setSelectedTool(null)}
          selectedTool={selectedTool}
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
