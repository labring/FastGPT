import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Grid, Input, InputGroup, VStack } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useState, useMemo, useRef, useEffect } from 'react';
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

const ToolkitMarketplace = () => {
  const { t, i18n } = useTranslation();
  const [searchText, setSearchText] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedTool, setSelectedTool] = useState<ToolCardItemType | null>(null);
  const [operatingToolId] = useState<string | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [showCompactSearch, setShowCompactSearch] = useState(false);
  const heroSectionRef = useRef<HTMLDivElement>(null);

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
  console.log('tools', tools);

  const { data: toolTags } = useRequest2(getToolTags, {
    manual: false
  });

  const displayTools: ToolCardItemType[] = useMemo(() => {
    if (!tools || !Array.isArray(tools) || !toolTags) return [];

    return tools.map((tool: ToolListItem) => {
      return {
        id: tool.toolId,
        name: parseI18nString(tool.name || '', i18n.language),
        description: parseI18nString(tool.description || '', i18n.language),
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

        if (entry.isIntersecting && isSearchExpanded && !searchText) {
          setIsSearchExpanded(false);
        }
      },
      {
        threshold: 0,
        rootMargin: '-120px 0px 0px 0px'
      }
    );

    observer.observe(heroSection);

    return () => {
      observer.disconnect();
    };
  }, [isSearchExpanded, searchText]);

  return (
    <Box h="100vh" py={6} pr={6}>
      <MyBox
        bg={'white'}
        h="calc(100vh - 48px)"
        rounded={'8px'}
        position={'relative'}
        display={'flex'}
        flexDirection={'column'}
        isLoading={loadingTools}
      >
        {/* 固定在顶部的工具栏区域 */}
        <Box px={8} flexShrink={0} position={'relative'}>
          <Flex gap={3} position={'absolute'} right={4} top={4}>
            <Button>{t('app:toolkit_contribute_resource')}</Button>
            <Button variant={'whiteBase'}>{t('app:toolkit_marketplace_faq')}</Button>
            <Button variant={'whiteBase'}>{t('app:toolkit_marketplace_submit_request')}</Button>
          </Flex>

          {/* 使用固定高度容器避免布局抖动 */}
          <Box
            h={showCompactSearch ? '120px' : '0'}
            transition={'height 0.15s ease-out'}
            overflow={'hidden'}
          >
            <Box
              opacity={showCompactSearch ? 1 : 0}
              transition={'opacity 0.15s ease-out'}
              pointerEvents={showCompactSearch ? 'auto' : 'none'}
            >
              <Flex pl={4} pt={8} alignItems={'center'}>
                <Flex
                  alignItems={'center'}
                  transition={'all 0.3s'}
                  w={isSearchExpanded ? '320px' : 'auto'}
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
                    >
                      <MyIcon name={'common/searchLight'} w={5} color={'primary.600'} mr={2} />
                      <Box fontSize={'16px'} fontWeight={'medium'} color={'myGray.500'}>
                        {t('common:Search')}
                      </Box>
                    </Flex>
                  )}
                </Flex>
              </Flex>

              <Flex mt={2} mb={4} alignItems={'center'}>
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
          {/* 英雄区域 - 只在初始状态显示 */}
          <VStack ref={heroSectionRef} w={'full'} gap={6} px={8} pt={4} pb={8} mt={8}>
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
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
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
                      onToggleInstall={() => window.open(tool.downloadUrl)}
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
