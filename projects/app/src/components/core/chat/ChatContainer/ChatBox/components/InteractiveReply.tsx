import { Box, Flex } from '@chakra-ui/react';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { UserChatSelectType } from '@fastgpt/global/core/chat/input/type';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import React from 'react';
import HumanChatBubble from './HumanChatBubble';
import HumanChatBubbleContent from './HumanChatBubble/Content';

/** 在真实 useritem 中统一展示问答回复，复制时保留问题与可读答案。 */
const InteractiveReply = ({
  reply,
  chatValue,
  chatTime,
  children
}: {
  reply: UserChatSelectType;
  chatValue: UserChatItemValueItemType[];
  chatTime?: Date;
  children?: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const questions = reply.questions.map(({ question, value }) => ({
    question,
    value: value === '' ? t('chat:interactive.agent_ask.unanswered') : value
  }));
  const files = chatValue.filter((value) => value.file).map(({ file }) => ({ file }));

  return (
    <HumanChatBubble
      canEdit={false}
      chatTime={chatTime}
      chatValue={[
        ...files,
        {
          text: {
            content: questions.map(({ question, value }) => `${question}\n${value}`).join('\n\n')
          }
        }
      ]}
      content={
        <Flex direction={'column'} gap={3} minW={0} maxW={'100%'} fontSize={'md'}>
          {files.length > 0 && <HumanChatBubbleContent chatValue={files} />}
          {questions.map(({ question, value }, index) => (
            <Box key={index} minW={0} maxW={'100%'} lineHeight={7}>
              <MyTooltip label={question} showOnlyWhenOverflow>
                <Box color={'myGray.600'} noOfLines={1}>
                  {question}
                </Box>
              </MyTooltip>
              <Box whiteSpace={'pre-wrap'} wordBreak={'break-word'}>
                {value}
              </Box>
            </Box>
          ))}
        </Flex>
      }
    >
      {children}
    </HumanChatBubble>
  );
};

export default React.memo(InteractiveReply);
