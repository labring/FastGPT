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
import { useDebounce } from 'ahooks';
import type { ToolCardItemType } from '@fastgpt/web/components/core/plugins/ToolCard';
import ToolCard from '@fastgpt/web/components/core/plugins/ToolCard';
import PluginTagFilter from '@fastgpt/web/components/core/plugins/PluginTagFilter';
import ToolDetailDrawer from '@fastgpt/web/components/core/plugins/ToolDetailDrawer';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  getMarketplaceTools,
  getToolTags,
  getMarketplaceToolDetail,
  installMarketplaceTool,
  getSystemPlugins,
  deletePlugin
} from '@/web/core/app/api/plugin';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { PluginSourceEnum } from '@fastgpt/global/core/app/plugin/constants';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const ToolkitMarketplace = () => {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { search, tags } = router.query;
  const { copyData } = useCopyData();
  const { feConfigs } = useSystemStore();
  const marketplaceUrl = feConfigs?.marketPlaceUrl || 'https://marketplace.fastgpt.cn';

  const [inputValue, setInputValue] = useState('');
  const [searchText, setSearchText] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedTool, setSelectedTool] = useState<ToolCardItemType | null>(null);
  const [operatingToolId, setOperatingToolId] = useState<string | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [showCompactSearch, setShowCompactSearch] = useState(false);
  const [installedFilter, setInstalledFilter] = useState<boolean>(false);
  const heroSectionRef = useRef<HTMLDivElement>(null);

  // 使用 debounce 进行实时搜索
  const debouncedSearchText = useDebounce(inputValue, { wait: 500 });

  // 从 URL 初始化状态
  useEffect(() => {
    if (search && typeof search === 'string') {
      setInputValue(search);
      setSearchText(search);
      setIsSearchExpanded(true);
    }
    if (tags) {
      const tagArray = typeof tags === 'string' ? tags.split(',').filter(Boolean) : [];
      setSelectedTagIds(tagArray);
    }
  }, [search, tags]);

  // debounce 后更新 searchText 进行实时搜索
  useEffect(() => {
    setSearchText(debouncedSearchText);
    setIsSearchExpanded(false);
  }, [debouncedSearchText]);

  // 更新 URL 的函数
  const updateUrlParams = useCallback(
    (newSearch: string, newTags: string[]) => {
      const params = new URLSearchParams();
      if (newSearch) {
        params.set('search', newSearch);
      }
      if (newTags.length > 0) {
        params.set('tags', newTags.join(','));
      }
      const queryString = params.toString();
      const newUrl = queryString ? `${router.pathname}?${queryString}` : router.pathname;
      router.replace(newUrl, undefined, { shallow: true });
    },
    [router]
  );

  // 处理搜索框失焦,更新 URL
  const handleSearchBlur = useCallback(() => {
    if (router.isReady) {
      updateUrlParams(searchText, selectedTagIds);
    }
  }, [router.isReady, searchText, selectedTagIds, updateUrlParams]);

  // 监听 selectedTagIds 变化,更新 URL
  useEffect(() => {
    if (router.isReady) {
      updateUrlParams(searchText, selectedTagIds);
    }
  }, [selectedTagIds]);

  const {
    data: tools,
    isLoading: loadingTools,
    error: toolsError,
    ScrollData,
    getData: refetchTools
  } = usePagination(
    ({ pageNum, pageSize }) =>
      getMarketplaceTools({
        pageNum,
        pageSize,
        searchKey: searchText || undefined,
        tags: selectedTagIds.length > 0 ? selectedTagIds : undefined
      }),
    {
      type: 'scroll',
      defaultPageSize: 20,
      refreshDeps: [searchText, selectedTagIds]
    }
  );
  const {
    data: currentTools = [],
    runAsync: refreshCurrentTools,
    loading: loadingCurrentTools
  } = useRequest2(getSystemPlugins, {
    manual: false
  });
  const { data: allTags = [] } = useRequest2(() => getToolTags(), {
    manual: false
  });
  const { runAsync: handleInstallTool, loading: installToolLoading } = useRequest2(
    async (tool: ToolCardItemType) => {
      if (!tool.downloadUrl) return;
      setOperatingToolId(tool.id);
      await installMarketplaceTool({
        downloadUrls: [tool.downloadUrl]
      });
      await refetchTools();
      await refreshCurrentTools({});
    },
    {
      manual: true,
      onSuccess: async () => {
        if (selectedTool) {
          setSelectedTool((prev) => (prev ? { ...prev, status: 3 } : null));
        }
      },
      onFinally: () => {
        setOperatingToolId(null);
      }
    }
  );
  const { runAsync: handleDeleteTool, loading: deleteToolLoading } = useRequest2(
    async (tool: ToolCardItemType) => {
      setOperatingToolId(tool.id);
      await deletePlugin({ toolId: tool.id });
      await refetchTools();
      await refreshCurrentTools({});
    },
    {
      manual: true,
      onSuccess: async () => {
        if (selectedTool) {
          setSelectedTool((prev) => (prev ? { ...prev, status: 1 } : null));
        }
      },
      onFinally: () => {
        setOperatingToolId(null);
      }
    }
  );

  const displayTools: ToolCardItemType[] = useMemo(() => {
    return (
      tools
        ?.map((tool) => {
          const isInstalled = currentTools.some(
            (item) => item.id === `${PluginSourceEnum.systemTool}-${tool.toolId}`
          );
          return {
            id: tool.toolId,
            name: parseI18nString(tool.name || '', i18n.language) || '',
            description: parseI18nString(tool.description || '', i18n.language) || '',
            icon: tool.icon,
            author: tool.author || '',
            tags: tool.tags?.map((tag: string) => {
              const currentTag = allTags.find((t) => t.tagId === tag);
              return parseI18nString(currentTag?.tagName || '', i18n.language) || '';
            }),
            downloadUrl: tool.downloadUrl,
            status: isInstalled ? 3 : 1 // 1: normal, 3: installed
          };
        })
        .filter((tool) => {
          if (!installedFilter) return true; // 未开启过滤,显示所有
          return tool.status !== 3; // 仅显示未安装的
        }) || []
    );
  }, [tools, allTags, currentTools, i18n.language, installedFilter]);

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

  if (toolsError && !loadingTools) {
    return (
      <Box h={'full'} py={6} pr={6} position={'relative'}>
        <MyIconButton
          icon={'common/closeLight'}
          size={'6'}
          onClick={() => router.push('/config/tools')}
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
        <Box px={8} flexShrink={0} position={'relative'}>
          <MyIconButton
            icon={'common/closeLight'}
            size={'6'}
            onClick={() => router.push('/config/tools')}
            position={'absolute'}
            top={4}
            zIndex={'999'}
            {...(showCompactSearch ? { right: 4 } : { left: 4 })}
          />
          {!showCompactSearch && (
            <Flex gap={3} position={'absolute'} right={4} top={4}>
              <Button
                onClick={() => {
                  if (feConfigs?.systemPluginCourseUrl) {
                    window.open(feConfigs.systemPluginCourseUrl);
                  }
                }}
              >
                {t('app:toolkit_contribute_resource')}
              </Button>
              <Button
                variant={'whiteBase'}
                onClick={() => {
                  if (feConfigs?.submitPluginRequestUrl) {
                    window.open(feConfigs.submitPluginRequestUrl);
                  }
                }}
              >
                {t('app:toolkit_marketplace_submit_request')}
              </Button>
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
              <Flex mt={2} pt={6} alignItems={'center'}>
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
                        placeholder={t('app:toolkit_marketplace_search_placeholder')}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        autoFocus
                        onBlur={() => {
                          handleSearchBlur();
                          if (!inputValue) {
                            setIsSearchExpanded(false);
                          }
                        }}
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
                      borderRadius={'10px'}
                      _hover={{ borderColor: 'primary.600' }}
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
                <PluginTagFilter
                  tags={allTags}
                  selectedTagIds={selectedTagIds}
                  onTagSelect={setSelectedTagIds}
                />
              </Flex>
            </Box>
          </Box>
        </Box>

        <ScrollData flex={1}>
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
                  onBlur={handleSearchBlur}
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
            >
              <PluginTagFilter
                tags={allTags}
                selectedTagIds={selectedTagIds}
                onTagSelect={setSelectedTagIds}
              />
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
                      isLoading={operatingToolId === tool.id}
                      onToggleInstall={() => {
                        if (tool.status === 3) {
                          handleDeleteTool(tool);
                        } else {
                          handleInstallTool(tool);
                        }
                      }}
                      onClick={() => setSelectedTool(tool)}
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
          onToggleInstall={() => {
            if (selectedTool.status === 3) {
              handleDeleteTool(selectedTool);
            } else {
              handleInstallTool(selectedTool);
            }
          }}
          isLoading={!!operatingToolId}
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
      ...(await serviceSideProps(content, ['app']))
    }
  };
}

export default ToolkitMarketplace;
