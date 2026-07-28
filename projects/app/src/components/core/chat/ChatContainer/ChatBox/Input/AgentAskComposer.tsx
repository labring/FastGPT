import { Box, Button, Flex, Textarea } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { UserInputInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import { onSendPrompt } from '../../../components/AIResponseBox/utils';

type Answers = Record<string, string>;

/** 渲染辅助生成的多题选择，并通过既有 userInput 协议提交答案。 */
const AgentAskComposer = ({
  interactive,
  onSubmit
}: {
  interactive: UserInputInteractive;
  onSubmit?: (text: string) => void;
}) => {
  const { t } = useTranslation();
  const questions = interactive.params.inputForm.filter((item) => item.list?.length);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [customValues, setCustomValues] = useState<Answers>({});
  const [editingCustom, setEditingCustom] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasHoveredOption, setHasHoveredOption] = useState(false);

  const question = questions[questionIndex];
  if (!question) return null;

  const answer = answers[question.key] ?? '';
  const customValue = customValues[question.key] ?? '';
  const isCustom =
    editingCustom || (!!answer && !question.list?.some((item) => item.value === answer));
  const isLastQuestion = questionIndex === questions.length - 1;

  const submit = (nextAnswers = answers) => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    const text = JSON.stringify(
      Object.fromEntries(questions.map((item) => [item.key, nextAnswers[item.key] ?? '']))
    );
    (onSubmit ?? onSendPrompt)(text);
  };
  const goNext = (nextAnswer: string) => {
    const nextAnswers = { ...answers, [question.key]: nextAnswer };
    setAnswers(nextAnswers);
    setEditingCustom(false);

    if (isLastQuestion) {
      submit(nextAnswers);
      return;
    }
    setQuestionIndex((index) => index + 1);
  };
  const skipOrAdvance = () => goNext(isCustom && customValue.trim() ? customValue.trim() : '');
  const skipAll = () => submit({});
  const selectCustom = () => {
    setEditingCustom(true);
    setAnswers((answers) => ({ ...answers, [question.key]: customValue }));
  };
  const resizeCustomTextarea = (textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return;

    textarea.style.height = '40px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 116)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 116 ? 'auto' : 'hidden';
  };
  const actionLabel =
    isCustom && customValue.trim()
      ? t(isLastQuestion ? 'common:Submit' : 'common:next_step')
      : t('chat:interactive.agent_ask.skip');

  return (
    <Box
      w={'100%'}
      maxW={'780px'}
      mx={'auto'}
      border={'1px solid'}
      borderColor={'myGray.250'}
      borderRadius={'20px'}
      bg={'white'}
      boxShadow={'0px 5px 10px rgba(19, 51, 107, 0.13)'}
      p={4}
    >
      <Flex alignItems={'center'} justifyContent={'space-between'} gap={4} px={1} mb={4}>
        <Box minW={0} color={'myGray.900'} fontSize={'md'} fontWeight={500} lineHeight={6}>
          {question.label}
        </Box>
        <Flex flexShrink={0} alignItems={'center'} gap={3}>
          <Flex alignItems={'center'} gap={2}>
            <Flex
              alignItems={'center'}
              justifyContent={'center'}
              borderRadius={'full'}
              w={6}
              h={6}
              bg={'myGray.150'}
              cursor={questionIndex === 0 || isSubmitting ? 'not-allowed' : 'pointer'}
              opacity={questionIndex === 0 || isSubmitting ? 0.5 : 1}
              onClick={
                questionIndex === 0 || isSubmitting
                  ? undefined
                  : () => {
                      setEditingCustom(false);
                      setQuestionIndex((index) => index - 1);
                    }
              }
            >
              <MyIcon name={'common/leftArrowLight'} w={'6px'} color={'myGray.900'} />
            </Flex>
            <Box color={'myGray.500'} fontSize={'sm'} fontWeight={500} whiteSpace={'nowrap'}>
              {t('chat:interactive.agent_ask.question_progress', {
                current: questionIndex + 1,
                total: questions.length
              })}
            </Box>
            <Flex
              alignItems={'center'}
              justifyContent={'center'}
              borderRadius={'full'}
              w={6}
              h={6}
              bg={'myGray.150'}
              cursor={isLastQuestion || isSubmitting ? 'not-allowed' : 'pointer'}
              opacity={isLastQuestion || isSubmitting ? 0.5 : 1}
              onClick={
                isLastQuestion || isSubmitting
                  ? undefined
                  : () => {
                      setEditingCustom(false);
                      setQuestionIndex((index) => index + 1);
                    }
              }
            >
              <MyIcon name={'common/rightArrow'} w={3} color={'myGray.900'} />
            </Flex>
          </Flex>
          <Flex
            alignItems={'center'}
            justifyContent={'center'}
            w={6}
            h={6}
            borderRadius={'full'}
            cursor={isSubmitting ? 'not-allowed' : 'pointer'}
            opacity={isSubmitting ? 0.5 : 1}
            _hover={isSubmitting ? undefined : { bg: 'myGray.50' }}
            onClick={isSubmitting ? undefined : skipAll}
            aria-label={t('chat:interactive.agent_ask.skip_all')}
          >
            <MyIcon name={'common/closeLight'} w={4} h={4} />
          </Flex>
        </Flex>
      </Flex>

      <Flex direction={'column'} gap={1}>
        {question.list?.map((option, index) => {
          const isSelected = answer === option.value && !isCustom;
          const isDefaultHover = !hasHoveredOption && index === 0;

          return (
            <Button
              key={option.value}
              variant={'unstyled'}
              role={'group'}
              display={'flex'}
              alignItems={'center'}
              minH={'40px'}
              h={'auto'}
              justifyContent={'space-between'}
              gap={3}
              p={2}
              border={'1px solid'}
              borderColor={isSelected ? 'primary.300' : 'transparent'}
              borderRadius={'21px'}
              bg={isSelected ? 'primary.50' : isDefaultHover ? 'blackAlpha.50' : 'transparent'}
              textAlign={'left'}
              _hover={
                isSelected
                  ? { bg: 'primary.50', borderColor: 'primary.300' }
                  : { bg: 'blackAlpha.50' }
              }
              _active={{ transform: 'none' }}
              onMouseEnter={() => setHasHoveredOption(true)}
              onClick={() => goNext(option.value)}
            >
              <Flex minW={0} alignItems={'center'} gap={2}>
                <Flex
                  flexShrink={0}
                  alignItems={'center'}
                  justifyContent={'center'}
                  w={6}
                  h={6}
                  borderRadius={'full'}
                  bg={isSelected ? 'primary.600' : isDefaultHover ? 'myGray.200' : 'myGray.50'}
                  color={isSelected ? 'myGray.100' : 'myGray.600'}
                  fontSize={'sm'}
                  fontWeight={500}
                >
                  {index + 1}
                </Flex>
                <Box minW={0} whiteSpace={'pre-wrap'} wordBreak={'break-word'} fontWeight={500}>
                  {option.label}
                </Box>
              </Flex>
              <MyIcon
                name={'common/arrowRight'}
                flexShrink={0}
                w={4}
                h={4}
                color={'myGray.400'}
                opacity={isSelected || isDefaultHover ? 1 : 0}
                _groupHover={{ opacity: 1 }}
              />
            </Button>
          );
        })}

        {isCustom ? (
          <Flex alignItems={'center'} gap={2} pl={2} minW={0} minH={'42px'}>
            <Flex
              flexShrink={0}
              alignItems={'center'}
              justifyContent={'center'}
              w={6}
              h={6}
              borderRadius={'full'}
              bg={'primary.600'}
              color={'myGray.100'}
            >
              <MyIcon name={'common/edit'} w={'14px'} h={'14px'} />
            </Flex>
            <Textarea
              autoFocus
              ref={resizeCustomTextarea}
              flex={'1 0 0'}
              minW={0}
              minH={'40px'}
              maxH={'116px'}
              h={'40px'}
              py={2}
              px={3}
              resize={'none'}
              borderColor={'primary.600'}
              boxShadow={'0 0 0 2.4px rgba(51, 112, 255, 0.15)'}
              value={customValue}
              aria-label={t('chat:interactive.agent_ask.custom_answer')}
              onChange={(event) => {
                resizeCustomTextarea(event.currentTarget);
                const value = event.currentTarget.value;
                setCustomValues((values) => ({ ...values, [question.key]: value }));
                setAnswers((answers) => ({ ...answers, [question.key]: value }));
              }}
            />
            <Button
              variant={'whiteBase'}
              size={'xs'}
              h={'32px'}
              flexShrink={0}
              px={3.5}
              borderRadius={'full'}
              isLoading={isSubmitting}
              _active={{ transform: 'none' }}
              onClick={skipOrAdvance}
            >
              {actionLabel}
            </Button>
          </Flex>
        ) : (
          <Flex alignItems={'center'} gap={2} minW={0} minH={'42px'}>
            <Button
              variant={'unstyled'}
              display={'flex'}
              flex={'1 0 0'}
              alignItems={'center'}
              minW={0}
              minH={'40px'}
              gap={2}
              p={2}
              borderRadius={'21px'}
              textAlign={'left'}
              _hover={{ bg: 'blackAlpha.50' }}
              _active={{ transform: 'none' }}
              onClick={selectCustom}
            >
              <Flex
                flexShrink={0}
                alignItems={'center'}
                justifyContent={'center'}
                w={6}
                h={6}
                borderRadius={'full'}
                bg={'myGray.50'}
                color={'myGray.600'}
              >
                <MyIcon name={'common/edit'} w={'14px'} h={'14px'} />
              </Flex>
              <Box minW={0} color={'myGray.600'} whiteSpace={'pre-wrap'} wordBreak={'break-word'}>
                {t('chat:interactive.agent_ask.custom_answer')}
              </Box>
            </Button>
            <Button
              variant={'whiteBase'}
              size={'xs'}
              h={'32px'}
              flexShrink={0}
              px={3.5}
              borderRadius={'full'}
              isLoading={isSubmitting}
              _active={{ transform: 'none' }}
              onClick={skipOrAdvance}
            >
              {t('chat:interactive.agent_ask.skip')}
            </Button>
          </Flex>
        )}
      </Flex>
    </Box>
  );
};

export default AgentAskComposer;
