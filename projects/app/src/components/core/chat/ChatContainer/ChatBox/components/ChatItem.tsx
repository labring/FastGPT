import { Box, BoxProps, Card, Flex } from '@chakra-ui/react';
import React, { useMemo } from 'react';
import ChatController, { type ChatControllerProps } from './ChatController';
import ChatAvatar from './ChatAvatar';
import { MessageCardStyle } from '../constants';
import { formatChatValue2InputType } from '../utils';
import Markdown from '@/components/Markdown';
import styles from '../index.module.scss';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import FilesBlock from './FilesBox';
import { ChatBoxContext } from '../Provider';
import { useContextSelector } from 'use-context-selector';
import AIResponseBox from '../../../components/AIResponseBox';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
const colorMap = {
  [ChatStatusEnum.loading]: {
    bg: 'myGray.100',
    color: 'myGray.600'
  },
  [ChatStatusEnum.running]: {
    bg: 'green.50',
    color: 'green.700'
  },
  [ChatStatusEnum.finish]: {
    bg: 'green.50',
    color: 'green.700'
  }
};

const ChatItem = ({
  type,
  avatar,
  statusBoxData,
  children,
  isLastChild,
  questionGuides = [],
  ...chatControllerProps
}: {
  type: ChatRoleEnum.Human | ChatRoleEnum.AI;
  avatar?: string;
  statusBoxData?: {
    status: `${ChatStatusEnum}`;
    name: string;
  };
  questionGuides?: string[];
  children?: React.ReactNode;
} & ChatControllerProps) => {
  const styleMap: BoxProps =
    type === ChatRoleEnum.Human
      ? {
          order: 0,
          borderRadius: '8px 0 8px 8px',
          justifyContent: 'flex-end',
          textAlign: 'right',
          bg: 'primary.100'
        }
      : {
          order: 1,
          borderRadius: '0 8px 8px 8px',
          justifyContent: 'flex-start',
          textAlign: 'left',
          bg: 'myGray.50'
        };

  const { t } = useTranslation();
  const isChatting = useContextSelector(ChatBoxContext, (v) => v.isChatting);
  const { chat } = chatControllerProps;
  const { copyData } = useCopyData();
  const chatText = useMemo(() => formatChatValue2InputType(chat.value).text || '', [chat.value]);
  const ContentCard = useMemo(() => {
    if (type === 'Human') {
      const { text, files = [] } = formatChatValue2InputType(chat.value);

      return (
        <>
          {files.length > 0 && <FilesBlock files={files} />}
          <Markdown source={text} />
        </>
      );
    }

    /* AI */
    return (
      <Flex flexDirection={'column'} key={chat.dataId} gap={2}>
        {chat.value.map((value, i) => {
          const key = `${chat.dataId}-ai-${i}`;

          return (
            <AIResponseBox
              key={key}
              value={value}
              index={i}
              chat={chat}
              isLastChild={isLastChild}
              isChatting={isChatting}
              questionGuides={questionGuides}
            />
          );
        })}
      </Flex>
    );
  }, [chat, isChatting, isLastChild, questionGuides, type]);

  const chatStatusMap = useMemo(() => {
    if (!statusBoxData?.status) return;
    return colorMap[statusBoxData.status];
  }, [statusBoxData?.status]);

  return (
    <>
      {/* control icon */}
      <Flex w={'100%'} alignItems={'center'} gap={2} justifyContent={styleMap.justifyContent}>
        {isChatting && type === ChatRoleEnum.AI && isLastChild ? null : (
          <Box order={styleMap.order} ml={styleMap.ml}>
            <ChatController {...chatControllerProps} isLastChild={isLastChild} />
          </Box>
        )}
        <ChatAvatar src={avatar} type={type} />

        {!!chatStatusMap && statusBoxData && isLastChild && (
          <Flex
            alignItems={'center'}
            px={3}
            py={'1.5px'}
            borderRadius="md"
            bg={chatStatusMap.bg}
            fontSize={'sm'}
          >
            <Box
              className={styles.statusAnimation}
              bg={chatStatusMap.color}
              w="8px"
              h="8px"
              borderRadius={'50%'}
              mt={'1px'}
            />
            <Box ml={2} color={'myGray.600'}>
              {statusBoxData.name}
            </Box>
          </Flex>
        )}
      </Flex>
      {/* content */}
      <Box
        mt={['6px', 2]}
        className="chat-box-card"
        textAlign={styleMap.textAlign}
        _hover={{
          '& .footer-copy': {
            display: 'block'
          }
        }}
      >
        <Card
          {...MessageCardStyle}
          bg={styleMap.bg}
          borderRadius={styleMap.borderRadius}
          textAlign={'left'}
        >
          {ContentCard}
          {children}
          {/* 对话框底部的复制按钮 */}
          {type == ChatRoleEnum.AI && (!isChatting || (isChatting && !isLastChild)) && (
            <Box
              className="footer-copy"
              display={['block', 'none']}
              position={'absolute'}
              bottom={0}
              right={0}
              transform={'translateX(100%)'}
            >
              <MyTooltip label={t('common:common.Copy')}>
                <MyIcon
                  w={'1rem'}
                  cursor="pointer"
                  p="5px"
                  bg="white"
                  name={'copy'}
                  color={'myGray.500'}
                  _hover={{ color: 'primary.600' }}
                  onClick={() => copyData(chatText)}
                />
              </MyTooltip>
            </Box>
          )}
        </Card>
      </Box>
    </>
  );
};

export default React.memo(ChatItem);
