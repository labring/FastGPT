import React, { useMemo, useState, useCallback } from 'react';
import { Flex, useDisclosure, Box, useToast } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import dynamic from 'next/dynamic';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import ChatBoxDivider from '@/components/core/chat/Divider';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { type ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import { addStatisticalDataToHistoryItem } from '@/global/core/chat/utils';
import { useSize } from 'ahooks';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../Provider';

export type CitationRenderItem = {
  type: 'dataset' | 'link';
  key: string;
  displayText: string;
  icon?: string;
  onClick: () => any;
};

const ContextModal = dynamic(() => import('./ContextModal'));
const WholeResponseModal = dynamic(() => import('../../../components/WholeResponseModal'));

// 工具函数：从URL中提取参数
const extractUrlParams = (url: string) => {
  try {
    const urlObj = new URL(url);
    // 检查参数是否在hash中（#后面）
    let searchParams: URLSearchParams;

    if (urlObj.hash && urlObj.hash.includes('?')) {
      // 参数在hash中，格式如：#/file?corpId=xxx&mediaId=yyy&traceId=zzz
      const hashPart = urlObj.hash.substring(1); // 去掉#号
      const queryStart = hashPart.indexOf('?');
      if (queryStart !== -1) {
        const queryString = hashPart.substring(queryStart + 1);
        searchParams = new URLSearchParams(queryString);
      } else {
        searchParams = urlObj.searchParams;
      }
    } else {
      // 参数在正常的query string中
      searchParams = urlObj.searchParams;
    }

    const corpId = searchParams.get('corpId');
    const traceId = searchParams.get('traceId');
    const mediaId = searchParams.get('mediaId');

    return { corpId, traceId, mediaId };
  } catch (error) {
    console.error('Failed to parse URL:', error);
    return { corpId: null, traceId: null, mediaId: null };
  }
};

// 工具函数：获取一次性token（通过服务端代理）
const getOneTimeToken = async (params: { corpId: string; traceId: string; mediaId: string }) => {
  try {
    const response = await fetch('/api/v1/memo/getOneTimeToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Proxy API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    // 检查代理API返回的数据结构
    if (result.code !== 200) {
      throw new Error(result.error || 'Proxy API returned error');
    }

    return result.data;
  } catch (error) {
    throw error;
  }
};

const ResponseTags = ({
  showTags,
  historyItem,
  onOpenCiteModal
}: {
  showTags: boolean;
  historyItem: ChatSiteItemType;
  onOpenCiteModal: (e?: {
    collectionId?: string;
    sourceId?: string;
    sourceName?: string;
    datasetId?: string;
    quoteId?: string;
  }) => void;
}) => {
  const { isPc } = useSystem();
  const { t } = useTranslation();
  const toast = useToast();
  const quoteListRef = React.useRef<HTMLDivElement>(null);
  const dataId = historyItem.dataId;

  const chatTime = historyItem.time || new Date();
  const durationSeconds = historyItem.durationSeconds || 0;
  const {
    totalQuoteList: quoteList = [],
    llmModuleAccount = 0,
    historyPreviewLength = 0,
    toolCiteLinks = []
  } = useMemo(() => addStatisticalDataToHistoryItem(historyItem), [historyItem]);

  const [quoteFolded, setQuoteFolded] = useState<boolean>(true);

  const chatType = useContextSelector(ChatBoxContext, (v) => v.chatType);

  const notSharePage = useMemo(() => chatType !== 'share', [chatType]);

  const {
    isOpen: isOpenWholeModal,
    onOpen: onOpenWholeModal,
    onClose: onCloseWholeModal
  } = useDisclosure();
  const {
    isOpen: isOpenContextModal,
    onOpen: onOpenContextModal,
    onClose: onCloseContextModal
  } = useDisclosure();

  useSize(quoteListRef);
  const quoteIsOverflow = quoteListRef.current
    ? quoteListRef.current.scrollHeight > (isPc ? 50 : 55)
    : true;

  // 处理链接点击的函数
  const handleLinkClick = useCallback(
    async (url: string) => {
      try {
        // 1. 提取URL中的参数
        const { corpId, traceId, mediaId } = extractUrlParams(url);

        // 检查必需的参数是否存在
        if (!corpId || !traceId || !mediaId) {
          toast({
            title: '参数错误',
            description: 'URL中缺少必需的参数（corpId、traceId、mediaId）',
            status: 'error',
            duration: 3000,
            isClosable: true
          });
          return;
        }

        // 2. 调用代理API获取一次性token
        const result = await getOneTimeToken({
          corpId,
          traceId,
          mediaId
        });

        // 3. 处理API响应
        if (result.success === true && result.result) {
          // 4. 跳转到获取的URL
          window.open(result.result, '_blank');
        } else {
          // 5. 根据错误码显示具体错误信息
          let errorMessage = '无法获取有效的访问链接';

          switch (result.errorCode) {
            case '1010201001':
              errorMessage = '企业ID不正确，请检查corpId参数';
              break;
            case '1010201002':
              errorMessage = '系统访问密钥不正确，请检查配置';
              break;
            case '1010201004':
              errorMessage = '应用ID不正确，请检查appId配置';
              break;
            case '1010201005':
              errorMessage = '应用访问密钥不正确，请检查appAccessKey配置';
              break;
            default:
              errorMessage = result.errorMsg || '获取文档预览链接失败';
          }

          toast({
            title: '获取链接失败',
            description: errorMessage,
            status: 'error',
            duration: 5000,
            isClosable: true
          });
        }
      } catch (error) {
        console.error('处理链接点击时发生错误:', error);
        toast({
          title: '网络错误',
          description: '无法连接到服务器，请稍后重试',
          status: 'error',
          duration: 3000,
          isClosable: true
        });

        // 如果API调用失败，回退到直接打开原始URL
        window.open(url, '_blank');
      }
    },
    [toast]
  );

  const citationRenderList: CitationRenderItem[] = useMemo(() => {
    // Dataset citations
    const datasetItems = Object.values(
      quoteList.reduce((acc: Record<string, SearchDataResponseItemType[]>, cur) => {
        if (!acc[cur.collectionId]) {
          acc[cur.collectionId] = [cur];
        }
        return acc;
      }, {})
    )
      .flat()
      .map((item) => ({
        type: 'dataset' as const,
        key: item.collectionId,
        displayText: item.sourceName,
        icon: item.imageId
          ? 'core/dataset/imageFill'
          : getSourceNameIcon({ sourceId: item.sourceId, sourceName: item.sourceName }),
        onClick: () => {
          onOpenCiteModal({
            collectionId: item.collectionId,
            sourceId: item.sourceId,
            sourceName: item.sourceName,
            datasetId: item.datasetId
          });
        }
      }));

    // Link citations
    const linkItems = toolCiteLinks.map((r, index) => ({
      type: 'link' as const,
      key: `${r.url}-${index}`,
      displayText: r.name,
      onClick: () => {
        handleLinkClick(r.url);
      }
    }));

    return [...datasetItems, ...linkItems];
  }, [quoteList, toolCiteLinks, onOpenCiteModal, handleLinkClick]);

  const notEmptyTags = notSharePage || quoteList.length > 0 || (isPc && durationSeconds > 0);

  return !showTags ? null : (
    <>
      {/* quote */}
      {citationRenderList.length > 0 && (
        <>
          <Flex justifyContent={'space-between'} alignItems={'center'}>
            <Box width={'100%'}>
              <ChatBoxDivider
                icon="core/chat/quoteFill"
                text={t('common:core.chat.Quote')}
                iconColor="#E82F72"
              />
            </Box>
            {quoteFolded && quoteIsOverflow && (
              <MyIcon
                _hover={{ color: 'primary.500', cursor: 'pointer' }}
                name="core/chat/chevronDown"
                w={'14px'}
                onClick={() => setQuoteFolded(!quoteFolded)}
              />
            )}
          </Flex>

          <Flex
            ref={quoteListRef}
            alignItems={'center'}
            position={'relative'}
            flexWrap={'wrap'}
            gap={2}
            maxH={quoteFolded && quoteIsOverflow ? ['50px', '55px'] : 'auto'}
            overflow={'hidden'}
            _after={
              quoteFolded && quoteIsOverflow
                ? {
                    content: '""',
                    position: 'absolute',
                    zIndex: 2,
                    bottom: 0,
                    left: 0,
                    width: '100%',
                    height: '50%',
                    background:
                      'linear-gradient(to bottom, rgba(247,247,247,0), rgba(247, 247, 247, 0.91))'
                  }
                : {}
            }
          >
            {citationRenderList.map((item, index) => {
              return (
                <MyTooltip key={item.key} label={t('common:core.chat.quote.Read Quote')}>
                  <Flex
                    alignItems={'center'}
                    fontSize={'xs'}
                    border={'sm'}
                    borderRadius={'sm'}
                    _hover={{
                      '.controller': {
                        display: 'flex'
                      }
                    }}
                    overflow={'hidden'}
                    position={'relative'}
                    cursor={'pointer'}
                    onClick={(e) => {
                      e.stopPropagation();
                      item.onClick?.();
                    }}
                    height={6}
                  >
                    <Flex
                      color={'myGray.500'}
                      bg={'myGray.150'}
                      w={4}
                      justifyContent={'center'}
                      fontSize={'10px'}
                      h={'full'}
                      alignItems={'center'}
                    >
                      {index + 1}
                    </Flex>
                    <Flex px={1.5}>
                      <MyIcon name={item.icon as any} mr={1} flexShrink={0} w={'12px'} />
                      <Box
                        className="textEllipsis3"
                        wordBreak={'break-all'}
                        flex={'1 0 0'}
                        fontSize={'mini'}
                      >
                        {item.displayText}
                      </Box>
                    </Flex>
                  </Flex>
                </MyTooltip>
              );
            })}
            {!quoteFolded && (
              <MyIcon
                position={'absolute'}
                bottom={0}
                right={0}
                _hover={{ color: 'primary.500', cursor: 'pointer' }}
                name="core/chat/chevronUp"
                w={'14px'}
                onClick={() => setQuoteFolded(!quoteFolded)}
              />
            )}
          </Flex>
        </>
      )}

      {notEmptyTags && (
        <Flex alignItems={'center'} mt={3} flexWrap={'wrap'} gap={2}>
          {quoteList.length > 0 && (
            <MyTooltip label={t('chat:view_citations')}>
              <MyTag
                colorSchema="blue"
                type="borderSolid"
                cursor={'pointer'}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCiteModal();
                }}
              >
                {t('chat:citations', { num: quoteList.length })}
              </MyTag>
            </MyTooltip>
          )}
          {llmModuleAccount === 1 && notSharePage && (
            <>
              {historyPreviewLength > 0 && (
                <MyTooltip label={t('chat:click_contextual_preview')}>
                  <MyTag
                    colorSchema="green"
                    cursor={'pointer'}
                    type="borderSolid"
                    onClick={onOpenContextModal}
                  >
                    {t('chat:contextual', { num: historyPreviewLength })}
                  </MyTag>
                </MyTooltip>
              )}
            </>
          )}
          {llmModuleAccount > 1 && notSharePage && (
            <MyTag type="borderSolid" colorSchema="blue">
              {t('chat:multiple_AI_conversations')}
            </MyTag>
          )}
          {isPc && durationSeconds > 0 && (
            <MyTooltip label={t('chat:module_runtime_and')}>
              <MyTag colorSchema="purple" type="borderSolid" cursor={'default'}>
                {durationSeconds.toFixed(2)}s
              </MyTag>
            </MyTooltip>
          )}

          {notSharePage && (
            <MyTooltip label={t('common:core.chat.response.Read complete response tips')}>
              <MyTag
                colorSchema="gray"
                type="borderSolid"
                cursor={'pointer'}
                onClick={onOpenWholeModal}
              >
                {t('common:core.chat.response.Read complete response')}
              </MyTag>
            </MyTooltip>
          )}
        </Flex>
      )}

      {isOpenContextModal && <ContextModal dataId={dataId} onClose={onCloseContextModal} />}
      {isOpenWholeModal && (
        <WholeResponseModal dataId={dataId} chatTime={chatTime} onClose={onCloseWholeModal} />
      )}
    </>
  );
};

export default React.memo(ResponseTags);
