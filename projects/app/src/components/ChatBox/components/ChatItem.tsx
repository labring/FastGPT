import { Box, BoxProps, Card, Flex, useTheme } from '@chakra-ui/react';
import React, { useMemo } from 'react';
import ChatController, { type ChatControllerProps } from './ChatController';
import ChatAvatar from './ChatAvatar';
import { MessageCardStyle } from '../constants';
import { formatChatValue2InputType } from '../utils';
import Markdown from '@/components/Markdown';
import styles from '../index.module.scss';

const ChatItem = ({
  type,
  avatar,
  statusBoxData,
  children,
  isLastChild,
  ...chatControllerProps
}: {
  type: 'Human' | 'AI';
  avatar?: string;
  statusBoxData?: {
    bg: string;
    name: string;
  };
  isLastChild?: boolean;
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
      const { text, files } = formatChatValue2InputType(chat.value);

      return (
        <>
          <Markdown source={text} isChatting={false} />
        </>
      );
    }
    /* AI */
    return (
      <>
        {chat.value.map((value, i) => {
          const key = `${chat.dataId}-ai-${i}`;
          if (value.text) {
            return (
              <Markdown
                key={key}
                source={value.text.content || ''}
                isChatting={isLastChild && isChatting}
              />
            );
          }
          if (value.tools) {
            return (
              <Box key={key}>
                {value.tools.map((tool) => (
                  <Box key={tool.id}>
                    <Box>{tool.toolName}</Box>
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
                  </Box>
                ))}
              </Box>
            );
          }
        })}
      </>
    );
  }, [chat.dataId, chat.value, isChatting, isLastChild, type]);

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
