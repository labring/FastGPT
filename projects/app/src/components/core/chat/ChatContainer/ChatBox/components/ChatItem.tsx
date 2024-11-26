import { Box, BoxProps, Card, Flex } from '@chakra-ui/react';
import React, { useMemo, useRef } from 'react';
import ChatController, { type ChatControllerProps } from './ChatController';
import ChatAvatar from './ChatAvatar';
import { MessageCardStyle } from '../constants';
import { formatChatValue2InputType } from '../utils';
import Markdown from '@/components/Markdown';
import styles from '../index.module.scss';
import {
  ChatItemValueTypeEnum,
  ChatRoleEnum,
  ChatStatusEnum
} from '@fastgpt/global/core/chat/constants';
import FilesBlock from './FilesBox';
import { ChatBoxContext } from '../Provider';
import { useContextSelector } from 'use-context-selector';
import AIResponseBox from '../../../components/AIResponseBox';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { AIChatItemValueItemType, ChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { CodeClassNameEnum } from '@/components/Markdown/utils';
import { isEqual } from 'lodash';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { formatTimeToChatItemTime } from '@fastgpt/global/common/string/time';
import dayjs from 'dayjs';

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

type BasicProps = {
  avatar?: string;
  statusBoxData?: {
    status: `${ChatStatusEnum}`;
    name: string;
  };
  questionGuides?: string[];
  children?: React.ReactNode;
} & ChatControllerProps;

type Props = BasicProps & {
  type: ChatRoleEnum.Human | ChatRoleEnum.AI;
};

const RenderQuestionGuide = ({ questionGuides }: { questionGuides: string[] }) => {
  return (
    <Markdown
      source={`\`\`\`${CodeClassNameEnum.questionGuide}
${JSON.stringify(questionGuides)}`}
    />
  );
};

const HumanContentCard = React.memo(
  function HumanContentCard({ chatValue }: { chatValue: ChatItemValueItemType[] }) {
    const { text, files = [] } = formatChatValue2InputType(chatValue);
    return (
      <Flex flexDirection={'column'} gap={4}>
        {files.length > 0 && <FilesBlock files={files} />}
        {text && <Markdown source={text} />}
      </Flex>
    );
  },
  (prevProps, nextProps) => isEqual(prevProps.chatValue, nextProps.chatValue)
);
const AIContentCard = React.memo(function AIContentCard({
  chatValue,
  dataId,
  isLastChild,
  isChatting,
  questionGuides
}: {
  dataId: string;
  chatValue: ChatItemValueItemType[];
  isLastChild: boolean;
  isChatting: boolean;
  questionGuides: string[];
}) {
  return (
    <Flex flexDirection={'column'} gap={2}>
      {chatValue.map((value, i) => {
        const key = `${dataId}-ai-${i}`;

        return (
          <AIResponseBox
            key={key}
            value={value}
            isLastResponseValue={isLastChild && i === chatValue.length - 1}
            isChatting={isChatting}
          />
        );
      })}
      {isLastChild && questionGuides.length > 0 && (
        <RenderQuestionGuide questionGuides={questionGuides} />
      )}
    </Flex>
  );
});

const ChatItem = (props: Props) => {
  const { type, avatar, statusBoxData, children, isLastChild, questionGuides = [], chat } = props;

  const { isPc } = useSystem();

  const styleMap: BoxProps = {
    ...(type === ChatRoleEnum.Human
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
        }),
    fontSize: 'mini',
    fontWeight: '400',
    color: 'myGray.500'
  };
  const { t } = useTranslation();

  const isChatting = useContextSelector(ChatBoxContext, (v) => v.isChatting);
  const chatType = useContextSelector(ChatBoxContext, (v) => v.chatType);
  const showNodeStatus = useContextSelector(ChatBoxContext, (v) => v.showNodeStatus);
  const isChatLog = chatType === 'log';

  const { copyData } = useCopyData();

  const chatStatusMap = useMemo(() => {
    if (!statusBoxData?.status) return;
    return colorMap[statusBoxData.status];
  }, [statusBoxData?.status]);

  /* 
    1. The interactive node is divided into n dialog boxes.
    2. Auto-complete the last textnode
  */
  const splitAiResponseResults = useMemo(() => {
    if (chat.obj !== ChatRoleEnum.AI) return [chat.value];

    // Remove empty text node
    const filterList = chat.value.filter((item, i) => {
      if (item.type === ChatItemValueTypeEnum.text && !item.text?.content?.trim()) {
        return false;
      }
      return item;
    });

    const groupedValues: AIChatItemValueItemType[][] = [];
    let currentGroup: AIChatItemValueItemType[] = [];

    filterList.forEach((value) => {
      if (value.type === 'interactive') {
        if (currentGroup.length > 0) {
          groupedValues.push(currentGroup);
          currentGroup = [];
        }

        groupedValues.push([value]);
      } else {
        currentGroup.push(value);
      }
    });

    if (currentGroup.length > 0) {
      groupedValues.push(currentGroup);
    }

    // Check last group is interactive, Auto add a empty text node(animation)
    const lastGroup = groupedValues[groupedValues.length - 1];
    if (isChatting || groupedValues.length === 0) {
      if (
        (lastGroup &&
          lastGroup[lastGroup.length - 1] &&
          lastGroup[lastGroup.length - 1].type === ChatItemValueTypeEnum.interactive) ||
        groupedValues.length === 0
      ) {
        groupedValues.push([
          {
            type: ChatItemValueTypeEnum.text,
            text: {
              content: ''
            }
          }
        ]);
      }
    }

    return groupedValues;
  }, [chat.obj, chat.value, isChatting]);

  return (
    <Box
      _hover={{
        '& .time-label': {
          display: 'block'
        }
      }}
    >
      {/* control icon */}
      <Flex w={'100%'} alignItems={'center'} gap={2} justifyContent={styleMap.justifyContent}>
        {isChatting && type === ChatRoleEnum.AI && isLastChild ? null : (
          <Flex order={styleMap.order} ml={styleMap.ml} align={'center'} gap={'0.62rem'}>
            {chat.time && (isPc || isChatLog) && (
              <Box
                order={type === ChatRoleEnum.AI ? 2 : 0}
                className={'time-label'}
                fontSize={styleMap.fontSize}
                color={styleMap.color}
                fontWeight={styleMap.fontWeight}
                display={isChatLog ? 'block' : 'none'}
              >
                {t(formatTimeToChatItemTime(chat.time) as any, {
                  time: dayjs(chat.time).format('HH:mm')
                }).replace('#', ':')}
              </Box>
            )}
            <ChatController {...props} isLastChild={isLastChild} />
          </Flex>
        )}
        <ChatAvatar src={avatar} type={type} />

        {/* Workflow status */}
        {!!chatStatusMap && statusBoxData && isLastChild && showNodeStatus && (
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
      {splitAiResponseResults.map((value, i) => (
        <Box
          key={i}
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
            {type === ChatRoleEnum.Human && <HumanContentCard chatValue={value} />}
            {type === ChatRoleEnum.AI && (
              <AIContentCard
                chatValue={value}
                dataId={chat.dataId}
                isLastChild={isLastChild && i === splitAiResponseResults.length - 1}
                isChatting={isChatting}
                questionGuides={questionGuides}
              />
            )}
            {/* Example: Response tags. A set of dialogs only needs to be displayed once*/}
            {i === splitAiResponseResults.length - 1 && <>{children}</>}
            {/* 对话框底部的复制按钮 */}
            {type == ChatRoleEnum.AI &&
              value[0]?.type !== 'interactive' &&
              (!isChatting || (isChatting && !isLastChild)) && (
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
                      onClick={() => copyData(formatChatValue2InputType(value).text ?? '')}
                    />
                  </MyTooltip>
                </Box>
              )}
          </Card>
        </Box>
      ))}
    </Box>
  );
};

export default React.memo(ChatItem);
