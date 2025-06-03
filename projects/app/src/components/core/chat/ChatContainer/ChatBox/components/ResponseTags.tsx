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
  const {
    totalQuoteList: quoteList = [],
    llmModuleAccount = 0,
    historyPreviewLength = 0
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

  const sourceList = useMemo(() => {
    return Object.values(
      quoteList.reduce((acc: Record<string, SearchDataResponseItemType[]>, cur) => {
        if (!acc[cur.collectionId]) {
          acc[cur.collectionId] = [cur];
        }
        return acc;
      }, {})
    )
      .flat()
      .map((item) => ({
        sourceName: item.sourceName,
        sourceId: item.sourceId,
        icon: item.imageId
          ? 'core/dataset/imageFill'
          : getSourceNameIcon({ sourceId: item.sourceId, sourceName: item.sourceName }),
        collectionId: item.collectionId,
        datasetId: item.datasetId
      }));
  }, [quoteList]);

  const notEmptyTags =
    quoteList.length > 0 ||
    (llmModuleAccount === 1 && notSharePage) ||
    (llmModuleAccount > 1 && notSharePage) ||
    (isPc && durationSeconds > 0) ||
    notSharePage;

  return !showTags ? null : (
    <>
      {/* quote */}
      {sourceList.length > 0 && (
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
            {sourceList.map((item, index) => {
              return (
                <MyTooltip key={item.collectionId} label={t('common:core.chat.quote.Read Quote')}>
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
                      onOpenCiteModal(item);
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
                        {item.sourceName}
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
