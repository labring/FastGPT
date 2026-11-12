import Markdown from '@/components/Markdown';
import type { MarkdownActionProps } from '@/components/Markdown/type';
import {
  ChatItemContext,
  type OnOpenCiteModalProps
} from '@/web/core/chat/context/chatItemContext';
import { WorkflowRuntimeContext } from '../../ChatContainer/context/workflowRuntimeContext';
import { removeDatasetCiteText } from '@fastgpt/global/core/ai/llm/utils';
import { LLM_TOOL_CALL_ARGUMENTS_TRUNCATED } from '@fastgpt/global/core/ai/constants';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
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
  isDisabled,
  onSendQuestion,
  onEditQuestion,
  onQuickReplyClick
}: {
  showAnimation: boolean;
  text: string;
  chatItemDataId: string;
  onOpenCiteModal?: (e?: OnOpenCiteModalProps) => void;
  allowedCitationIds?: Set<string>;
  isDisabled?: boolean;
} & MarkdownActionProps) {
  const sourceTarget = useContextSelector(WorkflowRuntimeContext, (v) => v.sourceTarget);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const isShowCite = useContextSelector(ChatItemContext, (v) => v.isShowCite);
  const { t } = useSafeTranslation();

  const source = useMemo(() => {
    if (!text) return '';
    // Agent 错误可能与先前已生成的正文一起返回，只翻译末尾的固定错误标识。
    const rendered = text.endsWith(LLM_TOOL_CALL_ARGUMENTS_TRUNCATED)
      ? text.slice(0, -LLM_TOOL_CALL_ARGUMENTS_TRUNCATED.length) +
        t('chat:llm_tool_call_arguments_truncated')
      : text;

    if (isShowCite) {
      return rendered;
    }
    return removeDatasetCiteText(rendered, isShowCite);
  }, [text, isShowCite, t]);

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
      onSendQuestion={onSendQuestion}
      onEditQuestion={onEditQuestion}
      onQuickReplyClick={onQuickReplyClick}
    />
  );
});

export default RenderText;
