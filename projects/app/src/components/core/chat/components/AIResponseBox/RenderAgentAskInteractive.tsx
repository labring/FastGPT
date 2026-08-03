import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Flex
} from '@chakra-ui/react';
import type { AgentAskInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useTranslation } from 'next-i18next';
import React from 'react';

/** 显示 Agent Ask 的只读历史。 */
const RenderAgentAskInteractive = ({
  interactive,
  submitted
}: {
  interactive: AgentAskInteractive;
  submitted: boolean;
}) => {
  const { t } = useTranslation();
  const questions = interactive.params.questions.map((question) => ({
    question: question.question,
    options: question.options,
    answer: question.answer
  }));

  if (!submitted) {
    return <Box color={'myGray.600'}>{t('chat:interactive.agent_ask.waiting')}</Box>;
  }

  return (
    <Accordion allowToggle>
      <AccordionItem border={'none'}>
        <Box w={'full'} pb={1}>
          <AccordionButton
            w={'fit-content'}
            minH={6}
            p={0}
            color={'myGray.600'}
            bg={'transparent'}
            _hover={{ color: 'myGray.600', bg: 'transparent' }}
            _expanded={{ color: 'myGray.600' }}
          >
            <Box fontSize={'md'} lineHeight={6}>
              {t('chat:interactive.agent_ask.asked_questions', { count: questions.length })}
            </Box>
            <AccordionIcon ml={1} w={4} h={4} color={'myGray.500'} />
          </AccordionButton>
        </Box>
        <AccordionPanel px={0} pt={2} pb={0}>
          <Flex direction={'column'} gap={3}>
            {questions.map((question, index) => {
              const answer = question.answer;
              const answerText =
                answer === '' || answer === undefined
                  ? t('chat:interactive.agent_ask.unanswered')
                  : (question.options.find((option) => option.value === answer)?.summary ?? answer);

              return (
                <Box key={index}>
                  <Box whiteSpace={'pre-wrap'} wordBreak={'break-word'} lineHeight={7}>
                    {question.question}
                  </Box>
                  <Box
                    color={'myGray.600'}
                    whiteSpace={'pre-wrap'}
                    wordBreak={'break-word'}
                    lineHeight={7}
                  >
                    {answerText}
                  </Box>
                </Box>
              );
            })}
          </Flex>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
};

export default React.memo(RenderAgentAskInteractive);
