'use client';

import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Grid, Input, InputGroup, VStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useState, useMemo } from 'react';
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

  const {
    data: tools,
    isLoading: loadingTools,
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
  const { data: currentTools = [], runAsync: refreshCurrentTools } = useRequest2(getSystemPlugins, {
    manual: false
  });
  const { data: allTags = [] } = useRequest2(() => getToolTags(), {
    manual: false
  });
  const { runAsync: handleInstallTool } = useRequest2(
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
      }
    }
  );
  const { runAsync: handleDeleteTool } = useRequest2(
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
        <VStack w={'full'} mt={8} gap={6} flexShrink={0}>
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

        <Box px={8} mt={8} fontSize={'14px'} fontWeight={'medium'} color={'myGray.500'}>
          工具
        </Box>
        <Box px={8} my={4} flexShrink={0}>
          <Flex alignItems={'center'} gap={2}>
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

        <ScrollData flex={1} px={8} pb={6}>
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
        </ScrollData>
      </MyBox>

      {!!selectedTool && (
        <ToolDetailDrawer
          onClose={() => setSelectedTool(null)}
          selectedTool={selectedTool}
          onFetchDetail={async (toolId: string) => await getMarketplaceToolDetail({ toolId })}
          onToggleInstall={() => {
            if (selectedTool.status === 3) {
              handleDeleteTool(selectedTool);
            } else {
              handleInstallTool(selectedTool);
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

export default ToolkitMarketplace;
