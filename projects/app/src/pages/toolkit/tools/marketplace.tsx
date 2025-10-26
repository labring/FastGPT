'use client';

import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Grid, Input, InputGroup, VStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useState, useMemo } from 'react';
import ToolCard from '@fastgpt/web/components/core/plugins/ToolCard';
import PluginTagFilter from '@fastgpt/web/components/core/plugins/PluginTagFilter';
import ToolDetailDrawer from '@fastgpt/web/components/core/plugins/ToolDetailDrawer';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import type {
  SystemPluginTemplateListItemType,
  ToolListItem
} from '@fastgpt/global/core/app/plugin/type';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const ToolkitMarketplace = () => {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { feConfigs } = useSystemStore();
  const [searchText, setSearchText] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedTool, setSelectedTool] = useState<ToolListItem | null>(null);

  const convertToSystemPluginFormat = (tool: ToolListItem): SystemPluginTemplateListItemType => {
    const name =
      // @ts-ignore
      typeof tool.name === 'string' ? tool.name : tool.name[i18n.language] || tool.name.en;
    const intro =
      typeof tool.description === 'string'
        ? tool.description
        : // @ts-ignore
          tool.description[i18n.language] || tool.description.en;

    return {
      ...tool,
      name,
      intro,
      tags: tool.tags.map((tagId, index) => ({
        tagId,
        tagName: tagId,
        tagOrder: index,
        isSystem: true
      }))
    } as unknown as SystemPluginTemplateListItemType;
  };

  // TODO: Replace with actual API call
  const { data: tools = [], loading: loadingTools } = useRequest2(
    async () => {
      // TODO: 调用实际的 API 获取工具列表
      return [] as ToolListItem[];
    },
    {
      manual: false
    }
  );

  // TODO: Replace with actual API call
  const { data: tags = [] } = useRequest2(
    async () => {
      // TODO: 调用实际的 API 获取标签列表
      return [];
    },
    {
      manual: false
    }
  );

  const filteredTools = useMemo(() => {
    let result = tools;

    // 搜索过滤
    if (searchText) {
      result = result.filter((tool) => {
        const name =
          typeof tool.name === 'string'
            ? tool.name
            : // @ts-ignore
              tool.name[i18n.language] || tool.name.en || '';
        const description =
          typeof tool.description === 'string'
            ? tool.description
            : // @ts-ignore
              tool.description?.[i18n.language] || tool.description?.en || '';
        return (
          name.toLowerCase().includes(searchText.toLowerCase()) ||
          description.toLowerCase().includes(searchText.toLowerCase())
        );
      });
    }

    // 标签过滤
    if (selectedTagIds.length > 0) {
      result = result.filter((tool) => {
        return tool.tags?.some((tagId) => selectedTagIds.includes(tagId));
      });
    }

    return result;
  }, [tools, searchText, selectedTagIds, i18n.language]);

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
              tags={tags}
              selectedTagIds={selectedTagIds}
              onTagSelect={setSelectedTagIds}
            />
          </Flex>
        </Box>

        <Box flex={1} overflowY={'auto'} px={8} pb={6}>
          {filteredTools.length > 0 ? (
            <Grid
              gridTemplateColumns={['1fr', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']}
              gridGap={5}
              alignItems={'stretch'}
            >
              {filteredTools.map((tool) => {
                const convertedTool = convertToSystemPluginFormat(tool);
                return (
                  <ToolCard
                    key={tool.id}
                    item={convertedTool}
                    isInstalled={null}
                    onToggleInstall={() => {
                      // TODO: Implement download logic
                      console.log('Download tool:', tool.id);
                    }}
                    systemTitle={feConfigs.systemTitle}
                    onClick={() => setSelectedTool(tool)}
                  />
                );
              })}
            </Grid>
          ) : (
            <EmptyTip />
          )}
        </Box>
      </MyBox>

      {!!selectedTool && (
        <ToolDetailDrawer
          onClose={() => setSelectedTool(null)}
          tool={convertToSystemPluginFormat(selectedTool)}
          isInstalled={null}
          onToggleInstall={() => {
            // TODO: Implement download logic
            console.log('Download tool:', selectedTool.id);
          }}
          systemTitle={feConfigs.systemTitle}
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
