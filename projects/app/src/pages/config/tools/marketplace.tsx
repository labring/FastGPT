'use client';

import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Grid, Input, InputGroup, VStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useState, useMemo, useRef, useEffect } from 'react';
import type { ToolCardItemType } from '@fastgpt/web/components/core/plugins/ToolCard';
import ToolCard from '@fastgpt/web/components/core/plugins/ToolCard';
import PluginTagFilter from '@fastgpt/web/components/core/plugins/PluginTagFilter';
import ToolDetailDrawer from '@fastgpt/web/components/core/plugins/ToolDetailDrawer';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import type { ToolListItem } from '@fastgpt/global/core/app/plugin/type';
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

const ToolkitMarketplace = () => {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedTool, setSelectedTool] = useState<ToolCardItemType | null>(null);
  const [operatingToolId, setOperatingToolId] = useState<string | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [showCompactSearch, setShowCompactSearch] = useState(false);
  const heroSectionRef = useRef<HTMLDivElement>(null);

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
      try {
        await installMarketplaceTool({
          downloadUrls: [tool.downloadUrl]
        });
      } finally {
        setOperatingToolId(null);
      }
    },
    {
      manual: true,
      onSuccess: async () => {
        await refetchTools();
        await refreshCurrentTools({});
        if (selectedTool) {
          setSelectedTool((prev) => (prev ? { ...prev, status: 3 } : null));
        }
      }
    }
  );
  const { runAsync: handleDeleteTool, loading: deleteToolLoading } = useRequest2(
    async (tool: ToolCardItemType) => {
      setOperatingToolId(tool.id);
      try {
        await deletePlugin({ toolId: tool.id });
      } finally {
        setOperatingToolId(null);
      }
    },
    {
      manual: true,
      onSuccess: async () => {
        await refetchTools();
        await refreshCurrentTools({});
        if (selectedTool) {
          setSelectedTool((prev) => (prev ? { ...prev, status: 1 } : null));
        }
      }
    }
  );

  const displayTools: ToolCardItemType[] = useMemo(() => {
    return (
      tools?.map((tool: ToolListItem) => {
        const isInstalled = currentTools.some(
          (item) => item.id === `${PluginSourceEnum.systemTool}-${tool.toolId}`
        );
        return {
          id: tool.toolId,
          name: parseI18nString(tool.name || '', i18n.language),
          description: parseI18nString(tool.description || '', i18n.language),
          icon: tool.icon,
          author: tool.author || '',
          tags: tool.tags?.map((tag) => {
            const currentTag = allTags.find((t) => t.type === tag);
            return parseI18nString(currentTag?.name || '', i18n.language) || '';
          }),
          downloadUrl: tool.downloadUrl,
          status: isInstalled ? 3 : 1 // 1: normal, 3: installed
        };
      }) || []
    );
  }, [tools, allTags, currentTools, i18n.language]);

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

  if (toolsError && !loadingTools) {
    return (
      <Box h={'full'} py={6} pr={6}>
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
          <MyIconButton
            icon={'common/closeLight'}
            size={'6'}
            onClick={() => router.push('/config/tools')}
            position={'absolute'}
            left={4}
            top={4}
          />
          <VStack spacing={4}>
            <MyIcon name={'common/error'} w={16} h={16} color={'red.500'} />

            <Box fontSize={'sm'} color={'myGray.600'}>
              {t('common:core.chat.error.data_error')}
            </Box>
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
        isLoading={loadingTools}
      >
        <Box px={8} flexShrink={0} position={'relative'}>
          <MyIconButton
            icon={'common/closeLight'}
            size={'6'}
            onClick={() => router.push('/config/tools')}
            position={'absolute'}
            left={4}
            top={4}
          />
          <Flex gap={3} position={'absolute'} right={4} top={4}>
            <Button>{t('app:toolkit_contribute_resource')}</Button>
            <Button variant={'whiteBase'}>{t('app:toolkit_marketplace_faq')}</Button>
            <Button variant={'whiteBase'}>{t('app:toolkit_marketplace_submit_request')}</Button>
          </Flex>

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
                  tags={allTags.map((tag) => ({
                    tagId: tag.type,
                    tagName: tag.name,
                    tagOrder: 0,
                    isSystem: true
                  }))}
                  selectedTagIds={selectedTagIds}
                  onTagSelect={setSelectedTagIds}
                />
              </Flex>
            </Box>
          </Box>
        </Box>

        <ScrollData flex={1}>
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
                  tags={allTags.map((tag) => ({
                    tagId: tag.type,
                    tagName: tag.name,
                    tagOrder: 0,
                    isSystem: true
                  }))}
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
          isLoading={installToolLoading || deleteToolLoading || loadingTools || loadingCurrentTools}
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
