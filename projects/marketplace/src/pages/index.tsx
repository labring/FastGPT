import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Grid, Input, InputGroup, VStack } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useState, useMemo } from 'react';
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
          {t('common:navbar.Tools')}
        </Box>
        <Box px={8} my={4} flexShrink={0}>
          <Flex alignItems={'center'} gap={2}>
            <PluginTagFilter
              tags={toolTags || []}
              selectedTagIds={selectedTagIds}
              onTagSelect={setSelectedTagIds}
            />
          </Flex>
        </Box>

        <ScrollData flex={1} px={8} pb={6} minHeight={0} height="auto">
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
                    onToggleInstall={() => {}}
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
          onToggleInstall={() => {}}
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
