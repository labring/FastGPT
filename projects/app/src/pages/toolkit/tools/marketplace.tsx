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
      })),
      // 添加 mock 的 versionList 和 userGuide
      versionList: [
        {
          value: 'v1.0.0',
          description: '初始版本',
          inputs: [
            {
              key: 'query',
              label: { 'zh-CN': '搜索内容', 'zh-Hant': '搜索內容', en: 'Query' },
              description: {
                'zh-CN': '需要搜索的关键词或问题',
                'zh-Hant': '需要搜索的關鍵詞或問題',
                en: 'Keywords or questions to search'
              },
              valueType: 'string',
              required: true
            },
            {
              key: 'limit',
              label: { 'zh-CN': '结果数量', 'zh-Hant': '結果數量', en: 'Result Limit' },
              description: {
                'zh-CN': '返回搜索结果的数量（默认 10）',
                'zh-Hant': '返回搜索結果的數量（默認 10）',
                en: 'Number of search results to return (default 10)'
              },
              valueType: 'number',
              required: false
            }
          ],
          outputs: [
            {
              key: 'result',
              label: { 'zh-CN': '搜索结果', 'zh-Hant': '搜索結果', en: 'Result' },
              description: {
                'zh-CN': '搜索返回的结果列表',
                'zh-Hant': '搜索返回的結果列表',
                en: 'List of search results'
              },
              valueType: 'string'
            }
          ]
        }
      ],
      userGuide: {
        'zh-CN': `## 核心功能\n\n本工具专为${name}设计，在准确转换语言的基础上，能智能优化译文的流畅性和可读性。\n\n## 使用方法\n\n1. 输入需要处理的文本\n2. 配置相关参数\n3. 点击执行获取结果\n\n## 注意事项\n\n- 请确保输入内容格式正确\n- 建议先测试小批量数据\n- 注意配额使用情况`,
        'zh-Hant': `## 核心功能\n\n本工具專為${name}設計，在準確轉換語言的基礎上，能智能優化譯文的流暢性和可讀性。\n\n## 使用方法\n\n1. 輸入需要處理的文本\n2. 配置相關參數\n3. 點擊執行獲取結果\n\n## 注意事項\n\n- 請確保輸入內容格式正確\n- 建議先測試小批量數據\n- 注意配額使用情況`,
        en: `## Core Features\n\nThis tool is designed for ${name}, which can intelligently optimize the fluency and readability of translations on the basis of accurate language conversion.\n\n## Usage\n\n1. Enter the text to be processed\n2. Configure relevant parameters\n3. Click Execute to get results\n\n## Notes\n\n- Please ensure the input content format is correct\n- It is recommended to test small batches of data first\n- Pay attention to quota usage`
      }
    } as unknown as SystemPluginTemplateListItemType;
  };

  // TODO: Replace with actual API call
  const { data: tools = [], loading: loadingTools } = useRequest2(
    async () => {
      const mockTools: ToolListItem[] = [
        {
          id: 'google-search-1',
          name: { 'zh-CN': '谷歌搜索', 'zh-Hant': '谷歌搜索', en: 'Google Search' },
          description: {
            'zh-CN': '通过请求谷歌搜索，查询相关内容为模型提供参考',
            'zh-Hant': '通過請求谷歌搜索，查詢相關內容為模型提供參考',
            en: 'Query Google Search for relevant content to provide reference for the model'
          },
          avatar: '/imgs/plugin/google.svg',
          author: 'FastGPT',
          tags: ['search'],
          downloadCount: 0
        },
        {
          id: 'web-scraper-1',
          name: { 'zh-CN': '网页爬虫', 'zh-Hant': '網頁爬蟲', en: 'Web Scraper' },
          description: {
            'zh-CN': '爬取指定网页内容，提取有用信息',
            'zh-Hant': '爬取指定網頁內容，提取有用信息',
            en: 'Crawl specified web page content and extract useful information'
          },
          avatar: '/imgs/plugin/web.svg',
          author: 'FastGPT',
          tags: ['scraping'],
          downloadCount: 0
        },
        {
          id: 'email-sender-1',
          name: { 'zh-CN': '邮件发送', 'zh-Hant': '郵件發送', en: 'Email Sender' },
          description: {
            'zh-CN': '通过 SMTP 协议发送电子邮件',
            'zh-Hant': '通過 SMTP 協議發送電子郵件',
            en: 'Send emails via SMTP protocol'
          },
          avatar: '/imgs/plugin/email.svg',
          author: 'Community',
          tags: ['communication'],
          downloadCount: 0
        },
        {
          id: 'database-query-1',
          name: { 'zh-CN': '数据库查询', 'zh-Hant': '數據庫查詢', en: 'Database Query' },
          description: {
            'zh-CN': '连接数据库并执行 SQL 查询',
            'zh-Hant': '連接數據庫並執行 SQL 查詢',
            en: 'Connect to database and execute SQL queries'
          },
          avatar: '/imgs/plugin/db.svg',
          author: 'FastGPT',
          tags: ['database'],
          downloadCount: 0
        },
        {
          id: 'image-gen-1',
          name: { 'zh-CN': '图像生成', 'zh-Hant': '圖像生成', en: 'Image Generation' },
          description: {
            'zh-CN': '使用 AI 模型生成图像',
            'zh-Hant': '使用 AI 模型生成圖像',
            en: 'Generate images using AI models'
          },
          avatar: '/imgs/plugin/image.svg',
          author: 'FastGPT',
          tags: ['ai'],
          downloadCount: 0
        },
        {
          id: 'weather-1',
          name: { 'zh-CN': '天气查询', 'zh-Hant': '天氣查詢', en: 'Weather Query' },
          description: {
            'zh-CN': '查询全球城市天气信息',
            'zh-Hant': '查詢全球城市天氣信息',
            en: 'Query weather information for cities worldwide'
          },
          avatar: '/imgs/plugin/weather.svg',
          author: 'Community',
          tags: ['search'],
          downloadCount: 0
        },
        {
          id: 'translate-1',
          name: { 'zh-CN': '文本翻译', 'zh-Hant': '文本翻譯', en: 'Text Translation' },
          description: {
            'zh-CN': '支持多语言文本翻译服务',
            'zh-Hant': '支持多語言文本翻譯服務',
            en: 'Multi-language text translation service'
          },
          avatar: '/imgs/plugin/translate.svg',
          author: 'FastGPT',
          tags: ['ai', 'communication'],
          downloadCount: 0
        },
        {
          id: 'pdf-parser-1',
          name: { 'zh-CN': 'PDF 解析', 'zh-Hant': 'PDF 解析', en: 'PDF Parser' },
          description: {
            'zh-CN': '解析 PDF 文档，提取文本和图片',
            'zh-Hant': '解析 PDF 文檔，提取文本和圖片',
            en: 'Parse PDF documents and extract text and images'
          },
          avatar: '/imgs/plugin/pdf.svg',
          author: 'Community',
          tags: ['scraping'],
          downloadCount: 0
        }
      ];

      // 模拟网络延迟
      await new Promise((resolve) => setTimeout(resolve, 500));
      return mockTools;
    },
    {
      manual: false
    }
  );

  // TODO: Replace with actual API call
  const { data: tags = [] } = useRequest2(
    async () => {
      // Mock 标签数据
      const mockTags = [
        {
          tagId: 'search',
          tagName: { 'zh-CN': '搜索', 'zh-Hant': '搜索', en: 'Search' },
          tagOrder: 1,
          isSystem: true
        },
        {
          tagId: 'scraping',
          tagName: { 'zh-CN': '爬虫', 'zh-Hant': '爬蟲', en: 'Scraping' },
          tagOrder: 2,
          isSystem: true
        },
        {
          tagId: 'communication',
          tagName: { 'zh-CN': '通信', 'zh-Hant': '通信', en: 'Communication' },
          tagOrder: 3,
          isSystem: true
        },
        {
          tagId: 'database',
          tagName: { 'zh-CN': '数据库', 'zh-Hant': '數據庫', en: 'Database' },
          tagOrder: 4,
          isSystem: true
        },
        {
          tagId: 'ai',
          tagName: { 'zh-CN': 'AI', 'zh-Hant': 'AI', en: 'AI' },
          tagOrder: 5,
          isSystem: true
        }
      ];
      return mockTags;
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
              showWrapper={false}
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
            <EmptyTip text={t('common:common.empty.no_data')} />
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
