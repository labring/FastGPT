import React from 'react';
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
  const { t } = useTranslation();

  return (
    <ScrollData flex={'1 0 0'} h={'100%'} w={'100%'} overflow={'overlay'} px={[4, 0]} pb={10}>
      <Box id="chat-container" maxW={['100%', '92%']} h={'100%'} mx={'auto'}>
        {chatRecords.length === 0 && !isLoading ? (
          <EmptyTip />
        ) : (
          <Box id={'history'}>
            {chatRecords.map((item, index) => (
              <Box key={item.dataId}>
                <Box py={item.hideInUI ? 0 : 6}>
                  {item.obj === ChatRoleEnum.Human && !item.hideInUI && (
                    <ChatItem
                      type={item.obj}
                      chat={item}
                      isLastChild={index === chatRecords.length - 1}
                    />
                  )}
                  {item.obj === ChatRoleEnum.AI && (
                    <ChatItem
                      type={item.obj}
                      chat={item}
                      isLastChild={index === chatRecords.length - 1}
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
    </ScrollData>
  );
};

export default React.memo(ChatHistory);
