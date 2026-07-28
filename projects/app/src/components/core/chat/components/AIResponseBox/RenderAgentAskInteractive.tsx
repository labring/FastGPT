import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Flex
} from '@chakra-ui/react';
import type { UserInputInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useTranslation } from 'next-i18next';
import React from 'react';

/** 显示辅助生成 ask 历史。 */
const RenderAgentAskInteractive = ({
  interactive,
  submitted
}: {
  interactive: UserInputInteractive;
  submitted: boolean;
}) => {
  const { t } = useTranslation();
  const { inputForm } = interactive.params;

  if (!submitted) {
    return <Box color={'myGray.600'}>{t('chat:interactive.agent_ask.waiting')}</Box>;
  }

  return (
    <Accordion allowToggle>
      <AccordionItem border={'none'}>
        <Box w={'full'} pb={1} borderBottom={'1px solid'} borderBottomColor={'myGray.100'}>
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
              {t('chat:interactive.agent_ask.asked_questions', { count: inputForm.length })}
            </Box>
            <AccordionIcon ml={1} w={4} h={4} color={'myGray.500'} />
          </AccordionButton>
        </Box>
        <AccordionPanel px={0} pt={2} pb={0}>
          <Flex direction={'column'} gap={3}>
            {inputForm.map((input) => {
              const answer = input.value as string;
              const answerText =
                answer === '' || answer === undefined
                  ? t('chat:interactive.agent_ask.unanswered')
                  : (input.list?.find((item) => item.value === answer)?.label ?? answer);

              return (
                <Box key={input.key}>
                  <Box whiteSpace={'pre-wrap'} wordBreak={'break-word'} lineHeight={7}>
                    {input.label}
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
