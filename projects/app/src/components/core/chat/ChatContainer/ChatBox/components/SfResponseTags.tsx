import React, { useMemo, useState, useCallback } from 'react';
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
import { addStatisticalDataToHistoryItem, isCorrectionRecord } from '@/global/core/chat/utils';
import { useSize } from 'ahooks';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../Provider';
import { isDatabaseSource } from '@fastgpt/global/core/dataset/utils';
import { formatChatValue2InputType } from '../utils';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';
import { SimpleCitationDisplay } from './assistant/ChatItem';

export type CitationRenderItem = {
  type: 'dataset' | 'link';
  key: string;
  displayText: string;
  icon?: string;
  disabled?: boolean;
  onClick: () => any;
};

const ContextModal = dynamic(() => import('./ContextModal'));
const WholeResponseModal = dynamic(() => import('../../../components/WholeResponseModal'));
const AssistantDetailModal = dynamic(() => import('../../../components/AssistantDetailModal'));

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

  const chatText = useMemo(
    () => formatChatValue2InputType(historyItem.value).text || '',
    [historyItem.value]
  );
  const chatTime = historyItem.time || new Date();
  const durationSeconds = historyItem.durationSeconds || 0;
  const isShowCite = useContextSelector(ChatItemContext, (v) => v.isShowCite);
  const showWholeResponse = useContextSelector(ChatItemContext, (v) => v.showWholeResponse ?? true);
  const {
    totalQuoteList: quotes = [],
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

  const quoteList = useMemo(() => quotes.filter((v) => !isCorrectionRecord(v.id)), [quotes]);

  const [quoteFolded, setQuoteFolded] = useState<boolean>(true);

  const chatType = useContextSelector(ChatBoxContext, (v) => v.chatType);

  const isAssistantType = useContextSelector(ChatBoxContext, (v) => v.isAssistantType);

  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const chatBoxData = { appId, chatId, outLinkAuthData };

  const notSharePage = useMemo(() => chatType !== 'share', [chatType]);

  const {
    isOpen: isOpenWholeModal,
    onOpen: onOpenWholeModal,
    onClose: onCloseWholeModal
  } = useDisclosure();

  // 处理查看完整响应
  const handleViewFullResponse = useCallback(() => {
    onOpenWholeModal();
  }, [onOpenWholeModal]);
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
        disabled: isDatabaseSource(item.sourceId),
        icon: item.imageId
          ? 'core/dataset/imageFill'
          : getSourceNameIcon({ sourceId: item.sourceId, sourceName: item.sourceName }),
        onClick: () => {
          if (isDatabaseSource(item.sourceId)) {
            return;
          }
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

  const TODO = { list: true };

  return !showTags ? null : (
    <>
      {/* quote */}
      <SimpleCitationDisplay historyItem={historyItem} datasetReadPerMap={TODO} />

      {isOpenWholeModal && isAssistantType && (
        <AssistantDetailModal
          isOpen={isOpenWholeModal}
          onClose={onCloseWholeModal}
          dataId={dataId}
          appId={chatBoxData.appId}
          chatId={chatBoxData.chatId}
          outLinkAuthData={chatBoxData.outLinkAuthData}
        />
      )}
      {isOpenWholeModal && !isAssistantType && (
        <WholeResponseModal dataId={dataId} chatTime={chatTime} onClose={onCloseWholeModal} />
      )}
    </>
  );
};

export default React.memo(ResponseTags);
