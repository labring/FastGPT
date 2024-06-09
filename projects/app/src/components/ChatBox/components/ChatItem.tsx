import {
  Box,
  BoxProps,
  Card,
  Flex,
  useTheme,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Image
} from '@chakra-ui/react';
import React, { useMemo } from 'react';
import ChatController, { type ChatControllerProps } from './ChatController';
import ChatAvatar from './ChatAvatar';
import { MessageCardStyle } from '../constants';
import { formatChatValue2InputType } from '../utils';
import Markdown, { CodeClassName } from '@/components/Markdown';
import styles from '../index.module.scss';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  ChatItemValueTypeEnum,
  ChatRoleEnum,
  ChatStatusEnum
} from '@fastgpt/global/core/chat/constants';
import FilesBlock from './FilesBox';
import { ChatBoxContext } from '../Provider';
import Avatar from '@/components/Avatar';
import { useContextSelector } from 'use-context-selector';

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

  const isChatting = useContextSelector(ChatBoxContext, (v) => v.isChatting);
  const { chat } = chatControllerProps;

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

          if (value.text) {
            let source = (value.text?.content || '').trim();

            if (!source && chat.value.length > 1) return null;

            if (
              isLastChild &&
              !isChatting &&
              questionGuides.length > 0 &&
              i === chat.value.length - 1
            ) {
              source = `${source}
\`\`\`${CodeClassName.questionGuide}
${JSON.stringify(questionGuides)}`;
            }

            return (
              <Markdown
                key={key}
                source={source}
                showAnimation={isLastChild && isChatting && i === chat.value.length - 1}
              />
            );
          }
          if (value.type === ChatItemValueTypeEnum.tool && value.tools) {
            return (
              <Box key={key}>
                {value.tools.map((tool) => {
                  const toolParams = (() => {
                    try {
                      return JSON.stringify(JSON.parse(tool.params), null, 2);
                    } catch (error) {
                      return tool.params;
                    }
                  })();
                  const toolResponse = (() => {
                    try {
                      return JSON.stringify(JSON.parse(tool.response), null, 2);
                    } catch (error) {
                      return tool.response;
                    }
                  })();

                  return (
                    <Box key={tool.id}>
                      <Accordion allowToggle>
                        <AccordionItem borderTop={'none'} borderBottom={'none'}>
                          <AccordionButton
                            w={'auto'}
                            bg={'white'}
                            borderRadius={'md'}
                            borderWidth={'1px'}
                            borderColor={'myGray.200'}
                            boxShadow={'1'}
                            _hover={{
                              bg: 'auto'
                            }}
                          >
                            <Avatar src={tool.toolAvatar} borderRadius={'md'} w={'1rem'} mr={2} />
                            <Box mr={1} fontSize={'sm'}>
                              {tool.toolName}
                            </Box>
                            {isChatting && !tool.response && (
                              <MyIcon name={'common/loading'} w={'14px'} />
                            )}
                            <AccordionIcon color={'myGray.600'} ml={5} />
                          </AccordionButton>
                          <AccordionPanel
                            py={0}
                            px={0}
                            mt={0}
                            borderRadius={'md'}
                            overflow={'hidden'}
                            maxH={'500px'}
                            overflowY={'auto'}
                          >
                            {toolParams && toolParams !== '{}' && (
                              <Markdown
                                source={`~~~json#Input
${toolParams}`}
                              />
                            )}
                            {toolResponse && (
                              <Markdown
                                source={`~~~json#Response
${toolResponse}`}
                              />
                            )}
                          </AccordionPanel>
                        </AccordionItem>
                      </Accordion>
                    </Box>
                  );
                })}
              </Box>
            );
          }
          return null;
        })}
      </Flex>
    );
  }, [chat.dataId, chat.value, isChatting, isLastChild, questionGuides, type]);

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
      <Box mt={['6px', 2]} textAlign={styleMap.textAlign}>
        <Card
          className="markdown"
          {...MessageCardStyle}
          bg={styleMap.bg}
          borderRadius={styleMap.borderRadius}
          textAlign={'left'}
        >
          {ContentCard}
          {children}
        </Card>
      </Box>
    </>
  );
};

export default React.memo(ChatItem);
