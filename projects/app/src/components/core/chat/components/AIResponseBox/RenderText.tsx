import Markdown from '@/components/Markdown';
import {
  ChatItemContext,
  type OnOpenCiteModalProps
} from '@/web/core/chat/context/chatItemContext';
import { WorkflowRuntimeContext } from '../../ChatContainer/context/workflowRuntimeContext';
import { removeDatasetCiteText } from '@fastgpt/global/core/ai/llm/utils';
import { useCreation } from 'ahooks';
import React, { useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import styles from '../../ChatContainer/ChatBox/components/AIChatBubble/index.module.scss';
import { toChatAuthApiTarget } from '@/web/core/chat/utils';

const RenderText = React.memo(function RenderText({
  showAnimation,
  text,
  chatItemDataId,
  onOpenCiteModal,
  allowedCitationIds,
  isDisabled
}: {
  showAnimation: boolean;
  text: string;
  chatItemDataId: string;
  onOpenCiteModal?: (e?: OnOpenCiteModalProps) => void;
  allowedCitationIds?: Set<string>;
  isDisabled?: boolean;
}) {
  const sourceTarget = useContextSelector(WorkflowRuntimeContext, (v) => v.sourceTarget);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const isShowCite = useContextSelector(ChatItemContext, (v) => v.isShowCite);

  const source = useMemo(() => {
    if (!text) return '';

    if (isShowCite) {
      return text;
    }
    return removeDatasetCiteText(text, isShowCite);
  }, [text, isShowCite]);

  const chatAuthData = useCreation(() => {
    if (!sourceTarget.sourceId) return undefined;
    return {
      ...toChatAuthApiTarget({ sourceTarget, outLinkAuthData }),
      chatId,
      chatItemDataId
    };
  }, [sourceTarget, chatId, chatItemDataId, outLinkAuthData]);

  return (
    <Markdown
      className={styles.markdown}
      source={source}
      showAnimation={showAnimation}
      chatAuthData={chatAuthData}
      allowedCitationIds={allowedCitationIds}
      onOpenCiteModal={onOpenCiteModal}
      isDisabled={isDisabled}
      autoPreviewHtmlCodeBlock
    />
  );
});

export default RenderText;
