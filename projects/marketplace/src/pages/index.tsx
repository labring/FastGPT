import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Grid, Input, InputGroup, Text, VStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import ToolCard, { type ToolCardItemType } from '@fastgpt/web/components/core/plugin/tool/ToolCard';
import ToolTagFilterBox, {
  type MarketplaceSourceFilterValue
} from '@fastgpt/web/components/core/plugin/tool/TagFilterBox';
import ToolDetailDrawer from '@fastgpt/web/components/core/plugin/tool/ToolDetailDrawer';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { useVirtualGridList } from '@fastgpt/web/hooks/useVirtualGridList';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import {
  MarketplaceCommunitySource,
  MarketplaceOfficialSource
} from '@fastgpt/global/openapi/core/plugin/marketplace/api';
import {
  getDownloadURL,
  getMarketplaceToolDetail,
  getMarketplaceToolVersions,
  getMarketplaceTools,
  getToolTags
} from '@/web/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import I18nLngSelector from '@/web/common/Select/I18nLngSelector';
import Head from 'next/head';
import {
  buildMarketplacePageUrl,
  getMarketplaceDetailQueryFromSearch,
  getSingleQueryValue,
  type MarketplaceDetailQuery,
  type MarketplaceTab
} from '@/web/query';

const getToolQuery = (tool: ToolCardItemType | null): MarketplaceDetailQuery | null =>
  tool
    ? {
        pluginId: tool.id,
        version: tool.version
      }
    : null;

const createQuerySelectedTool = ({
  pluginId,
  version,
  type
}: Required<Pick<MarketplaceDetailQuery, 'pluginId'>> &
  Pick<MarketplaceDetailQuery, 'version'> & {
    type?: MarketplaceTab;
  }): ToolCardItemType => ({
  id: pluginId,
  name: pluginId,
  description: '',
  version,
  type
});

const getTabFilterValue = (
  typeValue: string | string[] | undefined,
  tabValue: string | string[] | undefined
): MarketplaceTab => {
  const type = getSingleQueryValue(typeValue);
  const tab = getSingleQueryValue(tabValue);
  return type === 'moderation' || tab === 'moderation' ? 'moderation' : 'tool';
};

const getSourceFilterValue = (value: string | string[] | undefined) => {
  const source = getSingleQueryValue(value);
  return source === 'official' || source === 'community'
    ? (source as MarketplaceSourceFilterValue)
    : undefined;
};

const isSameBrowserUrl = (nextUrl: string) => {
  if (typeof window === 'undefined') return false;

  const targetUrl = new URL(nextUrl, window.location.origin);
  return (
    targetUrl.pathname === window.location.pathname && targetUrl.search === window.location.search
  );
};
const TOOL_GRID_TEMPLATE_COLUMNS =
  'repeat(auto-fill, minmax(min(max(300px, calc((100% - 6.25rem) / 6)), 100%), 1fr))';

const ToolkitMarketplace = () => {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { search, tags, pluginId, version, source, type, tab } = router.query;
  const queryPluginId = getSingleQueryValue(pluginId);
  const queryVersion = getSingleQueryValue(version);
  const querySource = getSourceFilterValue(source);
  const queryTab = getTabFilterValue(type, tab);
  const [activeTab, setActiveTab] = useState<MarketplaceTab>(queryTab);
  const [inputValue, setInputValue] = useState('');
  const [searchText, setSearchText] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<MarketplaceSourceFilterValue | undefined>(
    querySource
  );
  const [selectedTool, setSelectedTool] = useState<ToolCardItemType | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [showCompactSearch, setShowCompactSearch] = useState(false);
  const heroSectionRef = useRef<HTMLDivElement>(null);
  const detailQueryRef = useRef<MarketplaceDetailQuery | null>(
    queryPluginId
      ? {
          pluginId: queryPluginId,
          version: queryVersion
        }
      : null
  );

  // 从 URL 初始化状态
  useEffect(() => {
    try {
      setActiveTab(queryTab);
      if (search && typeof search === 'string') {
        setInputValue(search);
        setSearchText(search);
        setIsSearchExpanded(true);
      }
      if (tags) {
        const tagArray =
          typeof tags === 'string'
            ? tags
                .split(',')
                .filter(Boolean)
                .map((tag) => tag.trim())
            : [];
        setSelectedTagIds(tagArray);
      } else {
        setSelectedTagIds([]);
      }
      setSelectedSource(querySource);
    } catch (error) {
      console.warn('Failed to initialize URL params:', error);
    }
  }, [querySource, queryTab, search, tags]);

  // 使用自定义 debounce 进行实时搜索
  const [debouncedSearchText, setDebouncedSearchText] = useState(inputValue);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchText(inputValue);
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [inputValue]);

  // debounce 后更新 searchText 进行实时搜索
  useEffect(() => {
    setSearchText(debouncedSearchText);
  }, [debouncedSearchText]);

  // 更新 URL 的函数
  const updateUrlParams = useCallback(
    ({
      search: newSearch = searchText,
      tags: newTags = selectedTagIds,
      detailQuery = detailQueryRef.current,
      source: newSource = selectedSource,
      tab: newTab = activeTab
    }: {
      search?: string;
      tags?: string[];
      detailQuery?: MarketplaceDetailQuery | null;
      source?: MarketplaceSourceFilterValue;
      tab?: MarketplaceTab;
    } = {}) => {
      try {
        const newUrl = buildMarketplacePageUrl({
          pathname: router.pathname,
          search: newSearch,
          tags: newTab === 'tool' ? newTags : [],
          source: newSource,
          type: newTab,
          pluginId: detailQuery?.pluginId,
          version: detailQuery?.version
        });

        // 使用原生 History API 替代 Next.js router（更安全）
        if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
          // 检查安全上下文
          if (
            window.isSecureContext ||
            (window.location.protocol === 'http:' && window.location.hostname === 'localhost')
          ) {
            if (isSameBrowserUrl(newUrl)) return;
            try {
              window.history.replaceState({}, '', newUrl);
            } catch (historyError) {
              console.warn('History replaceState failed:', historyError);
            }
          } else {
            console.warn('Skipping URL update in insecure context');
          }
        }
      } catch (error) {
        console.warn('Failed to update URL params:', error);
        // 如果 URL 操作失败，跳过更新
      }
    },
    [activeTab, router.pathname, searchText, selectedSource, selectedTagIds]
  );

  const getCurrentDetailQuery = useCallback(() => {
    if (typeof window === 'undefined') {
      return queryPluginId
        ? {
            pluginId: queryPluginId,
            version: queryVersion
          }
        : {};
    }

    return getMarketplaceDetailQueryFromSearch(window.location.search);
  }, [queryPluginId, queryVersion]);

  // 处理搜索框失焦,更新 URL
  const handleSearchBlur = useCallback(() => {
    updateUrlParams({ search: searchText, tags: selectedTagIds });
  }, [searchText, selectedTagIds, updateUrlParams]);

  const handleSourceSelect = useCallback(
    (nextSource?: MarketplaceSourceFilterValue) => {
      setSelectedSource(nextSource);
      updateUrlParams({
        search: searchText,
        tags: selectedTagIds,
        detailQuery: detailQueryRef.current,
        source: nextSource,
        tab: activeTab
      });
    },
    [activeTab, searchText, selectedTagIds, updateUrlParams]
  );

  const handleTabChange = useCallback(
    (nextTab: MarketplaceTab) => {
      if (nextTab === activeTab) return;
      detailQueryRef.current = null;
      setSelectedTool(null);
      setActiveTab(nextTab);
      if (nextTab === 'moderation') {
        setSelectedTagIds([]);
      }
      updateUrlParams({
        search: searchText,
        tags: nextTab === 'tool' ? selectedTagIds : [],
        detailQuery: null,
        source: selectedSource,
        tab: nextTab
      });
    },
    [activeTab, searchText, selectedSource, selectedTagIds, updateUrlParams]
  );

  const {
    data: tools,
    isLoading: loadingTools,
    ScrollData
  } = usePagination(
    ({ pageNum = 1, pageSize = 20 }) =>
      getMarketplaceTools({
        pageNum,
        pageSize,
        type: activeTab,
        searchKey: searchText || undefined,
        tags: activeTab === 'tool' && selectedTagIds.length > 0 ? selectedTagIds : undefined,
        source: selectedSource
      }),
    {
      type: 'scroll',
      pageSizeCacheKey: `marketplace-tools-${activeTab}`,
      throttleWait: 500,
      refreshDeps: [activeTab, searchText, selectedTagIds, selectedSource]
    }
  );

  const { data: toolTags = [] } = useRequest(getToolTags, {
    manual: false
  });

  const displayTools: ToolCardItemType[] = useMemo(() => {
    if (!tools || !Array.isArray(tools) || !toolTags) return [];

    return tools.map((tool) => {
      return {
        id: tool.toolId || tool.pluginId,
        name: parseI18nString(tool.name || '', i18n.language) || '',
        description: parseI18nString(tool.description || '', i18n.language) || '',
        icon: tool.icon,
        author: tool.author || '',
        tags: tool.tags?.map((tag) => {
          const currentTag = toolTags.find((item) => item.tagId === tag);
          return parseI18nString(currentTag?.tagName || '', i18n.language) || '';
        }),
        version: tool.version,
        source: tool.source,
        downloadCount: tool.downloadCount,
        type: tool.type ?? activeTab
      };
    });
  }, [activeTab, tools, i18n.language, toolTags]);

  const selectedTagKey = selectedTagIds.join(',');
  const selectedSourceKey = selectedSource ?? 'all';
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { gridRef, renderVirtualGridItems } = useVirtualGridList({
    list: displayTools,
    listKey: `${activeTab}-${searchText}-${selectedTagKey}-${selectedSourceKey}-${i18n.language}`,
    scrollContainerRef,
    estimatedRowHeight: 178,
    estimatedRowGap: 20
  });

  useEffect(() => {
    const currentDetailQuery = getCurrentDetailQuery();
    if (!currentDetailQuery.pluginId) return;

    const queryDetail = {
      pluginId: currentDetailQuery.pluginId,
      version: currentDetailQuery.version,
      type: activeTab
    };
    const matchedTool = displayTools.find((tool) => tool.id === currentDetailQuery.pluginId);
    const queryTool = matchedTool
      ? {
          ...matchedTool,
          version: currentDetailQuery.version || matchedTool.version
        }
      : createQuerySelectedTool(queryDetail);

    detailQueryRef.current = {
      pluginId: queryTool.id,
      version: queryTool.version
    };

    setSelectedTool((prev) => {
      if (
        prev?.id === queryTool.id &&
        prev.version === queryTool.version &&
        prev.name === queryTool.name &&
        prev.icon === queryTool.icon &&
        prev.type === queryTool.type
      ) {
        return prev;
      }

      return queryTool;
    });
  }, [activeTab, displayTools, getCurrentDetailQuery]);

  // 监听 selectedTagIds 变化,更新 URL
  useEffect(() => {
    updateUrlParams({ search: searchText, tags: selectedTagIds });
  }, [activeTab, searchText, selectedTagIds, selectedSource, updateUrlParams]);

  const onDownload = useCallback(
    async ({
      toolId,
      version,
      type = activeTab
    }: {
      toolId: string;
      version?: string;
      type?: MarketplaceTab;
    }) => {
      try {
        const url = await getDownloadURL({ toolId, version, type });
        if (url) {
          // Create download link
          const link = document.createElement('a');
          link.href = url;
          link.download = '';
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } catch (error) {
        console.error('Download failed:', error);
        // Can add error prompt here
      }
    },
    [activeTab]
  );

  const handleSelectTool = useCallback(
    (tool: ToolCardItemType) => {
      const detailQuery = getToolQuery(tool);

      detailQueryRef.current = detailQuery;
      setSelectedTool(tool);
      updateUrlParams({ search: searchText, tags: selectedTagIds, detailQuery });
    },
    [searchText, selectedTagIds, updateUrlParams]
  );

  const handleCloseToolDetail = useCallback(() => {
    detailQueryRef.current = null;
    setSelectedTool(null);
    updateUrlParams({ search: searchText, tags: selectedTagIds, detailQuery: null });
  }, [searchText, selectedTagIds, updateUrlParams]);

  const handleVersionChange = useCallback(
    (nextVersion: string) => {
      if (!selectedTool) return;

      const detailQuery = {
        pluginId: selectedTool.id,
        version: nextVersion
      };

      detailQueryRef.current = detailQuery;
      setSelectedTool((prev) => (prev ? { ...prev, version: nextVersion } : prev));
      updateUrlParams({ search: searchText, tags: selectedTagIds, detailQuery });
    },
    [searchText, selectedTagIds, selectedTool, updateUrlParams]
  );

  const renderToolCard = useCallback(
    (tool: ToolCardItemType) => (
      <Box key={tool.id} data-virtual-item="" h={'full'}>
        <ToolCard
          item={tool}
          mode="marketplace"
          variant="marketplace"
          onInstall={() => onDownload({ toolId: tool.id, version: tool.version, type: tool.type })}
          onClickCard={() => handleSelectTool(tool)}
        />
      </Box>
    ),
    [handleSelectTool, onDownload]
  );

  // 使用 IntersectionObserver 监听英雄区域是否在视窗中
  useEffect(() => {
    const heroSection = heroSectionRef.current;
    if (!heroSection) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const shouldShowCompact = !entry.isIntersecting;
        setShowCompactSearch(shouldShowCompact);

        if (entry.isIntersecting && isSearchExpanded && !inputValue) {
          setIsSearchExpanded(false);
        }
      },
      {
        threshold: 0
      }
    );

    observer.observe(heroSection);

    return () => {
      observer.disconnect();
    };
  }, [isSearchExpanded, inputValue]);

  return (
    <>
      <Head>
        <title>{t('marketplace:fastgpt_marketplace')}</title>
        <meta name="description" content={t('marketplace:toolkit_marketplace_title')} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <MyBox
        bg={'white'}
        h="100vh"
        position={'relative'}
        display={'flex'}
        flexDirection={'column'}
        isLoading={loadingTools && displayTools.length === 0}
      >
        <Box px={8} flexShrink={0} position={'relative'}>
          <Flex gap={3} position={'absolute'} right={8} top={6} alignItems={'center'}>
            <I18nLngSelector />
            <Button
              onClick={() => {
                window.open('https://doc.fastgpt.cn/zh-CN/plugin/system-tool-development', '_blank');
              }}
            >
              {t('marketplace:plugin_development')}
            </Button>
            <Button
              variant={'whiteBase'}
              onClick={() => {
                window.open('https://github.com/labring/fastgpt-plugin/issues', '_blank');
              }}
            >
              {t('marketplace:toolkit_marketplace_submit_request')}
            </Button>
          </Flex>

          <Box
            zIndex={100}
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
              transition={'opacity 0.1s ease-out'}
              pointerEvents={showCompactSearch ? 'auto' : 'none'}
            >
              <Flex mt={2} pt={4} alignItems={'center'}>
                <Flex
                  p={'2px'}
                  bg={'myGray.100'}
                  borderRadius={'6px'}
                  border={'1px solid'}
                  borderColor={'myGray.200'}
                  alignItems={'center'}
                  mr={3}
                  flexShrink={0}
                  userSelect={'none'}
                >
                  <Button
                    size={'xs'}
                    h={'26px'}
                    px={3}
                    borderRadius={'4px'}
                    fontSize={'12px'}
                    fontWeight={activeTab === 'tool' ? 'semibold' : 'normal'}
                    bg={activeTab === 'tool' ? 'white' : 'transparent'}
                    color={activeTab === 'tool' ? 'myGray.900' : 'myGray.600'}
                    boxShadow={activeTab === 'tool' ? 'sm' : 'none'}
                    _hover={{ color: 'myGray.900' }}
                    onClick={() => handleTabChange('tool')}
                  >
                    {t('marketplace:tab_system_tool')}
                  </Button>
                  <Button
                    size={'xs'}
                    h={'26px'}
                    px={3}
                    borderRadius={'4px'}
                    fontSize={'12px'}
                    fontWeight={activeTab === 'moderation' ? 'semibold' : 'normal'}
                    bg={activeTab === 'moderation' ? 'white' : 'transparent'}
                    color={activeTab === 'moderation' ? 'myGray.900' : 'myGray.600'}
                    boxShadow={activeTab === 'moderation' ? 'sm' : 'none'}
                    _hover={{ color: 'myGray.900' }}
                    onClick={() => handleTabChange('moderation')}
                  >
                    {t('marketplace:tab_moderation')}
                  </Button>
                </Flex>
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
                        h={8}
                        borderRadius={'sm'}
                        placeholder={t('marketplace:toolkit_marketplace_search_placeholder')}
                        value={inputValue}
                        onChange={(e) => {
                          setInputValue(e.target.value);
                        }}
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
                      borderRadius={'sm'}
                      _hover={{ borderColor: 'primary.600' }}
                      onClick={() => setIsSearchExpanded(true)}
                      px={2}
                      h={8}
                      border={'1px solid'}
                      borderColor={'myGray.200'}
                    >
                      <MyIcon name={'common/searchLight'} w={5} color={'primary.600'} mr={2} />
                      <Box
                        fontSize={'16px'}
                        fontWeight={'medium'}
                        color={'myGray.500'}
                        whiteSpace={'nowrap'}
                      >
                        {t('common:Search')}
                      </Box>
                    </Flex>
                  )}
                </Flex>
                <Box overflow={'auto'} mr={6}>
                  {activeTab === 'tool' ? (
                    <ToolTagFilterBox
                      tags={toolTags}
                      selectedTagIds={selectedTagIds}
                      onTagSelect={setSelectedTagIds}
                      selectedSource={selectedSource}
                      onSourceSelect={handleSourceSelect}
                      variant="marketplace"
                    />
                  ) : (
                    <Flex alignItems={'center'} gap={2} fontSize={'xs'} color={'myGray.600'}>
                      <Text whiteSpace={'nowrap'} fontSize={'12px'} fontWeight={'medium'}>
                        {t('app:logs_source')}:
                      </Text>
                      <MySelect
                        w={'110px'}
                        h={'32px'}
                        fontSize={'xs'}
                        value={selectedSource ?? 'all'}
                        list={[
                          { label: t('common:All'), value: 'all' },
                          {
                            label: t('app:toolkit_official'),
                            value: MarketplaceOfficialSource
                          },
                          {
                            label: t('app:toolkit_community'),
                            value: MarketplaceCommunitySource
                          }
                        ]}
                        onChange={(val) =>
                          handleSourceSelect(
                            val === 'all' ? undefined : (val as MarketplaceSourceFilterValue)
                          )
                        }
                      />
                    </Flex>
                  )}
                </Box>
              </Flex>
            </Box>
          </Box>
        </Box>

        <ScrollData
          ScrollContainerRef={scrollContainerRef}
          flex={1}
          minHeight={0}
          height="auto"
          pb={10}
        >
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
              {t('marketplace:toolkit_marketplace_title')}
            </Box>
            <Flex
              p={'3px'}
              bg={'myGray.100'}
              borderRadius={'8px'}
              border={'1px solid'}
              borderColor={'myGray.200'}
              alignItems={'center'}
              gap={1}
              userSelect={'none'}
            >
              <Button
                size={'sm'}
                h={'28px'}
                px={4}
                borderRadius={'6px'}
                fontSize={'13px'}
                fontWeight={activeTab === 'tool' ? 'semibold' : 'normal'}
                bg={activeTab === 'tool' ? 'white' : 'transparent'}
                color={activeTab === 'tool' ? 'myGray.900' : 'myGray.600'}
                boxShadow={activeTab === 'tool' ? 'sm' : 'none'}
                _hover={{ color: 'myGray.900' }}
                onClick={() => handleTabChange('tool')}
              >
                {t('marketplace:tab_system_tool')}
              </Button>
              <Button
                size={'sm'}
                h={'28px'}
                px={4}
                borderRadius={'6px'}
                fontSize={'13px'}
                fontWeight={activeTab === 'moderation' ? 'semibold' : 'normal'}
                bg={activeTab === 'moderation' ? 'white' : 'transparent'}
                color={activeTab === 'moderation' ? 'myGray.900' : 'myGray.600'}
                boxShadow={activeTab === 'moderation' ? 'sm' : 'none'}
                _hover={{ color: 'myGray.900' }}
                onClick={() => handleTabChange('moderation')}
              >
                {t('marketplace:tab_moderation')}
              </Button>
            </Flex>
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
                  w={['calc(100vw - 64px)', '560px']}
                  maxW={'560px'}
                  h={12}
                  borderRadius={'10px'}
                  placeholder={t('marketplace:toolkit_marketplace_search_placeholder')}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                  }}
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
              pointerEvents={showCompactSearch ? 'none' : 'auto'}
            >
              <Box flex={'1'} overflow={'auto'}>
                {activeTab === 'tool' ? (
                  <ToolTagFilterBox
                    tags={toolTags}
                    selectedTagIds={selectedTagIds}
                    onTagSelect={setSelectedTagIds}
                    selectedSource={selectedSource}
                    onSourceSelect={handleSourceSelect}
                    variant="marketplace"
                  />
                ) : (
                  <Flex alignItems={'center'} gap={2} fontSize={'xs'} color={'myGray.600'}>
                    <Text whiteSpace={'nowrap'} fontSize={'12px'} fontWeight={'medium'}>
                      {t('app:logs_source')}:
                    </Text>
                    <MySelect
                      w={'110px'}
                      h={'32px'}
                      fontSize={'xs'}
                      value={selectedSource ?? 'all'}
                      list={[
                        { label: t('common:All'), value: 'all' },
                        {
                          label: t('app:toolkit_official'),
                          value: MarketplaceOfficialSource
                        },
                        {
                          label: t('app:toolkit_community'),
                          value: MarketplaceCommunitySource
                        }
                      ]}
                      onChange={(val) =>
                        handleSourceSelect(
                          val === 'all' ? undefined : (val as MarketplaceSourceFilterValue)
                        )
                      }
                    />
                  </Flex>
                )}
              </Box>
            </Flex>
            {displayTools.length > 0 ? (
              <Grid
                ref={gridRef}
                gridTemplateColumns={TOOL_GRID_TEMPLATE_COLUMNS}
                gridGap={5}
                alignItems={'stretch'}
              >
                {renderVirtualGridItems(renderToolCard)}
              </Grid>
            ) : (
              <EmptyTip />
            )}
          </Box>
        </ScrollData>
      </MyBox>

      {!!selectedTool && (
        <ToolDetailDrawer
          onClose={handleCloseToolDetail}
          showPoint={false}
          mode="marketplace"
          selectedTool={selectedTool}
          // @ts-ignore
          onFetchDetail={async (toolId: string, version?: string) =>
            await getMarketplaceToolDetail({
              toolId,
              version,
              type: selectedTool.type ?? activeTab
            })
          }
          onToggleInstall={(_, version) => {
            onDownload({
              toolId: selectedTool.id,
              version,
              type: selectedTool.type ?? activeTab
            });
          }}
          onFetchVersions={(toolId?: string) =>
            getMarketplaceToolVersions(toolId, selectedTool.type ?? activeTab)
          }
          onVersionChange={handleVersionChange}
        />
      )}
    </>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'marketplace']))
    }
  };
}

export default ToolkitMarketplace;
