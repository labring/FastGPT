import { Box, Button, Flex, IconButton, Textarea } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { AgentAskQuestionInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useTranslation } from 'next-i18next';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';

type Answers = Record<string, string>;
type AgentAskOption = AgentAskQuestionInteractive['options'][number];

type AgentAskNavigationProps = {
  questionIndex: number;
  questionCount: number;
  isPreviousDisabled: boolean;
  isNextDisabled: boolean;
  isDisabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onSkipAll: () => void;
};

const AgentAskNavigation = ({
  questionIndex,
  questionCount,
  isPreviousDisabled,
  isNextDisabled,
  isDisabled,
  onPrevious,
  onNext,
  onSkipAll
}: AgentAskNavigationProps) => {
  const { t } = useTranslation();

  return (
    <Flex flexShrink={0} alignItems={'center'} gap={3}>
      <Flex alignItems={'center'} gap={2}>
        <IconButton
          variant={'unstyled'}
          display={'flex'}
          alignItems={'center'}
          justifyContent={'center'}
          borderRadius={'full'}
          w={6}
          h={6}
          minW={6}
          maxW={6}
          minH={6}
          maxH={6}
          flexShrink={0}
          p={0}
          bg={'myGray.150'}
          isDisabled={isPreviousDisabled}
          _hover={isPreviousDisabled ? undefined : { bg: 'myGray.200' }}
          _focusVisible={{ bg: 'myGray.200', boxShadow: 'none', outline: 'none' }}
          _active={{ transform: 'none' }}
          onClick={onPrevious}
          aria-label={t('chat:Previous')}
          icon={<MyIcon name={'common/leftArrowLight'} w={'6px'} color={'myGray.900'} />}
        />
        <Box color={'myGray.500'} fontSize={'sm'} fontWeight={500} whiteSpace={'nowrap'}>
          {questionIndex + 1}
          <Box as={'span'} mx={1}>
            /
          </Box>
          <Box as={'span'} color={'myGray.900'}>
            {questionCount}
          </Box>
        </Box>
        <IconButton
          variant={'unstyled'}
          display={'flex'}
          alignItems={'center'}
          justifyContent={'center'}
          borderRadius={'full'}
          w={6}
          h={6}
          minW={6}
          maxW={6}
          minH={6}
          maxH={6}
          flexShrink={0}
          p={0}
          bg={'myGray.150'}
          isDisabled={isNextDisabled}
          _hover={isNextDisabled ? undefined : { bg: 'myGray.200' }}
          _focusVisible={{ bg: 'myGray.200', boxShadow: 'none', outline: 'none' }}
          _active={{ transform: 'none' }}
          onClick={onNext}
          aria-label={t('chat:Next')}
          icon={<MyIcon name={'common/rightArrow'} w={'6px'} color={'myGray.900'} />}
        />
      </Flex>
      <Button
        variant={'unstyled'}
        display={'flex'}
        alignItems={'center'}
        justifyContent={'center'}
        w={6}
        h={6}
        minW={0}
        p={0}
        borderRadius={'full'}
        isDisabled={isDisabled}
        _hover={isDisabled ? undefined : { bg: 'myGray.50' }}
        _focusVisible={{ bg: 'myGray.50', boxShadow: 'none', outline: 'none' }}
        _active={{ transform: 'none' }}
        onClick={onSkipAll}
        aria-label={t('chat:interactive.agent_ask.skip_all')}
      >
        <MyIcon name={'common/closeLight'} w={4} h={4} />
      </Button>
    </Flex>
  );
};

type AgentAskAdvanceButtonProps = {
  label: string;
  isLoading: boolean;
  isDisabled: boolean;
  onClick: () => void;
};

const AgentAskAdvanceButton = ({
  label,
  isLoading,
  isDisabled,
  onClick
}: AgentAskAdvanceButtonProps) => (
  <Button
    variant={'whiteBase'}
    size={'xs'}
    minW={'auto'}
    h={'32px'}
    flexShrink={0}
    px={3.5}
    borderRadius={'full'}
    fontSize={'xs'}
    isLoading={isLoading}
    isDisabled={isDisabled}
    _focusVisible={{ bg: 'myGray.50', boxShadow: 'none', outline: 'none' }}
    _active={{ transform: 'none' }}
    onClick={onClick}
  >
    {label}
  </Button>
);

type AgentAskOptionButtonProps = {
  option: AgentAskOption;
  index: number;
  isSelected: boolean;
  isDisabled: boolean;
  optionRef: (element: HTMLButtonElement | null) => void;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

const AgentAskOptionButton = ({
  option,
  index,
  isSelected,
  isDisabled,
  optionRef,
  onSelect,
  onKeyDown
}: AgentAskOptionButtonProps) => (
  <Box role={'group'}>
    <Button
      ref={optionRef}
      variant={'unstyled'}
      display={'flex'}
      flexDirection={'row'}
      flexWrap={'nowrap'}
      alignItems={'center'}
      minH={'40px'}
      h={'auto'}
      w={'100%'}
      justifyContent={'space-between'}
      gap={3}
      p={2}
      border={'1px solid'}
      borderColor={isSelected ? 'primary.300' : 'transparent'}
      borderRadius={'21px'}
      bg={isSelected ? 'primary.50' : 'transparent'}
      textAlign={'left'}
      _hover={
        isSelected ? { bg: 'primary.50', borderColor: 'primary.300' } : { bg: 'blackAlpha.50' }
      }
      _focusVisible={{
        ...(isSelected
          ? { bg: 'primary.50', borderColor: 'primary.300' }
          : { bg: 'blackAlpha.50' }),
        boxShadow: 'none',
        outline: 'none',
        '& > svg': { opacity: 1 }
      }}
      _active={{ transform: 'none' }}
      isDisabled={isDisabled}
      _disabled={isSelected ? { opacity: 1 } : undefined}
      onKeyDown={onKeyDown}
      onClick={onSelect}
      aria-pressed={isSelected}
    >
      <Flex minW={0} alignItems={'center'} gap={2}>
        <Flex
          flexShrink={0}
          alignItems={'center'}
          justifyContent={'center'}
          w={6}
          h={6}
          borderRadius={'full'}
          bg={isSelected ? 'primary.600' : 'myGray.50'}
          color={isSelected ? 'myGray.100' : 'myGray.600'}
          fontSize={'sm'}
          fontWeight={500}
        >
          {index + 1}
        </Flex>
        <Box minW={0} whiteSpace={'pre-wrap'} wordBreak={'break-word'}>
          <Box as={'span'} fontWeight={500} color={'myGray.900'}>
            {option.summary}
          </Box>
          {option.summary !== option.value && (
            <Box as={'span'} color={'myGray.600'}>
              {` ${option.value}`}
            </Box>
          )}
        </Box>
      </Flex>
      <MyIcon
        name={'common/arrowRight'}
        alignSelf={'center'}
        flexShrink={0}
        w={4}
        h={4}
        color={'myGray.400'}
        opacity={isSelected ? 1 : 0}
        _groupHover={{ opacity: 1 }}
      />
    </Button>
  </Box>
);

/** 渲染统一的 Agent Ask 问题，并按题目顺序提交回答值。 */
const AgentAskComposer = ({
  questions,
  onSubmit
}: {
  questions: AgentAskQuestionInteractive[];
  onSubmit: (answers: string[]) => void;
}) => {
  const { t } = useTranslation();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [selectedOptionIndexes, setSelectedOptionIndexes] = useState<Record<string, number>>({});
  const [customValues, setCustomValues] = useState<Answers>({});
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQuestionVisible, setIsQuestionVisible] = useState(true);
  const [isQuestionTransitioning, setIsQuestionTransitioning] = useState(false);
  const [contentHeight, setContentHeight] = useState<number>();
  const contentRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const questionTransitionTimer = useRef<ReturnType<typeof setTimeout>>();
  const updateContentHeight = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;

    const previousHeight = content.style.height;
    content.style.height = 'auto';
    const nextHeight = content.offsetHeight;
    content.style.height = previousHeight;

    if (nextHeight) setContentHeight(nextHeight);
  }, []);

  // Ask 覆盖普通输入区时，焦点始终从当前题的第一个选项开始。
  useEffect(() => {
    optionRefs.current[0]?.focus();
  }, [questionIndex]);

  useEffect(() => {
    return () => {
      if (questionTransitionTimer.current) clearTimeout(questionTransitionTimer.current);
    };
  }, []);

  useLayoutEffect(() => {
    updateContentHeight();
  }, [editingQuestionIndex, questionIndex, updateContentHeight]);

  const question = questions[questionIndex];
  if (!question) return null;

  const questionKey = String(questionIndex);
  const answer = answers[questionKey] ?? '';
  const selectedOptionIndex = selectedOptionIndexes[questionKey];
  const customValue = customValues[questionKey] ?? '';
  const isCustom = !!answer && selectedOptionIndex === undefined;
  const isEditingCustom = editingQuestionIndex === questionIndex;
  const isAnswerValid = !!answer;
  const isLastQuestion = questionIndex === questions.length - 1;

  const changeQuestion = (nextQuestionIndex: number, delay = false) => {
    if (isQuestionTransitioning || nextQuestionIndex === questionIndex) return;

    setIsQuestionTransitioning(true);
    const startTransition = () => {
      setIsQuestionVisible(false);
      questionTransitionTimer.current = setTimeout(() => {
        setQuestionIndex(nextQuestionIndex);
        setIsQuestionVisible(true);
        setIsQuestionTransitioning(false);
      }, 200);
    };

    if (delay) {
      questionTransitionTimer.current = setTimeout(startTransition, 200);
      return;
    }
    startTransition();
  };

  const submit = (nextAnswers = answers) => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    onSubmit(questions.map((_, index) => nextAnswers[String(index)] ?? ''));
  };
  const goNext = (
    nextAnswer: string,
    delayTransition = false,
    nextSelectedOptionIndex?: number
  ) => {
    const nextAnswers = { ...answers, [questionKey]: nextAnswer };
    setAnswers(nextAnswers);
    setSelectedOptionIndexes((indexes) => {
      const nextIndexes = { ...indexes };
      if (nextSelectedOptionIndex === undefined) {
        delete nextIndexes[questionKey];
      } else {
        nextIndexes[questionKey] = nextSelectedOptionIndex;
      }
      return nextIndexes;
    });
    setEditingQuestionIndex(undefined);

    if (isLastQuestion) {
      submit(nextAnswers);
      return;
    }
    changeQuestion(questionIndex + 1, delayTransition);
  };
  const skipOrAdvance = () => goNext(isCustom && customValue.trim() ? customValue.trim() : '');
  const skipAll = () => submit({});
  const selectCustom = () => {
    setEditingQuestionIndex(questionIndex);
    setAnswers((answers) => ({ ...answers, [questionKey]: customValue }));
    setSelectedOptionIndexes((indexes) => {
      const nextIndexes = { ...indexes };
      delete nextIndexes[questionKey];
      return nextIndexes;
    });
  };
  const resizeCustomTextarea = (textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return;

    textarea.style.height = '40px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 116)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 116 ? 'auto' : 'hidden';

    updateContentHeight();
  };
  const actionLabel =
    isCustom && customValue.trim()
      ? isLastQuestion
        ? t('common:Submit')
        : t('common:next_step')
      : t('chat:interactive.agent_ask.skip');
  const isInputDisabled = isSubmitting || isQuestionTransitioning;
  const advanceButton = (
    <AgentAskAdvanceButton
      label={actionLabel}
      isLoading={isSubmitting}
      isDisabled={isInputDisabled}
      onClick={skipOrAdvance}
    />
  );
  const isPreviousDisabled = questionIndex === 0 || isSubmitting || isQuestionTransitioning;
  const isNextDisabled =
    isSubmitting || isQuestionTransitioning || (isLastQuestion && !isAnswerValid);

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
      ref={contentRef}
      h={contentHeight ? `${contentHeight}px` : undefined}
      overflow={'hidden'}
      transition={'height 0.2s ease'}
    >
      <Flex alignItems={'center'} justifyContent={'space-between'} gap={4} px={1} mb={4}>
        <Box
          minW={0}
          color={'myGray.900'}
          fontSize={'md'}
          fontWeight={500}
          lineHeight={6}
          opacity={isQuestionVisible ? 1 : 0}
          transition={'opacity 0.2s ease'}
        >
          {question.question}
        </Box>
        <AgentAskNavigation
          questionIndex={questionIndex}
          questionCount={questions.length}
          isPreviousDisabled={isPreviousDisabled}
          isNextDisabled={isNextDisabled}
          isDisabled={isInputDisabled}
          onPrevious={() => {
            setEditingQuestionIndex(undefined);
            changeQuestion(questionIndex - 1);
          }}
          onNext={() => {
            setEditingQuestionIndex(undefined);
            if (isLastQuestion) {
              goNext(answer);
              return;
            }
            changeQuestion(questionIndex + 1);
          }}
          onSkipAll={skipAll}
        />
      </Flex>

      <Flex
        direction={'column'}
        gap={1}
        opacity={isQuestionVisible ? 1 : 0}
        transition={'opacity 0.2s ease'}
      >
        {question.options.map((option, index) => {
          const isSelected = selectedOptionIndex === index;

          return (
            <AgentAskOptionButton
              key={index}
              option={option}
              index={index}
              isSelected={isSelected}
              isDisabled={isInputDisabled}
              optionRef={(element) => {
                optionRefs.current[index] = element;
              }}
              onSelect={() => goNext(option.value, true, index)}
              onKeyDown={(event) => {
                const lastOptionIndex = question.options.length - 1;
                const nextIndex = (() => {
                  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                    return Math.min(index + 1, lastOptionIndex);
                  }
                  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                    return Math.max(index - 1, 0);
                  }
                  if (event.key === 'Home') return 0;
                  if (event.key === 'End') return lastOptionIndex;
                })();
                if (nextIndex === undefined || nextIndex === index) return;

                event.preventDefault();
                optionRefs.current[nextIndex]?.focus();
              }}
            />
          );
        })}

        {isEditingCustom ? (
          <Flex
            alignItems={'center'}
            flexWrap={'nowrap'}
            gap={2}
            pl={2}
            minW={0}
            minH={'42px'}
            borderRadius={'21px'}
          >
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
              color={'myGray.900'}
              fontSize={'sm'}
              lineHeight={5}
              value={customValue}
              aria-label={t('chat:interactive.agent_ask.custom_answer')}
              onChange={(event) => {
                resizeCustomTextarea(event.currentTarget);
                const value = event.currentTarget.value;
                setCustomValues((values) => ({ ...values, [questionKey]: value }));
                setAnswers((answers) => ({ ...answers, [questionKey]: value }));
                setSelectedOptionIndexes((indexes) => {
                  const nextIndexes = { ...indexes };
                  delete nextIndexes[questionKey];
                  return nextIndexes;
                });
              }}
            />
            {advanceButton}
          </Flex>
        ) : (
          <Flex alignItems={'center'} gap={2} minW={0} minH={'42px'}>
            <Button
              variant={'unstyled'}
              display={'flex'}
              flex={'1 0 0'}
              flexDirection={'row'}
              flexWrap={'nowrap'}
              alignItems={'center'}
              minW={0}
              h={'auto'}
              minH={'40px'}
              justifyContent={'flex-start'}
              gap={2}
              p={2}
              borderRadius={'21px'}
              bg={isCustom ? 'primary.50' : 'transparent'}
              border={'1px solid'}
              borderColor={isCustom ? 'primary.300' : 'transparent'}
              textAlign={'left'}
              _hover={
                isCustom
                  ? { bg: 'primary.50', borderColor: 'primary.300' }
                  : { bg: 'blackAlpha.50' }
              }
              _focusVisible={{
                bg: isCustom ? 'primary.50' : 'blackAlpha.50',
                borderColor: isCustom ? 'primary.300' : 'transparent',
                boxShadow: 'none',
                outline: 'none'
              }}
              _active={{ transform: 'none' }}
              isDisabled={isSubmitting || isQuestionTransitioning}
              onClick={selectCustom}
            >
              <Flex
                flexShrink={0}
                alignItems={'center'}
                justifyContent={'center'}
                w={6}
                h={6}
                borderRadius={'full'}
                bg={isCustom ? 'primary.600' : 'myGray.50'}
                color={isCustom ? 'myGray.100' : 'myGray.600'}
              >
                <MyIcon name={'common/edit'} w={'14px'} h={'14px'} />
              </Flex>
              <Box
                minW={0}
                color={isCustom ? 'myGray.900' : 'myGray.600'}
                whiteSpace={'pre-wrap'}
                wordBreak={'break-word'}
              >
                {customValue || t('chat:interactive.agent_ask.custom_answer')}
              </Box>
            </Button>
            {advanceButton}
          </Flex>
        )}
      </Flex>
    </Box>
  );
};

export default AgentAskComposer;
