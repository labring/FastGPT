import React, { useMemo, useState } from 'react';
import { Flex, useDisclosure, Box } from '@chakra-ui/react';
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
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';

export type CitationRenderItem = {
  type: 'dataset' | 'link';
  key: string;
  displayText: string;
  icon?: string;
  onClick: () => any;
};

const ContextModal = dynamic(() => import('./ContextModal'));
const WholeResponseModal = dynamic(() => import('../../../components/WholeResponseModal'));

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
  const quoteListRef = React.useRef<HTMLDivElement>(null);
  const dataId = historyItem.dataId;

  const chatTime = historyItem.time || new Date();
  const durationSeconds = historyItem.durationSeconds || 0;
  const isShowCite = useContextSelector(ChatItemContext, (v) => v.isShowCite);
  const {
    totalQuoteList: quoteList = [],
    llmModuleAccount = 0,
    historyPreviewLength = 0,
    toolCiteLinks = []
  } = useMemo(() => {
    return {
      ...addStatisticalDataToHistoryItem(historyItem),
      ...(!isShowCite
        ? {
            totalQuoteList: []
          }
        : {})
    };
  }, [historyItem, isShowCite]);

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

  const citationRenderList: CitationRenderItem[] = useMemo(() => {
    if (!isShowCite) return [];
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
        window.open(r.url, '_blank');
      }
    }));

    return [...datasetItems, ...linkItems];
  }, [quoteList, toolCiteLinks, onOpenCiteModal, isShowCite]);

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
