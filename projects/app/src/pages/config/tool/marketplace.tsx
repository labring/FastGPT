'use client';

import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Grid, Input, InputGroup, VStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useDebounce, useMount, useSet } from 'ahooks';
import ToolCard, { type ToolCardItemType } from '@fastgpt/web/components/core/plugin/tool/ToolCard';
import ToolTagFilterBox from '@fastgpt/web/components/core/plugin/tool/TagFilterBox';
import ToolDetailDrawer from '@fastgpt/web/components/core/plugin/tool/ToolDetailDrawer';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { intallPluginWithUrl } from '@/web/core/plugin/admin/api';
import { deletePkgPlugin } from '@/web/core/plugin/admin/api';
import {
  getMarketPlaceToolTags,
  getMarketplaceDownloadURL,
  getMarketplaceToolDetail,
  getMarketplaceTools,
  getSystemInstalledPlugins
} from '@/web/core/plugin/marketplace/api';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getDocPath } from '@/web/common/system/doc';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';

// Custom hook for managing URL search params
const useSearchParams = () => {
  const router = useRouter();
  const { search, tags } = router.query;

  const searchText = typeof search === 'string' ? search : '';
  const tagIds = useMemoEnhance(() => {
    return typeof tags === 'string' ? tags.split(',').filter(Boolean) : [];
  }, [tags]);

  const updateParams = useCallback(
    ({ newSearch, newTags }: { newSearch?: string; newTags?: string[] }) => {
      router.replace(
        {
          pathname: router.pathname,
          query: {
            search: newSearch !== undefined ? newSearch : router.query.search,
            tags: newTags !== undefined ? newTags.join(',') : router.query.tags
          }
        },
        undefined,
        { shallow: true }
      );
    },
    [router]
  );

  return { searchText, tagIds, updateParams };
};

const ToolkitMarketplace = ({ marketplaceUrl }: { marketplaceUrl: string }) => {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { copyData } = useCopyData();
  const { feConfigs } = useSystemStore();

  // Use custom hook for URL params management
  const { searchText, tagIds, updateParams } = useSearchParams();

  const [selectedTool, setSelectedTool] = useState<ToolCardItemType | null>(null);
  const [installingOrDeletingToolIds, installingOrDeletingToolIdsDispatch] = useSet<string>();
  const [updatingToolIds, updatingToolIdsDispatch] = useSet<string>();
  const operatingPromisesRef = useRef<Map<string, Promise<void>>>(new Map());

  // Type filter
  const [installedFilter, setInstalledFilter] = useState<boolean>(false);

  // Input value for controlled component and debounce
  const [inputValue, setInputValue] = useState(searchText);
  const debouncedSearchText = useDebounce(inputValue, { wait: 500 });

  // Initialize inputValue from URL
  useMount(() => {
    setInputValue(searchText);
  });

  // Update URL when debounced search text changes (triggers API call)
  useEffect(() => {
    if (router.isReady) {
      updateParams({ newSearch: debouncedSearchText });
    }
  }, [debouncedSearchText, router.isReady]);

  // Handle tag selection - update URL immediately
  const handleTagSelect = useCallback(
    (newTags: string[]) => {
      updateParams({ newTags });
    },
    [updateParams]
  );

  // Control search box expansion based on focus and input value
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  useEffect(() => {
    if (isFocused) {
      setIsSearchExpanded(true);
    } else if (!inputValue) {
      setIsSearchExpanded(false);
    }
  }, [isFocused, inputValue]);

  const {
    data: tools,
    isLoading: loadingTools,
    error: toolsError,
    ScrollData
  } = usePagination(
    ({ pageNum, pageSize }) =>
      getMarketplaceTools({
        pageNum,
        pageSize,
        searchKey: searchText || undefined,
        tags: tagIds.length > 0 ? tagIds : undefined
      }),
    {
      type: 'scroll',
      defaultPageSize: 20,
      refreshDeps: [searchText, tagIds]
    }
  );

  const { data: systemInstalledPlugins, runAsync: refreshInstalledPlugins } = useRequest2(
    async () => {
      const { list } = await getSystemInstalledPlugins({ type: 'tool' });
      return {
        ids: new Set(list.map((item) => item.id)),
        map: new Map(list.map((item) => [item.id, item]))
      };
    },
    {
      manual: false
    }
  );

  const { data: allTags = [] } = useRequest2(getMarketPlaceToolTags, {
    manual: false
  });

  // Controler
  const { runAsync: handleInstallTool } = useRequest2(
    async (tool: ToolCardItemType) => {
      const existingPromise = operatingPromisesRef.current.get(tool.id);
      if (existingPromise) {
        await existingPromise;
        return;
      }

      installingOrDeletingToolIdsDispatch.add(tool.id);
      const downloadUrl = await getMarketplaceDownloadURL(tool.id);
      if (!downloadUrl) {
        installingOrDeletingToolIdsDispatch.remove(tool.id);
        return;
      }

      const operationPromise = (async () => {
        try {
          await intallPluginWithUrl({
            downloadUrls: [downloadUrl]
          });

          if (selectedTool?.id === tool.id) {
            setSelectedTool((prev) => (prev ? { ...prev, status: 3 } : null));
          }
          await refreshInstalledPlugins();
        } finally {
          installingOrDeletingToolIdsDispatch.remove(tool.id);
          operatingPromisesRef.current.delete(tool.id);
        }
      })();
      operatingPromisesRef.current.set(tool.id, operationPromise);

      await operationPromise;
    },
    {
      manual: true
    }
  );

  const handleUpdateTool = useCallback(
    async (tool: ToolCardItemType) => {
      const existingPromise = operatingPromisesRef.current.get(tool.id);
      if (existingPromise) {
        await existingPromise;
        return;
      }

      const operationPromise = (async () => {
        updatingToolIdsDispatch.add(tool.id);

        try {
          // Get download URL
          const downloadUrl = await getMarketplaceDownloadURL(tool.id);
          if (!downloadUrl) return;

          // Call install interface for update
          await intallPluginWithUrl({
            downloadUrls: [downloadUrl]
          });

          // If the currently selected tool is the tool to be updated, update its status
          if (selectedTool?.id === tool.id) {
            setSelectedTool((prev) => (prev ? { ...prev, status: 3 } : null));
          }
          await refreshInstalledPlugins();
        } finally {
          updatingToolIdsDispatch.remove(tool.id);
          operatingPromisesRef.current.delete(tool.id);
        }
      })();

      operatingPromisesRef.current.set(tool.id, operationPromise);
      await operationPromise;
    },
    [updatingToolIdsDispatch, selectedTool, refreshInstalledPlugins]
  );

  const { runAsync: handleDeleteTool } = useRequest2(
    async (tool: ToolCardItemType) => {
      const existingPromise = operatingPromisesRef.current.get(tool.id);
      if (existingPromise) {
        await existingPromise;
        return;
      }

      const operationPromise = (async () => {
        installingOrDeletingToolIdsDispatch.add(tool.id);

        try {
          await deletePkgPlugin({ toolId: tool.id });

          if (selectedTool?.id === tool.id) {
            setSelectedTool((prev) => (prev ? { ...prev, status: 1 } : null));
          }
          await refreshInstalledPlugins();
        } finally {
          installingOrDeletingToolIdsDispatch.remove(tool.id);
          operatingPromisesRef.current.delete(tool.id);
        }
      })();
      operatingPromisesRef.current.set(tool.id, operationPromise);

      await operationPromise;
    },
    {
      manual: true
    }
  );

  const heroSectionRef = useRef<HTMLDivElement>(null);
  const [showCompactSearch, setShowCompactSearch] = useState(false);
  useEffect(() => {
    const heroSection = heroSectionRef.current;
    if (!heroSection) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const shouldShowCompact = !entry.isIntersecting;
        setShowCompactSearch(shouldShowCompact);
      },
      {
        threshold: 0
      }
    );

    observer.observe(heroSection);

    return () => {
      observer.disconnect();
    };
  }, []);

  const displayTools: ToolCardItemType[] = useMemo(() => {
    return (
      tools
        ?.map((tool) => {
          const isInstalled = systemInstalledPlugins?.ids.has(tool.toolId);
          const update = !isInstalled
            ? false
            : systemInstalledPlugins?.map.get(tool.toolId)?.version !== tool.version;

          return {
            id: tool.toolId,
            name: parseI18nString(tool.name, i18n.language) || '',
            description: parseI18nString(tool.description || '', i18n.language) || '',
            icon: tool.icon,
            author: tool.author || '',
            tags: tool.tags?.map((tag: string) => {
              const currentTag = allTags.find((t) => t.tagId === tag);
              return parseI18nString(currentTag?.tagName || '', i18n.language) || '';
            }),
            installed: isInstalled,
            update,
            downloadCount: tool.downloadCount
          };
        })
        ?.filter((tool) => {
          if (!installedFilter) return true; // 未开启过滤,显示所有
          return !tool.installed;
        }) || []
    );
  }, [tools, i18n.language, allTags, installedFilter, systemInstalledPlugins]);

  if (toolsError && !loadingTools) {
    return (
      <Box h={'full'} py={6} pr={6} position={'relative'}>
        <MyIconButton
          icon={'common/closeLight'}
          size={'6'}
          onClick={() => router.push('/config/tool')}
          position={'absolute'}
          zIndex={'999'}
          top={8}
          left={4}
        />
        <MyBox
          bg={'white'}
          h={'full'}
          rounded={'8px'}
          position={'relative'}
          display={'flex'}
          flexDirection={'column'}
          alignItems={'center'}
          justifyContent={'center'}
        >
          <VStack whiteSpace={'pre-wrap'} justifyContent={'center'} pb={16}>
            <MyIcon name="empty" w={16} color={'transparent'} />
            <Box mt={4} fontSize={'sm'} textAlign={'center'}>
              {t('app:plugin_offline_tips')}
            </Box>
            <Flex fontSize={'sm'} alignItems={'center'} mt={4}>
              {t('app:plugin_offline_url')}：{marketplaceUrl.replace('https://', '')}
              <Button
                variant={'whiteBase'}
                size={'xs'}
                ml={6}
                onClick={() => copyData(marketplaceUrl)}
              >
                {t('common:Copy')}
              </Button>
            </Flex>
          </VStack>
        </MyBox>
      </Box>
    );
  }

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
        <Box px={8} flexShrink={0} position={'relative'} zIndex={'999'}>
          <MyIconButton
            icon={'common/closeLight'}
            size={'6'}
            onClick={() => router.push('/config/tool')}
            position={'absolute'}
            top={4}
            zIndex={1000}
            {...(showCompactSearch ? { right: 4 } : { left: 4 })}
          />
          {!showCompactSearch && (
            <Flex gap={3} position={'absolute'} right={4} top={4}>
              {feConfigs?.docUrl && (
                <Button
                  onClick={() => {
                    const url = getDocPath('/docs/introduction/guide/plugins/dev_system_tool');
                    if (url) {
                      window.open(url, '_blank');
                    }
                  }}
                >
                  {t('app:toolkit_contribute_resource')}
                </Button>
              )}
              {feConfigs?.submitPluginRequestUrl && (
                <Button
                  variant={'whiteBase'}
                  onClick={() => {
                    window.open(feConfigs.submitPluginRequestUrl);
                  }}
                >
                  {t('app:toolkit_marketplace_submit_request')}
                </Button>
              )}
            </Flex>
          )}

          <Box
            h={showCompactSearch ? '90px' : '0'}
            overflow={'hidden'}
            position={'absolute'}
            bg={'white'}
            right={0}
            left={0}
            roundedTop={'md'}
            px={8}
          >
            <Box
              opacity={showCompactSearch ? 1 : 0}
              transition={'opacity 0.15s ease-out'}
              pointerEvents={showCompactSearch ? 'auto' : 'none'}
            >
              <Flex mt={2} pt={4} alignItems={'start'}>
                <Flex
                  alignItems={'center'}
                  transition={'all 0.3s'}
                  w={isSearchExpanded ? '320px' : 'auto'}
                  mr={4}
                  flexShrink={0}
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
                        placeholder={t('app:toolkit_marketplace_search_placeholder')}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                      />
                      {inputValue && (
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
                            setInputValue('');
                          }}
                        />
                      )}
                    </InputGroup>
                  ) : (
                    <Flex
                      alignItems={'center'}
                      justifyContent={'center'}
                      cursor={'pointer'}
                      borderRadius={'10px'}
                      _hover={{ borderColor: 'primary.600' }}
                      px={2}
                      h={'35px'}
                      border={'1px solid'}
                      borderColor={'myGray.200'}
                      onClick={() => setIsSearchExpanded(true)}
                    >
                      <MyIcon name={'common/searchLight'} w={5} color={'primary.600'} mr={2} />
                      <Box fontSize={'16px'} fontWeight={'medium'} color={'myGray.500'}>
                        {t('common:Search')}
                      </Box>
                    </Flex>
                  )}
                </Flex>
                <Box overflow={'auto'} mr={6} mb={-1}>
                  <ToolTagFilterBox
                    tags={allTags}
                    selectedTagIds={tagIds}
                    onTagSelect={handleTagSelect}
                  />
                </Box>
              </Flex>
            </Box>
          </Box>
        </Box>

        <ScrollData flex={1} pb={3}>
          <VStack ref={heroSectionRef} w={'full'} gap={8} px={8} pt={4} pb={8} mt={8}>
            <Box
              position={'relative'}
              display={'inline-flex'}
              px={4}
              py={1}
              borderRadius={'4px'}
              fontSize={'11px'}
              fontWeight={'medium'}
              lineHeight={'16px'}
              letterSpacing={'0.5px'}
              bgGradient={'linear(180deg, #F9BDFD 0%, #80B8FF 100%)'}
              _before={{
                content: '""',
                position: 'absolute',
                inset: 0,
                borderRadius: '4px',
                padding: '1px',
                background: 'linear-gradient(180deg, #F9BDFD 0%, #80B8FF 100%)',
                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude'
              }}
              sx={{
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
            >
              Assets for FastGPT
            </Box>
            <Box fontSize={'45px'} fontWeight={'semibold'} color={'black'}>
              {t('app:toolkit_marketplace_title')}
            </Box>
            <Box>
              <InputGroup position={'relative'}>
                <MyIcon
                  position={'absolute'}
                  zIndex={10}
                  left={2.5}
                  name={'common/searchLight'}
                  w={5}
                  top={'50%'}
                  transform={'translateY(-50%)'}
                  color={'myGray.600'}
                />
                <Input
                  fontSize="sm"
                  bg={'white'}
                  pl={8}
                  w={'560px'}
                  h={12}
                  borderRadius={'10px'}
                  placeholder={t('app:toolkit_marketplace_search_placeholder')}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                />
              </InputGroup>
            </Box>
          </VStack>

          <Box px={8} pb={6}>
            <Flex
              mt={2}
              mb={4}
              alignItems={'center'}
              opacity={showCompactSearch ? 0 : 1}
              transition={'opacity 0.15s ease-out'}
              pointerEvents={showCompactSearch ? 'none' : 'auto'}
              userSelect={'none'}
            >
              <Box flex={'1'} overflow={'auto'} mb={-1}>
                <ToolTagFilterBox
                  tags={allTags}
                  selectedTagIds={tagIds}
                  onTagSelect={handleTagSelect}
                />
              </Box>
              <MyMenu
                trigger="hover"
                Button={
                  <Flex alignItems={'center'} cursor={'pointer'} pl={1}>
                    <MyIcon name="core/chat/chevronDown" w={4} mr={1} />
                    <Box fontSize={'12px'}>
                      {installedFilter ? t('app:toolkit_uninstalled') : t('common:All')}
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
                        label: t('app:toolkit_uninstalled'),
                        onClick: () => setInstalledFilter(true),
                        isActive: installedFilter
                      }
                    ]
                  }
                ]}
              />
            </Flex>
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
                      mode="admin"
                      isInstallingOrDeleting={installingOrDeletingToolIds.has(tool.id)}
                      isUpdating={updatingToolIds.has(tool.id)}
                      onInstall={() => handleInstallTool(tool)}
                      onDelete={() => handleDeleteTool(tool)}
                      onUpdate={() => handleUpdateTool(tool)}
                      onClickCard={() => setSelectedTool(tool)}
                    />
                  );
                })}
              </Grid>
            ) : (
              <EmptyTip />
            )}
          </Box>
        </ScrollData>
      </MyBox>

      {!!selectedTool && (
        <ToolDetailDrawer
          onClose={() => setSelectedTool(null)}
          selectedTool={selectedTool}
          showPoint={false}
          onToggleInstall={() => {
            if (selectedTool.status === 3) {
              handleDeleteTool(selectedTool);
            } else {
              handleInstallTool(selectedTool);
            }
          }}
          onUpdate={() => handleUpdateTool(selectedTool)}
          isUpdating={updatingToolIds.has(selectedTool.id)}
          isLoading={installingOrDeletingToolIds.has(selectedTool.id)}
          mode="admin"
          //@ts-ignore
          onFetchDetail={async (toolId: string) => await getMarketplaceToolDetail({ toolId })}
        />
      )}
    </Box>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app'])),
      marketplaceUrl: process.env.MARKETPLACE_URL || 'https://marketplace.fastgpt.cn'
    }
  };
}

export default ToolkitMarketplace;
