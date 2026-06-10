import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Grid, Input, InputGroup, VStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import ToolCard, { type ToolCardItemType } from '@fastgpt/web/components/core/plugin/tool/ToolCard';
import ToolTagFilterBox from '@fastgpt/web/components/core/plugin/tool/TagFilterBox';
import ToolDetailDrawer from '@fastgpt/web/components/core/plugin/tool/ToolDetailDrawer';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { useVirtualGridList } from '@fastgpt/web/hooks/useVirtualGridList';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
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
  type MarketplaceDetailQuery
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
  version
}: Required<Pick<MarketplaceDetailQuery, 'pluginId'>> &
  Pick<MarketplaceDetailQuery, 'version'>): ToolCardItemType => ({
    id: pluginId,
    name: pluginId,
    description: '',
    version
  });

const ToolkitMarketplace = () => {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { search, tags, pluginId, version } = router.query;
  const queryPluginId = getSingleQueryValue(pluginId);
  const queryVersion = getSingleQueryValue(version);
  const [inputValue, setInputValue] = useState('');
  const [searchText, setSearchText] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
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
      }
    } catch (error) {
      console.warn('Failed to initialize URL params:', error);
    }
  }, [search, tags]);

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
    (newSearch: string, newTags: string[], detailQuery = detailQueryRef.current) => {
      try {
        const newUrl = buildMarketplacePageUrl({
          pathname: router.pathname,
          search: newSearch,
          tags: newTags,
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
    [router.pathname]
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
    if (router.isReady) {
      updateUrlParams(searchText, selectedTagIds);
    }
  }, [router.isReady, searchText, selectedTagIds, updateUrlParams]);

  const {
    data: tools,
    isLoading: loadingTools,
    ScrollData
  } = usePagination(
    ({ pageNum = 1, pageSize = 20 }) =>
      getMarketplaceTools({
        pageNum,
        pageSize,
        searchKey: searchText || undefined,
        tags: selectedTagIds.length > 0 ? selectedTagIds : undefined
      }),
    {
      type: 'scroll',
      throttleWait: 500,
      refreshDeps: [searchText, selectedTagIds]
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
        downloadCount: tool.downloadCount
      };
    });
  }, [tools, i18n.language, toolTags]);

  const selectedTagKey = selectedTagIds.join(',');
  const { gridRef, renderVirtualGridItems } = useVirtualGridList({
    list: displayTools,
    listKey: `${searchText}-${selectedTagKey}-${i18n.language}`,
    estimatedRowHeight: 160,
    estimatedRowGap: 20
  });

  useEffect(() => {
    const currentDetailQuery = getCurrentDetailQuery();
    if (!router.isReady || !currentDetailQuery.pluginId) return;

    const queryDetail = {
      pluginId: currentDetailQuery.pluginId,
      version: currentDetailQuery.version
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
        prev.icon === queryTool.icon
      ) {
        return prev;
      }

      return queryTool;
    });
  }, [displayTools, getCurrentDetailQuery, router.isReady]);

  // 监听 selectedTagIds 变化,更新 URL
  useEffect(() => {
    if (router.isReady) {
      updateUrlParams(searchText, selectedTagIds);
    }
  }, [router.isReady, searchText, selectedTagIds, updateUrlParams]);

  const onDownload = useCallback(async (toolId: string, version?: string) => {
    try {
      const url = await getDownloadURL(toolId, version);
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
  }, []);

  const handleSelectTool = useCallback(
    (tool: ToolCardItemType) => {
      const detailQuery = getToolQuery(tool);

      detailQueryRef.current = detailQuery;
      setSelectedTool(tool);
      updateUrlParams(searchText, selectedTagIds, detailQuery);
    },
    [searchText, selectedTagIds, updateUrlParams]
  );

  const handleCloseToolDetail = useCallback(() => {
    detailQueryRef.current = null;
    setSelectedTool(null);
    updateUrlParams(searchText, selectedTagIds, null);
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
      updateUrlParams(searchText, selectedTagIds, detailQuery);
    },
    [searchText, selectedTagIds, selectedTool, updateUrlParams]
  );

  const renderToolCard = useCallback(
    (tool: ToolCardItemType) => (
      <Box key={tool.id} data-virtual-item="">
        <ToolCard
          item={tool}
          mode="marketplace"
          onInstall={() => onDownload(tool.id)}
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
        <title>{t('app:fastgpt_marketplace')}</title>
        <meta name="description" content={t('app:toolkit_marketplace_title')} />
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
                window.open(
                  'https://doc.fastgpt.cn/plugin/system-tool-development',
                  '_blank'
                );
              }}
            >
              {t('app:toolkit_contribute_resource')}
            </Button>
            <Button
              variant={'whiteBase'}
              onClick={() => {
                window.open('https://github.com/labring/fastgpt-plugin/issues', '_blank');
              }}
            >
              {t('app:toolkit_marketplace_submit_request')}
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
                      borderRadius={'10px'}
                      _hover={{ borderColor: 'primary.600' }}
                      onClick={() => setIsSearchExpanded(true)}
                      p={2}
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
                  <ToolTagFilterBox
                    tags={toolTags}
                    selectedTagIds={selectedTagIds}
                    onTagSelect={setSelectedTagIds}
                  />
                </Box>
              </Flex>
            </Box>
          </Box>
        </Box>

        <ScrollData flex={1} minHeight={0} height="auto" pb={10}>
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
                <ToolTagFilterBox
                  tags={toolTags}
                  selectedTagIds={selectedTagIds}
                  onTagSelect={setSelectedTagIds}
                />
              </Box>
            </Flex>
            {displayTools.length > 0 ? (
              <Grid
                ref={gridRef}
                gridTemplateColumns={['1fr', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']}
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
            await getMarketplaceToolDetail({ toolId, version })
          }
          onToggleInstall={(_, version) => {
            onDownload(selectedTool.id, version);
          }}
          onFetchVersions={getMarketplaceToolVersions}
          onVersionChange={handleVersionChange}
        />
      )}
    </>
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
