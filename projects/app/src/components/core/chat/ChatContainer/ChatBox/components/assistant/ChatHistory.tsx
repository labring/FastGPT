import React, { useState, useCallback } from 'react';
import { Box, Checkbox } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { ChatItemType, ChatSiteItemType } from '@fastgpt/global/core/chat/type.d';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import ChatItem from './ChatItem';
import ChatBoxDivider from '@/components/core/chat/Divider';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import dynamic from 'next/dynamic';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import type { SubmitChatCorrectionResponse } from '@fastgpt/global/core/chat/correction/api';
import type { CorrectionDataType } from '@fastgpt/global/core/chat/correction/type';
import { formatChatValue2InputType } from '../../utils';
import { removeDatasetCiteText } from '@fastgpt/service/core/ai/utils';

const CorrectionModal = dynamic(
  () => import('@/pageComponents/app/detail/ConversationLogs/CorrectionModal')
);

type ChatHistoryProps = {
  showMarkIcon?: boolean;
  statusBoxData?: {
    status: ChatStatusEnum;
    name: string;
  };
  onCloseCustomFeedback: (
    chat: ChatSiteItemType,
    i: number
  ) => (e: React.ChangeEvent<HTMLInputElement>) => void;
};

const ChatHistory = ({ showMarkIcon, statusBoxData, onCloseCustomFeedback }: ChatHistoryProps) => {
  // 从 context 获取数据，与原文件保持一致
  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const ScrollData = useContextSelector(ChatRecordContext, (v) => v.ScrollData);
  const isLoading = useContextSelector(ChatRecordContext, (v) => v.isLoading);
  const setChatRecords = useContextSelector(ChatRecordContext, (v) => v.setChatRecords);
  const { t } = useTranslation();

  // 从 ChatItemContext 获取 appId 和 chatId
  const chatBoxData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const appId = chatBoxData?.appId;
  const chatId = chatBoxData?.chatId;

  // 纠错弹窗状态
  const [correctionModalData, setCorrectionModalData] = useState<{
    isOpen: boolean;
    dataId: string;
    defaultCorrectionData?: Partial<CorrectionDataType>;
    correctionId?: string;
  }>({
    isOpen: false,
    dataId: '',
    correctionId: undefined
  });

  // 去除文本开头的换行符
  const trimLeadingNewlines = useCallback((text: string) => {
    return text.replace(/^\n+/, '');
  }, []);

  // 获取问题和答案的函数
  const getQuestionAndAnswer = useCallback(
    (currentItem: ChatItemType) => {
      const currentIndex = chatRecords.findIndex((item) => item.dataId === currentItem.dataId);

      if (currentItem.obj === ChatRoleEnum.AI && currentIndex > 0) {
        // 当前是AI回答，找上一个人类问题
        const prevItem = chatRecords[currentIndex - 1];
        if (prevItem && prevItem.obj === ChatRoleEnum.Human) {
          // 优先使用 rewriteStandardizedQuery，如果没有则使用原始问题
          const question =
            prevItem.rewriteStandardizedQuery ||
            formatChatValue2InputType(prevItem.value).text ||
            '';
          const rawAnswer = formatChatValue2InputType(currentItem.value).text || '';
          return { question, rawAnswer };
        }
      }

      return { question: '', rawAnswer: '' };
    },
    [chatRecords]
  );

  // 处理纠错按钮点击
  const handleCorrectError = useCallback(
    (dataId: string) => {
      const currentItem = chatRecords.find((item) => item.dataId === dataId) as ChatItemType;
      if (!currentItem) return;

      const { question, rawAnswer } = getQuestionAndAnswer(currentItem);

      const cleanedRawAnswer = trimLeadingNewlines(removeDatasetCiteText(rawAnswer, false));

      setCorrectionModalData({
        isOpen: true,
        dataId,
        defaultCorrectionData: {
          question,
          rawAnswer: cleanedRawAnswer,
          correctedAnswer: cleanedRawAnswer
        },
        correctionId: currentItem.correctionId
      });
    },
    [chatRecords, getQuestionAndAnswer, trimLeadingNewlines]
  );

  // 关闭纠错弹窗
  const handleCloseCorrectionModal = useCallback(() => {
    setCorrectionModalData({
      isOpen: false,
      dataId: '',
      correctionId: undefined
    });
  }, []);

  // 提交纠错
  const handleSubmitCorrection = useCallback(
    async (response: SubmitChatCorrectionResponse) => {
      // 更新对应的聊天记录项，标记为已纠错
      setChatRecords((prevRecords) =>
        prevRecords.map((record) => {
          if (record.dataId === correctionModalData.dataId) {
            return {
              ...record,
              correctionId: response.correctionId
            };
          }
          return record;
        })
      );
      // 关闭弹窗
      handleCloseCorrectionModal();
    },
    [correctionModalData.dataId, handleCloseCorrectionModal, setChatRecords]
  );

  return (
    <ScrollData
      flex={'1 0 0'}
      h={'100%'}
      w={'100%'}
      overflow={'overlay'}
      px={[4, 0]}
      pb={10}
      dataScrollContainer="true"
    >
      <Box id="chat-container" maxW={['100%', '92%']} h={'100%'} mx={'auto'}>
        {chatRecords.length === 0 && !isLoading ? (
          <EmptyTip />
        ) : (
          <Box id={'history'}>
            {chatRecords.map((item, index) => (
              <Box key={item.dataId}>
                <Box py={item.hideInUI ? 0 : 5}>
                  {item.obj === ChatRoleEnum.Human && !item.hideInUI && (
                    <ChatItem
                      type={item.obj}
                      chat={item}
                      isLastChild={index === chatRecords.length - 1}
                      onCorrectError={handleCorrectError}
                    />
                  )}
                  {item.obj === ChatRoleEnum.AI && (
                    <ChatItem
                      type={item.obj}
                      chat={item}
                      isLastChild={index === chatRecords.length - 1}
                      onCorrectError={handleCorrectError}
                      {...{
                        statusBoxData
                      }}
                    >
                      {/* custom feedback */}
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
                      {/* admin mark content */}
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
            ))}
          </Box>
        )}
      </Box>

      {/* 纠错弹窗 */}
      {correctionModalData.isOpen && appId && chatId && (
        <CorrectionModal
          isOpen={correctionModalData.isOpen}
          onClose={handleCloseCorrectionModal}
          appId={appId}
          chatId={chatId}
          dataId={correctionModalData.dataId}
          defaultCorrectionData={correctionModalData.defaultCorrectionData}
          onSubmit={handleSubmitCorrection}
          correctionId={correctionModalData.correctionId}
        />
      )}
    </ScrollData>
  );
};

export default React.memo(ChatHistory);
