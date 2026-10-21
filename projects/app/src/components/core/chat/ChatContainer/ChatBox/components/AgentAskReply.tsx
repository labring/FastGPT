import { Box, Flex } from '@chakra-ui/react';
import type { AgentAskInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import React from 'react';
import HumanChatBubble from './HumanChatBubble';

/** 将一次已提交的 Agent Ask 显示为只读用户气泡，复制时保留问题与可读答案。 */
const AgentAskReply = ({ interactive }: { interactive: AgentAskInteractive }) => {
  const { t } = useTranslation();
  const questions = interactive.params.questions.map((question) => ({
    question: question.question,
    answer:
      question.answer === '' || question.answer === undefined
        ? t('chat:interactive.agent_ask.unanswered')
        : (question.options.find((option) => option.value === question.answer)?.summary ??
          question.answer)
  }));

  return (
    <HumanChatBubble
      canEdit={false}
      chatValue={[
        {
          text: {
            content: questions.map(({ question, answer }) => `${question}\n${answer}`).join('\n\n')
          }
        }
      ]}
      content={
        <Flex direction={'column'} gap={3} minW={0} maxW={'100%'}>
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
    />
  );
};

export default React.memo(AgentAskReply);
