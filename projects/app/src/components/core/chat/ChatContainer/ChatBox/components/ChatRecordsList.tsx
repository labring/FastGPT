import React, { type ChangeEvent, type MutableRefObject, useCallback, useMemo } from 'react';
import { Box, Checkbox } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import type { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import ChatBoxDivider from '../../../Divider';
import DeletedItemsCollapse from '../../DeletedItemsCollapse';
import { formatChatValue2InputType } from '../utils/chatValue';
import type { ChatSiteItemType } from '../type';
import ChatItem from './ChatItem';
import type { ChatBoxInputType } from '../type';
import {
  hasAiAnswerContent,
  hasAiInteractiveContent,
  hasAiProcessingContent
} from './AIChatBubble/utils';

export type ChatRecordsListProps = {
  records: ChatSiteItemType[];
  expandedDeletedGroups: Set<string>;
  itemRefs: MutableRefObject<Map<string, HTMLElement | null>>;
  showVoiceIcon: boolean;
  showMarkIcon: boolean;
  statusBoxData:
    | {
        status: `${ChatStatusEnum}`;
        name: string;
      }
    | undefined;
  questionGuides: string[];
  onToggleDeletedGroup: (dataIds: string[]) => void;
  onRetry: (dataId?: string) => (() => Promise<void>) | undefined;
  onEdit: (dataId?: string) => ((input: ChatBoxInputType) => Promise<void>) | undefined;
  onMark: (chat: ChatSiteItemType, q?: string) => (() => void) | undefined;
  onAddUserLike: (chat: ChatSiteItemType) => (() => void) | undefined;
  onAddUserDislike: (chat: ChatSiteItemType) => (() => void) | undefined;
  onCloseCustomFeedback: (
    chat: ChatSiteItemType,
    index: number
  ) => (e: ChangeEvent<HTMLInputElement>) => void;
  onToggleFeedbackReadStatus: (chat: ChatSiteItemType) => (() => Promise<void>) | undefined;
};

/**
 * 渲染 ChatBox 的聊天记录列表。
 *
 * 本组件只接收已经预处理好的 `records`，不负责 log 模式 deleted group 的计算，也不直接
 * 调用删除、重试、反馈、标注 API。所有动作都由上层 hook 生成后作为 props 注入，组件内部
 * 只负责把 human/AI 记录、折叠按钮、自定义反馈和 admin mark 展示拼成原来的 JSX。
 *
 * 设计边界：
 * - `expandedDeletedGroups` 只用于判断 deleted record 是否渲染，展开/收起状态更新仍在父组件。
 * - `itemRefs` 继续由父级 context 持有，本组件只在每条可见记录渲染时登记 DOM 节点。
 * - AI 的 q 默认值仍取上一条 processed record 的文本，保持 admin mark 默认问题内容不变。
 */
const ChatRecordsList = ({
  records,
  expandedDeletedGroups,
  itemRefs,
  showVoiceIcon,
  showMarkIcon,
  statusBoxData,
  questionGuides,
  onToggleDeletedGroup,
  onRetry,
  onEdit,
  onMark,
  onAddUserLike,
  onAddUserDislike,
  onCloseCustomFeedback,
  onToggleFeedbackReadStatus
}: ChatRecordsListProps) => {
  const { t } = useTranslation();

  const canMergeAiProcessingRecord = useCallback((item: ChatSiteItemType) => {
    if (item.obj !== ChatRoleEnum.AI || item.hideInUI || item.deleteTime) return false;
    if (item.collapseTop || item.collapseBottom) return false;

    let hasProcessing = false;

    const hasBlockingContent = item.value.some((value) => {
      const aiValue = value as AIChatItemValueItemType;
      if (aiValue.hideInUI) return false;

      hasProcessing = hasProcessing || hasAiProcessingContent(aiValue);
      return hasAiAnswerContent(aiValue) || hasAiInteractiveContent(aiValue);
    });

    return hasProcessing && !hasBlockingContent;
  }, []);

  const canMergeAiAnswerRecord = useCallback((item: ChatSiteItemType) => {
    if (item.obj !== ChatRoleEnum.AI || item.hideInUI || item.deleteTime) return false;
    if (item.collapseTop || item.collapseBottom) return false;

    return item.value.some((value) => hasAiAnswerContent(value as AIChatItemValueItemType));
  }, []);

  const renderRecords = useMemo(() => {
    const result: Array<{ item: ChatSiteItemType; sourceIndex: number; lastSourceIndex: number }> =
      [];

    for (let index = 0; index < records.length; index++) {
      const item = records[index];
      const startIndex = index;

      if (!canMergeAiProcessingRecord(item)) {
        result.push({ item, sourceIndex: index, lastSourceIndex: index });
        continue;
      }

      const mergedValues: AIChatItemValueItemType[] = [
        ...(item.value as AIChatItemValueItemType[])
      ];
      const mergedResponseData = [...(item.responseData || [])];
      let lastSourceIndex = index;
      let cursor = index + 1;
      let answerRecord: ChatSiteItemType | undefined;

      while (cursor < records.length && canMergeAiProcessingRecord(records[cursor])) {
        mergedValues.push(...(records[cursor].value as AIChatItemValueItemType[]));
        mergedResponseData.push(...(records[cursor].responseData || []));
        lastSourceIndex = cursor;
        cursor++;
      }

      if (cursor < records.length && canMergeAiAnswerRecord(records[cursor])) {
        answerRecord = records[cursor];
        mergedValues.push(...(answerRecord.value as AIChatItemValueItemType[]));
        mergedResponseData.push(...(answerRecord.responseData || []));
        lastSourceIndex = cursor;
        index = cursor;
      } else {
        index = lastSourceIndex;
      }

      result.push({
        item: {
          ...(answerRecord || item),
          value: mergedValues,
          responseData: mergedResponseData
        } as ChatSiteItemType,
        sourceIndex: startIndex,
        lastSourceIndex
      });
    }

    return result;
  }, [canMergeAiAnswerRecord, canMergeAiProcessingRecord, records]);

  return (
    <Box id={'history'}>
      {renderRecords.map(({ item, sourceIndex, lastSourceIndex }) => {
        const shouldRender = !item.deleteTime || expandedDeletedGroups.has(item.dataId);
        const previousRecord = records[sourceIndex - 1];
        const retryPreviousHuman =
          previousRecord?.obj === ChatRoleEnum.Human ? onRetry(previousRecord.dataId) : undefined;

        return (
          <Box key={item.dataId}>
            {item.collapseTop && (
              <DeletedItemsCollapse
                count={item.collapseTop.count}
                isExpanded={item.collapseTop.isExpanded}
                onToggle={() => onToggleDeletedGroup(item.collapseTop!.dataIds)}
                position="top"
              />
            )}

            {shouldRender && (
              <Box
                ref={(e) => {
                  itemRefs.current.set(item.dataId, e);
                }}
              >
                <Box
                  pt={
                    item.hideInUI ? 0 : item.obj === ChatRoleEnum.Human ? 0 : '20px'
                  }
                  pb={
                    item.hideInUI ? 0 : item.obj === ChatRoleEnum.Human ? '20px' : '40px'
                  }
                >
                  {item.obj === ChatRoleEnum.Human && !item.hideInUI && (
                    <ChatItem
                      chat={item}
                      onRetry={onRetry(item.dataId)}
                      onEditSubmit={onEdit(item.dataId)}
                      isLastChild={lastSourceIndex === records.length - 1}
                    />
                  )}
                  {item.obj === ChatRoleEnum.AI && (
                    <ChatItem
                      chat={item}
                      isLastChild={lastSourceIndex === records.length - 1}
                      {...{
                        showVoiceIcon,
                        statusBoxData,
                        questionGuides,
                        onRetry: retryPreviousHuman,
                        onMark: onMark(
                          item,
                          formatChatValue2InputType(previousRecord?.value)?.text
                        ),
                        onAddUserLike: onAddUserLike(item),
                        onAddUserDislike: onAddUserDislike(item),
                        onToggleFeedbackReadStatus: onToggleFeedbackReadStatus(item)
                      }}
                    >
                      {item.customFeedbacks && item.customFeedbacks.length > 0 && (
                        <Box>
                          <ChatBoxDivider
                            icon={'core/app/customFeedback'}
                            text={t('common:core.app.feedback.Custom feedback')}
                          />
                          {item.customFeedbacks.map((text, i) => (
                            <Box key={i}>
                              <MyTooltip
                                label={t('common:core.app.feedback.close custom feedback')}
                              >
                                <Checkbox
                                  onChange={onCloseCustomFeedback(item, i)}
                                  icon={<MyIcon name={'common/check'} w={'12px'} />}
                                >
                                  {text}
                                </Checkbox>
                              </MyTooltip>
                            </Box>
                          ))}
                        </Box>
                      )}
                      {showMarkIcon && item.adminFeedback && (
                        <Box fontSize={'sm'}>
                          <ChatBoxDivider
                            icon="core/app/markLight"
                            text={t('common:core.chat.Admin Mark Content')}
                          />
                          <Box whiteSpace={'pre-wrap'}>
                            <Box color={'black'}>{item.adminFeedback.q}</Box>
                            <Box color={'myGray.600'}>{item.adminFeedback.a}</Box>
                          </Box>
                        </Box>
                      )}
                    </ChatItem>
                  )}
                </Box>
              </Box>
            )}

            {item.collapseBottom && item.collapseBottom.isExpanded && (
              <DeletedItemsCollapse
                count={item.collapseBottom.count}
                isExpanded={item.collapseBottom.isExpanded}
                onToggle={() => onToggleDeletedGroup(item.collapseBottom!.dataIds)}
                position="bottom"
              />
            )}
          </Box>
        );
      })}
      {records.length > 0 && <Box h={'24px'} />}
    </Box>
  );
};

export default React.memo(ChatRecordsList);
