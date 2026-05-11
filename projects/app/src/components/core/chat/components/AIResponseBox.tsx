import Markdown from '@/components/Markdown';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Button,
  Flex,
  HStack,
  SkeletonText
} from '@chakra-ui/react';
import type {
  AIChatItemValueItemType,
  ToolModuleResponseItemType,
  SkillModuleResponseItemType
} from '@fastgpt/global/core/chat/type';
import React, { useCallback, useMemo } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type {
  InteractiveBasicType,
  PaymentPauseInteractive,
  UserInputInteractive,
  UserSelectInteractive
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { isEqual } from 'lodash';
import { useTranslation } from 'next-i18next';
import { eventBus, EventNameEnum } from '@/web/common/utils/eventbus';
import { SelectOptionsComponent, FormInputComponent } from './Interactive/InteractiveComponents';
import { extractDeepestInteractive } from '@fastgpt/global/core/workflow/runtime/utils';
import { useContextSelector } from 'use-context-selector';
import {
  type OnOpenCiteModalProps,
  ChatItemContext
} from '@/web/core/chat/context/chatItemContext';
import { WorkflowRuntimeContext } from '../ChatContainer/context/workflowRuntimeContext';
import { useCreation } from 'ahooks';
import { removeDatasetCiteText } from '@fastgpt/global/core/ai/llm/utils';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import type { AgentPlanStatusType, AgentPlanType } from '@fastgpt/global/core/ai/agent/type';

const accordionButtonStyle = {
  w: 'auto',
  bg: 'white',
  borderRadius: 'md',
  borderWidth: '1px',
  borderColor: 'myGray.200',
  boxShadow: '1',
  pl: 3,
  pr: 2.5,
  _hover: {
    bg: 'auto'
  }
};

const planStepStatusStyle: Record<
  AgentPlanType['steps'][number]['status'],
  { dot: string; line?: string }
> = {
  pending: {
    dot: 'myGray.300'
  },
  in_progress: {
    dot: 'blue.500',
    line: 'blue.200'
  },
  done: {
    dot: 'green.500'
  },
  blocked: {
    dot: 'red.500'
  },
  skipped: {
    dot: 'orange.400'
  }
};

const planStepPulseAfterStyle = {
  content: '""',
  position: 'absolute',
  inset: '-6px',
  borderRadius: 'full',
  border: '2px solid',
  borderColor: 'blue.300',
  animation: 'planStepPulse 1.4s ease-out infinite'
};

const planStepPulseSx = {
  '@keyframes planStepPulse': {
    '0%': {
      transform: 'scale(0.45)',
      opacity: 0.75
    },
    '100%': {
      transform: 'scale(1.4)',
      opacity: 0
    }
  }
};

const RenderResoningContent = React.memo(function RenderResoningContent({
  content,
  isChatting,
  isLastResponseValue,
  isDisabled
}: {
  content: string;
  isChatting: boolean;
  isLastResponseValue: boolean;
  isDisabled?: boolean;
}) {
  const { t } = useTranslation();
  const showAnimation = isChatting && isLastResponseValue;

  return (
    <Accordion allowToggle defaultIndex={isLastResponseValue ? 0 : undefined}>
      <AccordionItem borderTop={'none'} borderBottom={'none'}>
        <AccordionButton {...accordionButtonStyle} py={1}>
          <HStack mr={2} spacing={1}>
            <MyIcon name={'core/chat/think'} w={'0.85rem'} />
            <Box fontSize={'sm'}>{t('chat:ai_reasoning')}</Box>
          </HStack>

          {showAnimation && <MyIcon name={'common/loading'} w={'0.85rem'} />}
          <AccordionIcon color={'myGray.600'} ml={5} />
        </AccordionButton>
        <AccordionPanel
          py={0}
          pr={0}
          pl={3}
          mt={2}
          borderLeft={'2px solid'}
          borderColor={'myGray.300'}
          color={'myGray.500'}
        >
          <Markdown source={content} showAnimation={showAnimation} isDisabled={isDisabled} />
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
});
const RenderText = React.memo(function RenderText({
  showAnimation,
  text,
  chatItemDataId,
  onOpenCiteModal,
  isDisabled
}: {
  showAnimation: boolean;
  text: string;
  chatItemDataId: string;
  onOpenCiteModal?: (e?: OnOpenCiteModalProps) => void;
  isDisabled?: boolean;
}) {
  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const isShowCite = useContextSelector(ChatItemContext, (v) => v.isShowCite);

  const source = useMemo(() => {
    if (!text) return '';

    if (isShowCite) {
      return text;
    }
    return removeDatasetCiteText(text, isShowCite);
  }, [text, isShowCite]);

  const chatAuthData = useCreation(() => {
    return { appId, chatId, chatItemDataId, ...outLinkAuthData };
  }, [appId, chatId, chatItemDataId, outLinkAuthData]);

  return (
    <Markdown
      source={source}
      showAnimation={showAnimation}
      chatAuthData={chatAuthData}
      onOpenCiteModal={onOpenCiteModal}
      isDisabled={isDisabled}
    />
  );
});

const RenderTool = React.memo(
  function RenderTool({
    showAnimation,
    tool
  }: {
    showAnimation: boolean;
    tool: ToolModuleResponseItemType;
  }) {
    const { t } = useSafeTranslation();
    const formatJson = useCallback((string: string) => {
      try {
        return JSON.stringify(JSON.parse(string), null, 2);
      } catch (error) {
        return string;
      }
    }, []);
    const params = useMemo(() => formatJson(tool.params), [formatJson, tool.params]);
    const response = useMemo(() => formatJson(tool.response || ''), [formatJson, tool.response]);

    return (
      <Accordion allowToggle>
        <AccordionItem borderTop={'none'} borderBottom={'none'}>
          <AccordionButton {...accordionButtonStyle}>
            <Avatar src={tool.toolAvatar} w={'1.25rem'} h={'1.25rem'} borderRadius={'sm'} />
            <Box mx={2} fontSize={'sm'} color={'myGray.900'}>
              {t(tool.toolName)}
            </Box>
            {showAnimation && tool.response === undefined && (
              <MyIcon name={'common/loading'} w={'14px'} />
            )}
            <AccordionIcon color={'myGray.600'} ml={5} />
          </AccordionButton>
          <AccordionPanel
            py={0}
            px={0}
            mt={3}
            borderRadius={'md'}
            overflow={'hidden'}
            maxH={'500px'}
            overflowY={'auto'}
          >
            {params && params !== '{}' && (
              <Box mb={3}>
                <Markdown
                  source={`~~~json#Input
${params}`}
                />
              </Box>
            )}
            {response && (
              <Markdown
                source={`~~~json#Response
${response}`}
              />
            )}
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    );
  },
  (prevProps, nextProps) => isEqual(prevProps, nextProps)
);

const RenderSkill = React.memo(
  function RenderSkill({ skill }: { skill: SkillModuleResponseItemType }) {
    return (
      <Accordion allowToggle>
        <AccordionItem borderTop={'none'} borderBottom={'none'}>
          <AccordionButton {...accordionButtonStyle}>
            <Avatar src={skill.skillAvatar} w={'1.25rem'} h={'1.25rem'} borderRadius={'sm'} />
            <Box mx={2} fontSize={'sm'} color={'myGray.900'}>
              {skill.skillName}
            </Box>
            <AccordionIcon color={'myGray.600'} ml={5} />
          </AccordionButton>
          <AccordionPanel
            py={0}
            px={0}
            mt={3}
            borderRadius={'md'}
            overflow={'hidden'}
            maxH={'500px'}
            overflowY={'auto'}
          >
            {skill.description && (
              <Box mb={3} fontSize={'xs'} color={'myGray.500'} px={3}>
                {skill.description}
              </Box>
            )}
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    );
  },
  (prevProps, nextProps) => isEqual(prevProps, nextProps)
);

const onSendPrompt = (text: string) =>
  eventBus.emit(EventNameEnum.sendQuestion, {
    text,
    focus: true
  });
const RenderUserSelectInteractive = React.memo(function RenderInteractive({
  interactive
}: {
  interactive: UserSelectInteractive;
}) {
  return (
    <SelectOptionsComponent
      interactiveParams={interactive.params}
      onSelect={(value) => {
        onSendPrompt(value);
      }}
    />
  );
});
const RenderUserFormInteractive = React.memo(function RenderFormInput({
  interactive,
  chatItemDataId,
  isLastChild
}: {
  interactive: UserInputInteractive;
  chatItemDataId: string;
  isLastChild: boolean;
}) {
  const { t } = useTranslation();

  const defaultValues = useMemo(() => {
    return interactive.params.inputForm?.reduce((acc: Record<string, any>, item) => {
      // 使用 ?? 运算符，只有 undefined 或 null 时才使用 defaultValue
      acc[item.key] = item.value ?? item.defaultValue;
      return acc;
    }, {});
  }, [interactive]);

  const handleFormSubmit = useCallback(
    (data: Record<string, any>) => {
      const finalData: Record<string, any> = {};
      interactive.params.inputForm?.forEach((item) => {
        if (item.key in data) {
          finalData[item.key] = data[item.key];
        }
      });

      onSendPrompt(JSON.stringify(finalData));
    },
    [interactive.params.inputForm]
  );

  return (
    <Flex flexDirection={'column'} gap={2} minW={'250px'}>
      <FormInputComponent
        interactiveParams={{
          ...interactive.params,
          // 如果不是最后一条消息，此时不能再提交了。
          submitted: interactive.params.submitted || !isLastChild
        }}
        defaultValues={defaultValues}
        SubmitButton={({ onSubmit, isFileUploading }) => (
          <Button
            onClick={() => onSubmit(handleFormSubmit)()}
            isDisabled={isFileUploading}
            isLoading={isFileUploading}
          >
            {t('common:Submit')}
          </Button>
        )}
      />
    </Flex>
  );
});
const RenderPaymentPauseInteractive = React.memo(function RenderPaymentPauseInteractive({
  interactive
}: {
  interactive: InteractiveBasicType & PaymentPauseInteractive;
}) {
  const { t } = useTranslation();

  return interactive.params.continue ? (
    <Box>{t('chat:task_has_continued')}</Box>
  ) : (
    <>
      <Box color={'myGray.500'}>{t(interactive.params.description)}</Box>
      <Button
        maxW={'250px'}
        onClick={() => {
          onSendPrompt('Continue');
        }}
      >
        {t('chat:continue_run')}
      </Button>
    </>
  );
});

const RenderPlanStatus = React.memo(function RenderPlanStatus({
  planStatus
}: {
  planStatus: AgentPlanStatusType;
}) {
  const { t } = useTranslation();
  const title =
    planStatus.status === 'updating'
      ? t('chat:agent_plan_updating')
      : t('chat:agent_plan_generating');

  return (
    <Box border={'base'} bg={'white'} overflow={'hidden'} borderRadius={'md'} w={'full'}>
      <Flex alignItems={'center'} px={4} py={3} bg={'myGray.50'} borderBottom={'base'}>
        <Box fontWeight={'bold'} fontSize={'sm'} color={'myGray.700'}>
          {title}
        </Box>
      </Flex>
      <Box px={4} py={4}>
        <Flex direction="column" gap={4}>
          {[0, 1, 2].map((item) => (
            <Flex key={item} gap={3}>
              <Flex direction="column" alignItems="center">
                <Box
                  w="10px"
                  h="10px"
                  borderRadius="full"
                  border="2px solid"
                  borderColor="myGray.200"
                  bg="white"
                  mt={1.5}
                />
                {item < 2 && <Box w="1.5px" h="34px" bg="myGray.200" mt={1} />}
              </Flex>
              <Box flex={1} minW={0}>
                <SkeletonText noOfLines={2} spacing={2} skeletonHeight="10px" />
              </Box>
            </Flex>
          ))}
        </Flex>
      </Box>
    </Box>
  );
});

const RenderPlan = React.memo(function RenderPlan({ plan }: { plan: AgentPlanType }) {
  return (
    <Box border={'base'} bg={'white'} overflow={'hidden'} borderRadius={'md'} w={'full'}>
      <Flex alignItems={'center'} px={4} py={3} bg={'myGray.50'} borderBottom={'base'}>
        <MyIcon name={'common/list'} w={'1rem'} mr={2} color={'myGray.600'} />
        <Box fontWeight={'bold'} fontSize={'sm'} flex={1}>
          {plan.task || '-'}
        </Box>
      </Flex>
      <Box px={4} py={4}>
        <Flex direction="column" gap={0}>
          {plan.steps.map((step, index) => {
            const style = planStepStatusStyle[step.status];

            return (
              <Flex key={step.id} gap={3}>
                <Flex direction="column" alignItems="center">
                  <Box
                    w="10px"
                    h="10px"
                    borderRadius="full"
                    border="2px solid"
                    borderColor={style.dot}
                    bg={style.dot}
                    flexShrink={0}
                    mt={1.5}
                    position="relative"
                    _after={step.status === 'in_progress' ? planStepPulseAfterStyle : undefined}
                    sx={step.status === 'in_progress' ? planStepPulseSx : undefined}
                  />
                  {index < plan.steps.length - 1 && (
                    <Box
                      w="1.5px"
                      h="100%"
                      bg={style.line ?? 'myGray.250'}
                      mb={-1}
                      flexGrow={1}
                      minH="28px"
                    />
                  )}
                </Flex>

                <Box flex={1} pb={index < plan.steps.length - 1 ? 4 : 0} minW={0}>
                  <Box fontSize="sm" fontWeight="medium" color="myGray.900">
                    {step.title}
                  </Box>
                  {step.description && (
                    <Box fontSize="xs" mt={1} color="myGray.500">
                      {step.description}
                    </Box>
                  )}
                </Box>
              </Flex>
            );
          })}
        </Flex>
      </Box>
    </Box>
  );
});
const AIResponseBox = ({
  chatItemDataId,
  value,
  isLastResponseValue,
  isLastChild,
  isChatting,
  onOpenCiteModal
}: {
  chatItemDataId: string;
  value: AIChatItemValueItemType;
  isLastResponseValue: boolean;
  isLastChild: boolean;
  isChatting: boolean;
  onOpenCiteModal?: (e?: OnOpenCiteModalProps) => void;
}) => {
  const showRunningStatus = useContextSelector(ChatItemContext, (v) => v.showRunningStatus);
  const showSkillReferences = useContextSelector(ChatItemContext, (v) => v.showSkillReferences);
  const tools = value.tools || (value.tool ? [value.tool] : undefined);
  const disableStreamingInteraction = isChatting && isLastChild;
  const skills = value.skills;

  if ('text' in value && value.text) {
    return (
      <RenderText
        chatItemDataId={chatItemDataId}
        showAnimation={isChatting && isLastResponseValue}
        text={value.text.content}
        onOpenCiteModal={onOpenCiteModal}
        isDisabled={disableStreamingInteraction}
      />
    );
  }
  if ('reasoning' in value && value.reasoning) {
    return (
      <RenderResoningContent
        isChatting={isChatting}
        isLastResponseValue={isLastResponseValue}
        content={value.reasoning.content}
        isDisabled={disableStreamingInteraction}
      />
    );
  }
  if (tools && showRunningStatus) {
    return tools.map((tool) => (
      <Box key={tool.id} _notLast={{ mb: 2 }}>
        <RenderTool showAnimation={isChatting} tool={tool} />
      </Box>
    ));
  }
  if (skills && showSkillReferences && showRunningStatus) {
    return skills.map((skill) => (
      <Box key={skill.id} _notLast={{ mb: 2 }}>
        <RenderSkill skill={skill} />
      </Box>
    ));
  }
  if ('interactive' in value && value.interactive) {
    const interactive = extractDeepestInteractive(value.interactive);
    if (interactive.type === 'userSelect') {
      return <RenderUserSelectInteractive interactive={interactive} />;
    }
    if (interactive.type === 'userInput') {
      return (
        <RenderUserFormInteractive
          interactive={interactive}
          chatItemDataId={chatItemDataId}
          isLastChild={isLastChild}
        />
      );
    }
    if (interactive.type === 'agentPlanAskQuery') {
      return <Box>{interactive.params.content}</Box>;
    }
    if (interactive.type === 'paymentPause') {
      return <RenderPaymentPauseInteractive interactive={interactive} />;
    }
  }
  if ('plan' in value && value.plan) {
    return <RenderPlan plan={value.plan} />;
  }
  if ('planStatus' in value && value.planStatus) {
    return <RenderPlanStatus planStatus={value.planStatus} />;
  }

  return null;
};
export default React.memo(AIResponseBox);
