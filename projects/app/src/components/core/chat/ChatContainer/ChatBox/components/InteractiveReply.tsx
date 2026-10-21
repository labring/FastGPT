import { Box, Flex } from '@chakra-ui/react';
import type {
  UserChatInteractiveReplyType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
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
  reply: UserChatInteractiveReplyType;
  chatValue: UserChatItemValueItemType[];
  chatTime?: Date;
  children?: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const questions = reply.questions.map(({ question, answer }) => ({
    question,
    answer: answer === '' ? t('chat:interactive.agent_ask.unanswered') : answer
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
            content: questions.map(({ question, answer }) => `${question}\n${answer}`).join('\n\n')
          }
        }
      ]}
      content={
        <Flex direction={'column'} gap={3} minW={0} maxW={'100%'}>
          {files.length > 0 && <HumanChatBubbleContent chatValue={files} />}
          {questions.map(({ question, answer }, index) => (
            <Box key={index} minW={0} maxW={'100%'} lineHeight={7}>
              <MyTooltip label={question} showOnlyWhenOverflow>
                <Box color={'myGray.600'} noOfLines={1}>
                  {question}
                </Box>
              </MyTooltip>
              <Box whiteSpace={'pre-wrap'} wordBreak={'break-word'}>
                {answer}
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
