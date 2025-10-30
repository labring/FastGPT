import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Grid, Input, InputGroup, VStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { ToolCardItemType } from '@fastgpt/web/components/core/plugins/ToolCard';
import ToolCard, { ToolStatusEnum } from '@fastgpt/web/components/core/plugins/ToolCard';
import PluginTagFilter from '@fastgpt/web/components/core/plugins/PluginTagFilter';
import ToolDetailDrawer from '@fastgpt/web/components/core/plugins/ToolDetailDrawer';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import type { ToolListItem } from '@fastgpt/global/core/app/plugin/type';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { getMarketplaceToolDetail, getMarketplaceTools, getToolTags } from '@/web/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import I18nLngSelector from '@/web/common/Select/I18nLngSelector';

const ToolkitMarketplace = () => {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { search, tags } = router.query;
  const [inputValue, setInputValue] = useState('');
  const [searchText, setSearchText] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedTool, setSelectedTool] = useState<ToolCardItemType | null>(null);
  const [operatingToolId] = useState<string | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [showCompactSearch, setShowCompactSearch] = useState(false);
  const heroSectionRef = useRef<HTMLDivElement>(null);

  // 从 URL 初始化状态
  useEffect(() => {
    try {
      if (search && typeof search === 'string') {
        // 清理搜索输入，防止 XSS
        const sanitizedSearch = search.replace(
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
          ''
        );
        setInputValue(sanitizedSearch);
        setSearchText(sanitizedSearch);
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
    (newSearch: string, newTags: string[]) => {
      try {
        // 使用更安全的 URL 参数构建方式
        const params: Record<string, string> = {};
        if (newSearch) {
          params.search = newSearch;
        }
        if (newTags.length > 0) {
          params.tags = newTags.join(',');
        }

        // 手动构建查询字符串，避免 URLSearchParams 的安全问题
        const queryString = Object.entries(params)
          .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
          .join('&');

        const newUrl = queryString ? `${router.pathname}?${queryString}` : router.pathname;

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

  const { data: toolTags } = useRequest2(getToolTags, {
    manual: false
  });

  const displayTools: ToolCardItemType[] = useMemo(() => {
    if (!tools || !Array.isArray(tools) || !toolTags) return [];

    return tools.map((tool: ToolListItem) => {
      return {
        id: tool.toolId,
        name: parseI18nString(tool.name || '', i18n.language) || '',
        description: parseI18nString(tool.description || '', i18n.language) || '',
        icon: tool.icon,
        author: tool.author || '',
        tags: tool.tags?.map((tag) => {
          const currentTag = toolTags.find((item) => item.tagId === tag);
          return parseI18nString(currentTag?.tagName || '', i18n.language) || '';
        }),
        status: ToolStatusEnum.Download,
        downloadUrl: tool.downloadUrl
      };
    });
  }, [tools, i18n.language, toolTags]);

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
    <Box h="100vh">
      <MyBox
        bg={'white'}
        h="calc(100vh - 48px)"
        rounded={'8px'}
        position={'relative'}
        display={'flex'}
        flexDirection={'column'}
        isLoading={loadingTools}
      >
        <Box px={8} flexShrink={0} position={'relative'}>
          <Flex gap={3} position={'absolute'} right={8} top={6} alignItems={'center'}>
            <I18nLngSelector />
            <Button
              onClick={() => {
                window.open(
                  'https://doc.fastgpt.io/docs/introduction/guide/plugins/dev_system_tool',
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
                        onChange={(e) => {
                          // 清理输入，防止恶意字符
                          const cleanValue = e.target.value
                            .replace(/[\x00-\x1F\x7F]/g, '') // 移除控制字符
                            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ''); // 移除脚本标签
                          setInputValue(cleanValue);
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
                      <Box fontSize={'16px'} fontWeight={'medium'} color={'myGray.500'}>
                        {t('common:Search')}
                      </Box>
                    </Flex>
                  )}
                </Flex>
                <PluginTagFilter
                  tags={toolTags || []}
                  selectedTagIds={selectedTagIds}
                  onTagSelect={setSelectedTagIds}
                />
              </Flex>
            </Box>
          </Box>
        </Box>

        <ScrollData flex={1} minHeight={0} height="auto">
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
                    // 清理输入，防止恶意字符
                    const cleanValue = e.target.value
                      .replace(/[\x00-\x1F\x7F]/g, '') // 移除控制字符
                      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ''); // 移除脚本标签
                    setInputValue(cleanValue);
                  }}
                  onBlur={handleSearchBlur}
                />
              </InputGroup>
            </Box>
          </VStack>

          {/* 工具卡片网格 */}
          <Box px={8} pb={6}>
            {/* 底部tag区域 - 使用固定高度容器 */}
            <Box
              h={showCompactSearch ? '0' : '56px'}
              transition={'height 0.15s ease-out'}
              overflow={'hidden'}
            >
              <Flex
                mt={2}
                mb={4}
                alignItems={'center'}
                opacity={showCompactSearch ? 0 : 1}
                transition={'opacity 0.15s ease-out'}
                pointerEvents={showCompactSearch ? 'none' : 'auto'}
              >
                <PluginTagFilter
                  tags={toolTags || []}
                  selectedTagIds={selectedTagIds}
                  onTagSelect={setSelectedTagIds}
                />
              </Flex>
            </Box>
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
                        if (tool.downloadUrl) {
                          const link = document.createElement('a');
                          link.href = tool.downloadUrl;
                          link.download = '';
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
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
          onFetchDetail={async (toolId: string) => await getMarketplaceToolDetail({ toolId })}
          onToggleInstall={() => window.open(selectedTool.downloadUrl)}
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
