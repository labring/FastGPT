'use client';

import { serviceSideProps } from '@/web/common/i18n/utils';
import {
  getPluginTags,
  getSystemPlugins,
  getTeamInstalledPluginIds,
  postToggleInstallPlugin
} from '@/web/core/app/api/plugin';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Grid } from '@chakra-ui/react';
import ToolCard from '@fastgpt/web/components/common/ToolCard';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useMemo, useState, useCallback } from 'react';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

const ToolKitProvider = () => {
  const { t, i18n } = useTranslation();
  const { feConfigs } = useSystemStore();
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [installedFilter, setInstalledFilter] = useState<boolean>(false);

  const { data: tools = [], loading: loadingTools } = useRequest2(getSystemPlugins, {
    manual: false
  });
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
  const { runAsync: toggleInstall, loading: toggleInstallLoading } = useRequest2(
    async (data) => {
      return await postToggleInstallPlugin(data);
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

  const filteredTools = useMemo(() => {
    const tagFiltered =
      selectedTagIds.length > 0
        ? tools.filter((tool) => {
            return tool.tags?.some((tag) => selectedTagIds.includes(tag.tagId));
          })
        : tools;

    return installedFilter
      ? tagFiltered.filter((tool) => {
          const isInstalled = getPluginInstallStatus(tool.id);
          return isInstalled === true;
        })
      : tagFiltered;
  }, [tools, selectedTagIds, installedFilter, getPluginInstallStatus]);

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId);
      } else {
        return [...prev, tagId];
      }
    });
  };

  return (
    <Box h={'full'} py={6} pr={6}>
      <MyBox
        bg={'white'}
        h={'full'}
        rounded={'8px'}
        position={'relative'}
        display={'flex'}
        flexDirection={'column'}
        isLoading={loadingTools || loadingTags || loadingInstallStatus || toggleInstallLoading}
      >
        <Box px={8} flexShrink={0}>
          <Button position={'absolute'} right={4} top={4} onClick={() => {}}>
            {t('app:toolkit_contribute_resource')}
          </Button>
          <Flex pt={8}>
            <Box p={1}>{t('common:navbar.Toolkit')}</Box>
          </Flex>
          <Flex my={4} alignItems={'center'}>
            <Box
              px={3}
              py={1.5}
              fontSize={'12px'}
              fontWeight={'medium'}
              color={'myGray.700'}
              rounded={'sm'}
              border={'1px solid'}
              borderColor={'myGray.200'}
              whiteSpace={'nowrap'}
              flexShrink={0}
              cursor={'pointer'}
              bg={selectedTagIds.length === 0 ? 'myGray.100' : 'transparent'}
              onClick={() => setSelectedTagIds([])}
              _hover={{
                bg: 'myGray.50'
              }}
            >
              {t('common:All')}
            </Box>
            <Box mx={2} h={'20px'} w={'1px'} bg={'myGray.200'} />
            <Flex
              gap={2}
              flex={1}
              overflowX="auto"
              overflowY="hidden"
              flexWrap="nowrap"
              css={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                '&::-webkit-scrollbar': { display: 'none' }
              }}
            >
              {tags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.tagId);
                return (
                  <Box
                    key={tag.tagId}
                    px={3}
                    py={1.5}
                    fontSize={'12px'}
                    fontWeight={'medium'}
                    color={'myGray.700'}
                    rounded={'full'}
                    border={'1px solid'}
                    borderColor={'myGray.200'}
                    whiteSpace={'nowrap'}
                    flexShrink={0}
                    cursor={'pointer'}
                    bg={isSelected ? 'myGray.100' : 'transparent'}
                    onClick={() => toggleTag(tag.tagId)}
                    _hover={{
                      bg: 'myGray.50'
                    }}
                  >
                    {parseI18nString(tag.tagName, i18n.language)}
                  </Box>
                );
              })}
            </Flex>
            <MyMenu
              trigger="hover"
              Button={
                <Flex alignItems={'center'} cursor={'pointer'} pl={1}>
                  <MyIcon name="core/chat/chevronDown" w={4} mr={1} />
                  <Box fontSize={'12px'}>
                    {installedFilter ? t('app:toolkit_installed') : t('common:All')}
                  </Box>
                </Flex>
              }
              menuList={[
                {
                  children: [
                    {
                      label: t('common:All'),
                      onClick: () => setInstalledFilter(false),
                      isActive: !installedFilter
                    },
                    {
                      label: t('app:toolkit_installed'),
                      onClick: () => setInstalledFilter(true),
                      isActive: installedFilter
                    }
                  ]
                }
              ]}
            ></MyMenu>
          </Flex>
        </Box>

        <Box flex={1} overflowY={'auto'} px={8}>
          {filteredTools.length > 0 ? (
            <Grid
              py={[0, 4]}
              gridTemplateColumns={['1fr', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']}
              gridGap={5}
              alignItems={'stretch'}
            >
              {filteredTools.map((tool) => {
                return (
                  <ToolCard
                    key={tool.id}
                    item={tool}
                    isInstalled={getPluginInstallStatus(tool.id)}
                    onToggleInstall={(installed) => toggleInstall({ pluginId: tool.id, installed })}
                    systemTitle={feConfigs.systemTitle}
                  />
                );
              })}
            </Grid>
          ) : (
            <EmptyTip />
          )}
        </Box>
      </MyBox>
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
