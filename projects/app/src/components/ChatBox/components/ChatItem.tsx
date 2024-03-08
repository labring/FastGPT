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
  Button,
  Image,
  Grid
} from '@chakra-ui/react';
import React, { useMemo } from 'react';
import ChatController, { type ChatControllerProps } from './ChatController';
import ChatAvatar from './ChatAvatar';
import { MessageCardStyle } from '../constants';
import { formatChatValue2InputType } from '../utils';
import Markdown, { CodeClassName } from '@/components/Markdown';
import styles from '../index.module.scss';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import MdImage from '@/components/Markdown/img/Image';
import FilesBlock from './FilesBox';

const ChatItem = ({
  type,
  avatar,
  statusBoxData,
  children,
  isLastChild,
  questionGuides = [],
  ...chatControllerProps
}: {
  type: 'Human' | 'AI';
  avatar?: string;
  statusBoxData?: {
    bg: string;
    name: string;
  };
  isLastChild?: boolean;
  questionGuides?: string[];
  children?: React.ReactNode;
} & ChatControllerProps) => {
  const theme = useTheme();
  const styleMap: BoxProps =
    type === 'Human'
      ? {
          order: 0,
          ml: 0,
          borderRadius: '8px 0 8px 8px',
          justifyContent: 'flex-end',
          textAlign: 'right',
          bg: 'primary.200'
        }
      : {
          order: 1,
          ml: 2,
          borderRadius: '0 8px 8px 8px',
          justifyContent: 'flex-start',
          textAlign: 'left',
          bg: 'white'
        };
  const { chat, isChatting } = chatControllerProps;

  const ContentCard = useMemo(() => {
    if (type === 'Human') {
      const { text, files = [] } = formatChatValue2InputType(chat.value);

      return (
        <>
          {files.length > 0 && <FilesBlock files={files} />}
          <Markdown source={text} isChatting={false} />
        </>
      );
    }
    /* AI */
    return (
      <Flex flexDirection={'column'} gap={2}>
        {chat.value.map((value, i) => {
          const key = `${chat.dataId}-ai-${i}`;
          if (value.text) {
            let source = value.text?.content || '';

            if (isLastChild && !isChatting && questionGuides.length > 0) {
              source = `${source}
\`\`\`${CodeClassName.questionGuide}
${JSON.stringify(questionGuides)}`;
            }

            return <Markdown key={key} source={source} isChatting={isLastChild && isChatting} />;
          }
          if (value.type === ChatItemValueTypeEnum.tool && value.tools) {
            return (
              <Box key={key}>
                {value.tools.map((tool) => {
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
                          >
                            <Image src={tool.toolAvatar} alt={''} w={'14px'} mr={2} />
                            <Box mr={1}>{tool.toolName}</Box>
                            {isChatting && !tool.response && (
                              <MyIcon name={'common/loading'} w={'14px'} />
                            )}
                            <AccordionIcon color={'myGray.600'} ml={5} />
                          </AccordionButton>
                          <AccordionPanel
                            py={0}
                            px={0}
                            mt={2}
                            borderRadius={'md'}
                            overflow={'hidden'}
                            maxH={'500px'}
                            overflowY={'auto'}
                          >
                            {tool.params && (
                              <Markdown
                                source={`~~~json
${tool.params}`}
                              />
                            )}
                            {tool.response && (
                              <Markdown
                                source={`~~~json
${tool.response}`}
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
        })}
      </Flex>
    );
  }, [chat.dataId, chat.value, isChatting, isLastChild, questionGuides, type]);

  return (
    <>
      {/* control icon */}
      <Flex w={'100%'} alignItems={'center'} justifyContent={styleMap.justifyContent}>
        {isChatting && type === 'AI' && isLastChild ? null : (
          <Box order={styleMap.order} ml={styleMap.ml}>
            <ChatController {...chatControllerProps} />
          </Box>
        )}
        <ChatAvatar src={avatar} type={type} />
        {!!statusBoxData && isLastChild && (
          <Flex
            ml={3}
            alignItems={'center'}
            px={3}
            py={'1px'}
            borderRadius="md"
            border={theme.borders.base}
          >
            <Box
              className={styles.statusAnimation}
              bg={statusBoxData.bg}
              w="8px"
              h="8px"
              borderRadius={'50%'}
              mt={'1px'}
            ></Box>
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

export default ChatItem;
