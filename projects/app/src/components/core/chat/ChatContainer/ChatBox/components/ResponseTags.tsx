import React, { useMemo, useState } from 'react';
import { Flex, useDisclosure, Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { SearchDataResponseQuoteListItemType } from '@fastgpt/global/core/dataset/type';
import dynamic from 'next/dynamic';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import type { ChatSiteItemType } from '../type';
import { addStatisticalDataToHistoryItem } from '@/global/core/chat/utils';
import { useSize } from 'ahooks';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../Provider';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { useSandboxEditor } from '@/pageComponents/chat/SandboxEditor/hook';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';

export type CitationRenderItem = {
  type: 'dataset' | 'link';
  key: string;
  displayText: string;
  icon?: string;
  onClick: () => any;
};

const WholeResponseModal = dynamic(() => import('../../../components/WholeResponseModal'));

const getCitationGridSpan = (text: string) => {
  const textWidthUnits = Array.from(text).reduce((sum, char) => {
    return sum + (/[\u4E00-\u9FFF]/.test(char) ? 2 : 1);
  }, 0);

  return Math.min(Math.max(Math.ceil(textWidthUnits / 7), 1), 5);
};

const CitationListCard = React.memo(function CitationListCard({
  items,
  isPc,
  onOpenAll
}: {
  items: CitationRenderItem[];
  isPc: boolean;
  onOpenAll: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<boolean>(false);
  const cardContentRef = React.useRef<HTMLDivElement>(null);
  const cardContentSize = useSize(cardContentRef);
  const collapsedMaxHeight = 80;
  const isOverflow = (cardContentSize?.height || 0) > collapsedMaxHeight;

  if (items.length === 0) return null;

  return (
    <>
      <Box
        display={['none', 'block']}
        mt={3}
        w={'100%'}
        border={'1px solid'}
        borderColor={'myGray.200'}
        borderRadius={'12px'}
        bg={'white'}
        overflow={'hidden'}
        _hover={{
          background: 'linear-gradient(0deg, #FFF 56.25%, #F7F8FA 100%)'
        }}
      >
        <Box
          position={'relative'}
          maxH={!expanded && isOverflow ? `${collapsedMaxHeight}px` : 'none'}
          overflow={'hidden'}
          p={'8px'}
        >
          <Box ref={cardContentRef}>
            <Flex h={'28px'} alignItems={'center'} justifyContent={'space-between'} px={'8px'}>
              <MyTooltip label={t('chat:view_citations')}>
                <Flex
                  alignItems={'center'}
                  gap={'6px'}
                  color={'myGray.600'}
                  fontSize={'14px'}
                  lineHeight={'20px'}
                  fontWeight={500}
                  cursor={'pointer'}
                  _hover={{
                    color: 'primary.600',
                    '.citation-count': {
                      color: 'primary.600'
                    },
                    '.citation-arrow': {
                      color: 'primary.600'
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAll();
                  }}
                >
                  <Box>
                    {t('chat:citation_card_prefix')}
                    <Box as={'span'} className="citation-count" color={'myGray.900'}>
                      {items.length}
                    </Box>
                    {t('chat:citation_card_suffix')}
                  </Box>
                  <MyIcon
                    className="citation-arrow"
                    name={'common/arrowRight'}
                    w={'14px'}
                    color={'myGray.400'}
                    transform={'rotate(-45deg)'}
                  />
                </Flex>
              </MyTooltip>

              {isOverflow && (
                <MyIcon
                  name={expanded ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
                  w={'16px'}
                  color={'myGray.500'}
                  cursor={'pointer'}
                  _hover={{ color: 'primary.600' }}
                  onClick={() => setExpanded((state) => !state)}
                />
              )}
            </Flex>

            <Box
              mt={'4px'}
              display={'grid'}
              gridTemplateColumns={'repeat(5, minmax(0, 1fr))'}
              gap={'4px'}
            >
              {items.map((item) => (
                <MyTooltip key={item.key} label={t('common:core.chat.quote.Read Quote')}>
                  <Flex
                    alignItems={'center'}
                    minW={0}
                    w={'max-content'}
                    gridColumn={`span ${getCitationGridSpan(item.displayText)}`}
                    px={'8px'}
                    py={'6px'}
                    borderRadius={'8px'}
                    bg={'myGray.50'}
                    color={'myGray.900'}
                    fontSize={'14px'}
                    lineHeight={'20px'}
                    cursor={'pointer'}
                    _hover={{ bg: 'myGray.100' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      item.onClick?.();
                    }}
                  >
                    <MyIcon name={item.icon as any} mr={2} flexShrink={0} w={'14px'} />
                    <Box minW={0} whiteSpace={'nowrap'}>
                      {item.displayText}
                    </Box>
                  </Flex>
                </MyTooltip>
              ))}
            </Box>
          </Box>

          {!expanded && isOverflow && (
            <Box
              position={'absolute'}
              left={0}
              right={0}
              bottom={0}
              h={'32px'}
              zIndex={1}
              bgGradient={'linear(to-b, rgba(255,255,255,0), rgba(255,255,255,1.0))'}
              pointerEvents={'none'}
            />
          )}
        </Box>
      </Box>

      <Flex
        display={['inline-flex', 'none']}
        mt={3}
        alignItems={'center'}
        gap={'4px'}
        color={'primary.600'}
        fontSize={'14px'}
        lineHeight={'20px'}
        fontWeight={500}
        cursor={'pointer'}
        onClick={(e) => {
          e.stopPropagation();
          onOpenAll();
        }}
      >
        <MyIcon name={'common/link'} w={'16px'} h={'16px'} color={'primary.600'} />
        <Box>{t('chat:citation_card_title', { num: items.length })}</Box>
      </Flex>
    </>
  );
});

const ResponseTags = ({
  showTags,
  historyItem,
  onOpenCiteModal,
  showFooterMeta = true
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
  showFooterMeta?: boolean;
}) => {
  const { isPc } = useSystem();
  const { t } = useTranslation();
  const dataId = historyItem.dataId;

  const durationSeconds = historyItem.durationSeconds || 0;
  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const isShowCite = useContextSelector(ChatItemContext, (v) => v.isShowCite);
  const showWholeResponse = useContextSelector(ChatItemContext, (v) => v.showWholeResponse ?? true);
  const {
    totalQuoteList: quoteList = [],
    toolCiteLinks = [],
    useAgentSandbox
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

  const chatType = useContextSelector(ChatBoxContext, (v) => v.chatType);

  const notSharePage = useMemo(() => chatType !== 'share', [chatType]);

  const {
    isOpen: isOpenWholeModal,
    onOpen: onOpenWholeModal,
    onClose: onCloseWholeModal
  } = useDisclosure();

  const { onOpenSandboxModal, SandboxEditorModal } = useSandboxEditor({
    appId,
    chatId,
    outLinkAuthData
  });

  const citationRenderList: CitationRenderItem[] = useMemo(() => {
    if (!isShowCite) return [];

    // Dataset citations
    const datasetItems = Object.values(
      quoteList.reduce((acc: Record<string, SearchDataResponseQuoteListItemType[]>, cur) => {
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
        icon:
          'imageId' in item && item.imageId
            ? 'core/dataset/imageFill'
            : getSourceNameIcon({ sourceId: item.sourceId, sourceName: item.sourceName }) ||
              'core/chat/quoteFill',
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
      icon: 'common/link',
      onClick: () => {
        window.open(r.url, '_blank');
      }
    }));

    return [...datasetItems, ...linkItems];
  }, [quoteList, toolCiteLinks, onOpenCiteModal, isShowCite]);

  const notEmptyTags =
    (showFooterMeta && notSharePage) ||
    useAgentSandbox ||
    (showFooterMeta && isPc && durationSeconds > 0);

  return !showTags ? null : (
    <>
      {/* quote */}
      {citationRenderList.length > 0 && (
        <CitationListCard
          items={citationRenderList}
          isPc={isPc}
          onOpenAll={() => onOpenCiteModal()}
        />
      )}

      {notEmptyTags && (
        <Flex alignItems={'center'} mt={3} flexWrap={'wrap'} gap={2}>
          {showFooterMeta && isPc && durationSeconds > 0 && (
            <MyTooltip label={t('chat:module_runtime_and')}>
              <MyTag colorSchema="purple" type="borderSolid" cursor={'default'}>
                {durationSeconds.toFixed(2)}s
              </MyTag>
            </MyTooltip>
          )}

          {useAgentSandbox && (
            <>
              <MyTag
                colorSchema="green"
                type="borderSolid"
                cursor={'pointer'}
                onClick={onOpenSandboxModal}
              >
                {t('chat:sandbox_files')}
              </MyTag>
              <SandboxEditorModal />
            </>
          )}

          {showFooterMeta && notSharePage && showWholeResponse && (
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

      {isOpenWholeModal && <WholeResponseModal dataId={dataId} onClose={onCloseWholeModal} />}
    </>
  );
};

export default React.memo(ResponseTags);
