import React, { useState, useCallback, useMemo } from 'react';
import { Box, Checkbox } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { ChatSiteItemType } from '@fastgpt/global/core/chat/type.d';
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
import type { SubmitChatCorrectionParams } from '@fastgpt/global/core/chat/correction/api';
import type { CorrectionDataType } from '@fastgpt/global/core/chat/correction/type';
import { submitChatCorrection } from '@/web/core/app/api/log';
import { formatChatValue2InputType } from '../../utils';

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
  }>({
    isOpen: false,
    dataId: ''
  });

  // 获取问题和答案的函数
  const getQuestionAndAnswer = useCallback(
    (currentItem: ChatSiteItemType) => {
      const currentIndex = chatRecords.findIndex((item) => item.dataId === currentItem.dataId);

      if (currentItem.obj === ChatRoleEnum.AI && currentIndex > 0) {
        // 当前是AI回答，找上一个人类问题
        const prevItem = chatRecords[currentIndex - 1];
        if (prevItem && prevItem.obj === ChatRoleEnum.Human) {
          const question = formatChatValue2InputType(prevItem.value).text || '';
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
      const currentItem = chatRecords.find((item) => item.dataId === dataId);
      if (!currentItem) return;

      const { question, rawAnswer } = getQuestionAndAnswer(currentItem);

      setCorrectionModalData({
        isOpen: true,
        dataId,
        defaultCorrectionData: {
          question,
          rawAnswer,
          correctedAnswer: rawAnswer
        }
      });
    },
    [chatRecords, getQuestionAndAnswer]
  );

  // 关闭纠错弹窗
  const handleCloseCorrectionModal = useCallback(() => {
    setCorrectionModalData({
      isOpen: false,
      dataId: ''
    });
  }, []);

  // 提交纠错
  const handleSubmitCorrection = useCallback(
    async (params: SubmitChatCorrectionParams) => {
      const data = await submitChatCorrection(params);
      handleCloseCorrectionModal();

      // 更新对应的聊天记录项，标记为已纠错
      setChatRecords((prevRecords) =>
        prevRecords.map((record) => {
          if (record.dataId === params.dataId) {
            return {
              ...record,
              correctionId: data.correctionId
            };
          }
          return record;
        })
      );
    },
    [handleCloseCorrectionModal, setChatRecords]
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
        />
      )}
    </ScrollData>
  );
};

export default React.memo(ChatHistory);
