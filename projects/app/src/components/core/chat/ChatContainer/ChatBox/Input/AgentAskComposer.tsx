import { Box, Button, Flex, Textarea, useColorMode } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { AgentAskQuestionInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useTranslation } from 'next-i18next';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

type Answers = Record<string, string>;
type AgentAskOption = AgentAskQuestionInteractive['options'][number];

export type AgentAskAnswerDetail =
  | { kind: 'option'; value: string }
  | { kind: 'custom'; value: string }
  | { kind: 'skip' };

/** 将 Composer 内部答案状态转换为保留提交来源的结果，供需要区分选项和文本的调用方使用。 */
export const getAgentAskAnswerDetails = ({
  questions,
  answers,
  selectedOptionIndexes
}: {
  questions: AgentAskQuestionInteractive[];
  answers: Answers;
  selectedOptionIndexes: Record<string, number>;
}): AgentAskAnswerDetail[] =>
  questions.map((_, index) => {
    const questionKey = String(index);
    const value = answers[questionKey] ?? '';

    if (selectedOptionIndexes[questionKey] !== undefined) {
      return { kind: 'option', value };
    }
    if (value) {
      return { kind: 'custom', value };
    }
    return { kind: 'skip' };
  });

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
  const darkMode = useColorMode().colorMode === 'dark';

  return (
    <Flex flexShrink={0} alignItems={'center'} gap={3}>
      <Flex alignItems={'center'} gap={2}>
        <Button
          variant={'pagination'}
          className={'!h-6 !w-6 !rounded-full !p-0'}
          style={{ minWidth: '24px' }}
          w={6}
          h={6}
          minW={6}
          maxW={6}
          minH={6}
          maxH={6}
          borderRadius={'full'}
          p={0}
          bg={'myGray.150'}
          _hover={{ bg: 'myGray.150' }}
          _disabled={{ opacity: 0.5, bg: 'myGray.150' }}
          isDisabled={isPreviousDisabled}
          onClick={onPrevious}
          aria-label={t('chat:Previous')}
        >
          <MyIcon
            name={'common/leftArrowLight'}
            w={'6px'}
            color={darkMode ? undefined : '#262A32'}
          />
        </Button>
        <Box color={'myGray.500'} fontSize={'sm'} fontWeight={500} whiteSpace={'nowrap'}>
          {questionIndex + 1}
          <Box as={'span'} mx={1}>
            /
          </Box>
          <Box as={'span'} color={'myGray.900'}>
            {questionCount}
          </Box>
        </Box>
        <Button
          variant={'pagination'}
          className={'!h-6 !w-6 !rounded-full !p-0'}
          style={{ minWidth: '24px' }}
          w={6}
          h={6}
          minW={6}
          maxW={6}
          minH={6}
          maxH={6}
          borderRadius={'full'}
          p={0}
          bg={'myGray.150'}
          _hover={{ bg: 'myGray.150' }}
          _disabled={{ opacity: 0.5, bg: 'myGray.150' }}
          isDisabled={isNextDisabled}
          onClick={onNext}
          aria-label={t('chat:Next')}
        >
          <MyIcon name={'common/rightArrow'} w={'6px'} color={darkMode ? undefined : '#262A32'} />
        </Button>
      </Flex>
      <Button
        variant={'unstyled'}
        display={'flex'}
        alignItems={'center'}
        justifyContent={'center'}
        w={6}
        h={6}
        maxW={6}
        minH={6}
        maxH={6}
        minW={6}
        p={0}
        borderRadius={'full'}
        isDisabled={isDisabled}
        _hover={isDisabled ? undefined : { bg: 'myGray.50' }}
        _focusVisible={{ bg: 'myGray.50', boxShadow: 'none', outline: 'none' }}
        _active={{ transform: 'none' }}
        onClick={onSkipAll}
        aria-label={t('chat:interactive.agent_ask.skip_all')}
      >
        <MyIcon name={'common/closeLight'} w={'14px'} h={'14px'} />
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
  showOptionValue: boolean;
  optionRef: (element: HTMLButtonElement | null) => void;
  isTemporarilyFocused: boolean;
  onMouseEnter: () => void;
  onFocus: (() => void) | undefined;
  onBlur: (() => void) | undefined;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

const AgentAskOptionButton = ({
  option,
  index,
  isSelected,
  isDisabled,
  showOptionValue,
  optionRef,
  isTemporarilyFocused,
  onMouseEnter,
  onFocus,
  onBlur,
  onSelect,
  onKeyDown
}: AgentAskOptionButtonProps) => (
  <Box
    role={'group'}
    onMouseEnter={onMouseEnter}
    _focusWithin={
      isSelected ? undefined : { '& [data-agent-ask-option-index]': { bg: 'myGray.200' } }
    }
  >
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
      // transition={'background 0.15s ease, border-color 0.15s ease'}
      textAlign={'left'}
      _hover={isSelected ? { bg: 'primary.50', borderColor: 'primary.300' } : { bg: 'myGray.05' }}
      _focusVisible={{
        ...(isSelected ? { bg: 'primary.50', borderColor: 'primary.300' } : { bg: 'myGray.05' }),
        boxShadow: 'none',
        outline: 'none',
        '& > svg': { opacity: 1 }
      }}
      _active={{ transform: 'none' }}
      isDisabled={isDisabled}
      _disabled={isSelected ? { opacity: 1 } : undefined}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onClick={onSelect}
      aria-pressed={isSelected}
    >
      <Flex minW={0} alignItems={'center'} gap={2}>
        <Flex
          data-agent-ask-option-index
          flexShrink={0}
          alignItems={'center'}
          justifyContent={'center'}
          w={6}
          h={6}
          borderRadius={'full'}
          bg={isSelected ? 'primary.600' : isTemporarilyFocused ? 'myGray.200' : 'myGray.50'}
          // transition={'background 0.15s ease'}
          _groupHover={isSelected ? undefined : { bg: 'myGray.200' }}
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
          {showOptionValue && option.summary !== option.value && (
            <Box as={'span'} color={'myGray.600'} fontWeight={400}>
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
  onSubmit,
  customOptionLabel,
  customOptionPlaceholder,
  customAnswerRequired = false,
  showOptionValue = true
}: {
  questions: AgentAskQuestionInteractive[];
  onSubmit: (answers: string[], details: AgentAskAnswerDetail[]) => void;
  /**
   * 自定义答案行的展示文案与输入占位符（默认取 i18n 的 custom_answer）。
   * 供 workflow-builder 预览确认等场景把「文本输入动作」（如 revise）定制为自定义答案行。
   */
  customOptionLabel?: string;
  customOptionPlaceholder?: string;
  /**
   * 自定义答案为必填时，提交按钮恒为「提交」且空文本不可提交（默认允许跳过）。
   * 与 customAnswerRequired 组合保证必填意见场景不会提交空值。
   */
  customAnswerRequired?: boolean;
  /** 是否在选项文案后显示提交协议值，Workflow Builder 等内部枚举选项应关闭。 */
  showOptionValue?: boolean;
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
  const [isInitialFocusActive, setIsInitialFocusActive] = useState(false);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const initialFocusStatus = useRef<'pending' | 'active' | 'cleared'>('pending');
  const questionTransitionTimer = useRef<ReturnType<typeof setTimeout>>();

  const clearTemporaryInitialFocus = () => {
    if (initialFocusStatus.current === 'cleared') return;

    initialFocusStatus.current = 'cleared';
    setIsInitialFocusActive(false);
    optionRefs.current[0]?.blur();
  };

  useEffect(() => {
    if (initialFocusStatus.current !== 'pending') return;

    const firstOption = optionRefs.current[0];
    if (!firstOption) {
      initialFocusStatus.current = 'cleared';
      return;
    }

    initialFocusStatus.current = 'active';
    firstOption.focus();
    const frame = requestAnimationFrame(() => {
      if (initialFocusStatus.current === 'active') setIsInitialFocusActive(true);
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    return () => {
      if (questionTransitionTimer.current) clearTimeout(questionTransitionTimer.current);
    };
  }, []);

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
  const shouldTrimCustomAnswer = isCustom || isEditingCustom;

  const trimCurrentCustomAnswer = () => {
    if (!shouldTrimCustomAnswer) return answer;

    const trimmedAnswer = answer.trim();
    setAnswers((answers) => ({ ...answers, [questionKey]: trimmedAnswer }));
    setCustomValues((values) => ({ ...values, [questionKey]: trimmedAnswer }));
    return trimmedAnswer;
  };

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

  const submit = (nextAnswers = answers, nextSelectedOptionIndexes = selectedOptionIndexes) => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    onSubmit(
      questions.map((_, index) => nextAnswers[String(index)] ?? ''),
      getAgentAskAnswerDetails({
        questions,
        answers: nextAnswers,
        selectedOptionIndexes: nextSelectedOptionIndexes
      })
    );
  };
  const goNext = (
    nextAnswer: string,
    delayTransition = false,
    nextSelectedOptionIndex?: number
  ) => {
    clearTemporaryInitialFocus();
    const normalizedAnswer =
      nextSelectedOptionIndex === undefined && shouldTrimCustomAnswer
        ? nextAnswer.trim()
        : nextAnswer;
    const nextAnswers = { ...answers, [questionKey]: normalizedAnswer };
    setAnswers(nextAnswers);
    if (nextSelectedOptionIndex === undefined && shouldTrimCustomAnswer) {
      setCustomValues((values) => ({ ...values, [questionKey]: normalizedAnswer }));
    }
    const nextSelectedOptionIndexes = { ...selectedOptionIndexes };
    if (nextSelectedOptionIndex === undefined) {
      delete nextSelectedOptionIndexes[questionKey];
    } else {
      nextSelectedOptionIndexes[questionKey] = nextSelectedOptionIndex;
    }
    setSelectedOptionIndexes(nextSelectedOptionIndexes);
    setEditingQuestionIndex(undefined);

    if (isLastQuestion) {
      submit(nextAnswers, nextSelectedOptionIndexes);
      return;
    }
    changeQuestion(questionIndex + 1, delayTransition);
  };
  const skipOrAdvance = () => goNext(shouldTrimCustomAnswer ? customValue : '');
  const skipAll = () => {
    clearTemporaryInitialFocus();
    submit({}, {});
  };
  const selectCustom = () => {
    clearTemporaryInitialFocus();
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
  };
  const actionLabel =
    isCustom && customValue.trim()
      ? isLastQuestion
        ? t('common:Submit')
        : t('common:next_step')
      : customAnswerRequired
        ? t('common:Submit')
        : t('chat:interactive.agent_ask.skip');
  const isInputDisabled = isSubmitting || isQuestionTransitioning;
  // 必填自定义答案场景：无论是否处于 custom 编辑态，文本为空都禁止提交，避免提交空意见
  const isAdvanceDisabled = isInputDisabled || (customAnswerRequired && !customValue.trim());
  const advanceButton = (
    <AgentAskAdvanceButton
      label={actionLabel}
      isLoading={isSubmitting}
      isDisabled={isAdvanceDisabled}
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
      onPointerDown={clearTemporaryInitialFocus}
      overflow={'hidden'}
    >
      <Flex alignItems={'center'} justifyContent={'space-between'} gap={4} px={1} mb={4}>
        <Box
          minW={0}
          color={'myGray.900'}
          fontSize={'md'}
          fontWeight={500}
          lineHeight={6}
          opacity={isQuestionVisible ? 1 : 0}
          transition={'opacity 200ms ease'}
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
            clearTemporaryInitialFocus();
            trimCurrentCustomAnswer();
            setEditingQuestionIndex(undefined);
            changeQuestion(questionIndex - 1);
          }}
          onNext={() => {
            clearTemporaryInitialFocus();
            const nextAnswer = trimCurrentCustomAnswer();
            setEditingQuestionIndex(undefined);
            if (isLastQuestion) {
              goNext(nextAnswer);
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
        transition={'opacity 200ms ease'}
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
              showOptionValue={showOptionValue}
              isTemporarilyFocused={isInitialFocusActive && questionIndex === 0 && index === 0}
              optionRef={(element) => {
                optionRefs.current[index] = element;
              }}
              onMouseEnter={clearTemporaryInitialFocus}
              onFocus={index === 0 ? undefined : clearTemporaryInitialFocus}
              onBlur={index === 0 ? clearTemporaryInitialFocus : undefined}
              onSelect={() => goNext(option.value, true, index)}
              onKeyDown={(event) => {
                clearTemporaryInitialFocus();
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
            alignItems={'stretch'}
            flexWrap={'nowrap'}
            gap={2}
            pl={2}
            minW={0}
            minH={'42px'}
            h={'auto'}
            borderRadius={'21px'}
          >
            <Flex flex={'1 0 0'} minW={0} alignItems={'flex-start'} gap={2}>
              <Flex
                flexShrink={0}
                mt={'9px'}
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
                placeholder={customOptionPlaceholder}
                aria-label={customOptionLabel || t('chat:interactive.agent_ask.custom_answer')}
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
            </Flex>
            <Box alignSelf={'stretch'} alignItems={'flex-end'} display={'flex'}>
              <Box my={'5px'}>{advanceButton}</Box>
            </Box>
          </Flex>
        ) : (
          <Flex
            role={'group'}
            alignItems={'stretch'}
            gap={2}
            pr={1}
            w={'100%'}
            minW={0}
            minH={'42px'}
            h={isCustom ? 'auto' : '42px'}
            cursor={'text'}
            border={'1px solid'}
            borderColor={isCustom ? 'primary.300' : 'transparent'}
            borderRadius={'21px'}
            bg={isCustom ? 'primary.50' : 'transparent'}
            // transition={'background 0.15s ease, border-color 0.15s ease'}
            _hover={
              isCustom ? { bg: 'primary.50', borderColor: 'primary.300' } : { bg: 'myGray.05' }
            }
            _focusWithin={{
              bg: isCustom ? 'primary.50' : 'myGray.05',
              borderColor: isCustom ? 'primary.300' : 'transparent'
            }}
          >
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
              textAlign={'left'}
              _active={{ transform: 'none' }}
              isDisabled={isSubmitting || isQuestionTransitioning}
              onClick={selectCustom}
            >
              <Flex minW={0} alignItems={'center'} gap={2}>
                <Flex
                  flexShrink={0}
                  alignItems={'center'}
                  justifyContent={'center'}
                  w={6}
                  h={6}
                  borderRadius={'full'}
                  bg={isCustom ? 'primary.600' : 'myGray.50'}
                  // transition={'background 0.15s ease'}
                  _groupHover={isCustom ? undefined : { bg: 'myGray.200' }}
                  color={isCustom ? 'myGray.100' : 'myGray.600'}
                >
                  <MyIcon name={'common/edit'} w={'14px'} h={'14px'} />
                </Flex>
                <Box
                  minW={0}
                  color={isCustom ? 'myGray.900' : 'myGray.600'}
                  fontWeight={400}
                  lineHeight={5}
                  whiteSpace={'nowrap'}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  sx={{
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 1
                  }}
                >
                  {customValue ||
                    customOptionLabel ||
                    t('chat:interactive.agent_ask.custom_answer')}
                </Box>
              </Flex>
            </Button>
            <Box alignSelf={'stretch'}>
              <Box my={'4px'}>{advanceButton}</Box>
            </Box>
          </Flex>
        )}
      </Flex>
    </Box>
  );
};

export default AgentAskComposer;
