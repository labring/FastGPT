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
  HStack
} from '@chakra-ui/react';
import type {
  AIChatItemValueItemType,
  StepTitleItemType,
  ToolModuleResponseItemType
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
import { type OnOpenCiteModalProps } from '@/web/core/chat/context/chatItemContext';
import { WorkflowRuntimeContext } from '../ChatContainer/context/workflowRuntimeContext';
import { useCreation } from 'ahooks';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import Icon from '@fastgpt/web/components/common/Icon';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';

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

const RenderResoningContent = React.memo(function RenderResoningContent({
  content,
  isChatting,
  isLastResponseValue
}: {
  content: string;
  isChatting: boolean;
  isLastResponseValue: boolean;
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
          <Markdown source={content} showAnimation={showAnimation} />
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
});
const RenderText = React.memo(function RenderText({
  showAnimation,
  text,
  chatItemDataId,
  onOpenCiteModal
}: {
  showAnimation: boolean;
  text: string;
  chatItemDataId: string;
  onOpenCiteModal?: (e?: OnOpenCiteModalProps) => void;
}) {
  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);

  const source = useMemo(() => {
    if (!text) return '';

    // Remove quote references if not showing response detail
    return text;
  }, [text]);

  const chatAuthData = useCreation(() => {
    return { appId, chatId, chatItemDataId, ...outLinkAuthData };
  }, [appId, chatId, chatItemDataId, outLinkAuthData]);

  return (
    <Markdown
      source={source}
      showAnimation={showAnimation}
      chatAuthData={chatAuthData}
      onOpenCiteModal={onOpenCiteModal}
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
  chatItemDataId
}: {
  interactive: UserInputInteractive;
  chatItemDataId: string;
}) {
  const { t } = useTranslation();

  const defaultValues = useMemo(() => {
    return interactive.params.inputForm?.reduce((acc: Record<string, any>, item, index) => {
      // 使用 ?? 运算符，只有 undefined 或 null 时才使用 defaultValue
      acc[item.key] = item.value ?? item.defaultValue;
      return acc;
    }, {});
  }, [interactive]);

  const handleFormSubmit = useCallback(
    (data: Record<string, any>) => {
      const finalData: Record<string, any> = {};
      interactive.params.inputForm?.forEach((item, index) => {
        if (item.key in data) {
          finalData[item.key] = data[item.key];
        }
      });

      if (typeof window !== 'undefined') {
        const dataToSave = { ...data };
        interactive.params.inputForm?.forEach((item) => {
          // 这是干啥的？
          if (
            item.type === 'fileSelect' &&
            Array.isArray(dataToSave[item.key]) &&
            dataToSave[item.key].length > 0
          ) {
            const files = dataToSave[item.key];
            if (files[0]?.url !== undefined) {
              dataToSave[item.key] = files
                .map((file: any) => ({
                  url: file.url,
                  key: file.key,
                  name: file.name,
                  type: file.type
                }))
                .filter((file: any) => file.url);
            }
          }
        });
        sessionStorage.setItem(`interactiveForm_${chatItemDataId}`, JSON.stringify(dataToSave));
      }

      onSendPrompt(JSON.stringify(finalData));
    },
    [interactive.params.inputForm, chatItemDataId]
  );

  return (
    <Flex flexDirection={'column'} gap={2} minW={'250px'}>
      <FormInputComponent
        interactiveParams={interactive.params}
        defaultValues={defaultValues}
        chatItemDataId={chatItemDataId}
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
const RenderPlan = React.memo(function RenderPlan({ plan }: { plan: AgentPlanType }) {
  const { t } = useTranslation();

  return (
    <Box border={'base'} bg={'white'} overflow={'hidden'} borderRadius={'md'} w={'full'}>
      <Flex alignItems={'center'} px={4} py={3} bg={'myGray.50'} borderBottom={'base'}>
        <MyIcon name={'common/list'} w={'1rem'} mr={2} color={'myGray.600'} />
        <Box fontWeight={'bold'} fontSize={'sm'} flex={1}>
          {plan.task || '-'}
        </Box>
        {plan.replan && (
          <Flex alignItems={'center'} gap={1.5} px={2.5} py={1} bg="orange.50" borderRadius="sm">
            <MyIcon name={'core/plan/continuePlan'} w={'0.875rem'} color={'orange.600'} />
            <Box fontSize="xs" color="orange.700" fontWeight="medium">
              {t('chat:agent_plan_continue')}
            </Box>
          </Flex>
        )}
      </Flex>
      <Box px={4} py={4}>
        <Flex direction="column" gap={0}>
          {plan.steps.map((step, index) => (
            <Flex key={step.id} gap={3} position="relative">
              {/* Left side: dot and line */}
              <Flex direction="column" alignItems="center" position="relative">
                {/* Dot */}
                <Box
                  w="10px"
                  h="10px"
                  borderRadius="full"
                  border="2px solid"
                  borderColor="primary.600"
                  flexShrink={0}
                  mt={1.5}
                />
                {/* Connecting line */}
                {index < plan.steps.length - 1 && (
                  <Box w="1.5px" h="100%" bg="myGray.250" mb={-1} flexGrow={1} minH="20px" />
                )}
              </Flex>

              {/* Right side: content */}
              <Box flex={1} pb={index < plan.steps.length - 1 ? 3 : 0}>
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
          ))}
        </Flex>
      </Box>
    </Box>
  );
});
const RenderStepTitle = React.memo(function RenderStepTitle({
  chatItemDataId,
  step
}: {
  chatItemDataId: string;
  step: StepTitleItemType;
}) {
  const setChatRecords = useContextSelector(ChatRecordContext, (v) => v.setChatRecords);
  const folded = step.folded ?? true;

  return (
    <HStack
      pt={2}
      pb={folded ? 0 : 2}
      fontSize={'lg'}
      userSelect={'none'}
      cursor={'pointer'}
      onClick={() => {
        setChatRecords((prev) => {
          return prev.map((item) => {
            if (item.dataId === chatItemDataId && item.obj === ChatRoleEnum.AI) {
              return {
                ...item,
                value: item.value.map((value) => {
                  if (value.stepTitle?.stepId === step.stepId) {
                    return {
                      ...value,
                      stepTitle: {
                        ...value.stepTitle,
                        folded: !folded
                      }
                    };
                  }
                  return value;
                })
              };
            }
            return item;
          });
        });
      }}
    >
      <Box
        w={'10px'}
        h={'10px'}
        borderRadius={'full'}
        border={'2px solid'}
        borderColor={'primary.600'}
      ></Box>
      <Box fontWeight={'bold'}>{step.title}</Box>
      <Icon
        name={'common/leftArrowLight'}
        w={'1rem'}
        h={'1rem'}
        transition={'transform 0.2s ease-in-out'}
        transform={folded ? 'rotate(90deg)' : 'rotate(-90deg)'}
      />
    </HStack>
  );
});

const AIResponseBox = ({
  chatItemDataId,
  value,
  isLastResponseValue,
  isChatting,
  onOpenCiteModal
}: {
  chatItemDataId: string;
  value: AIChatItemValueItemType;
  isLastResponseValue: boolean;
  isChatting: boolean;
  onOpenCiteModal?: (e?: OnOpenCiteModalProps) => void;
}) => {
  if ('text' in value && value.text) {
    return (
      <RenderText
        chatItemDataId={chatItemDataId}
        showAnimation={isChatting && isLastResponseValue}
        text={value.text.content}
        onOpenCiteModal={onOpenCiteModal}
      />
    );
  }
  if ('reasoning' in value && value.reasoning) {
    return (
      <RenderResoningContent
        isChatting={isChatting}
        isLastResponseValue={isLastResponseValue}
        content={value.reasoning.content}
      />
    );
  }
  if ('tool' in value && value.tool) {
    return <RenderTool showAnimation={isChatting} tool={value.tool} />;
  }
  if ('interactive' in value && value.interactive) {
    const interactive = extractDeepestInteractive(value.interactive);
    if (interactive.type === 'userSelect' || interactive.type === 'agentPlanAskUserSelect') {
      return <RenderUserSelectInteractive interactive={interactive} />;
    }
    if (interactive.type === 'userInput' || interactive.type === 'agentPlanAskUserForm') {
      return (
        <RenderUserFormInteractive interactive={interactive} chatItemDataId={chatItemDataId} />
      );
    }
    if (interactive.type === 'agentPlanCheck') {
      return null;
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
  if ('stepTitle' in value && value.stepTitle) {
    return <RenderStepTitle chatItemDataId={chatItemDataId} step={value.stepTitle} />;
  }

  // Abandon
  if ('tools' in value && value.tools) {
    return value.tools.map((tool) => (
      <Box key={tool.id} _notLast={{ mb: 2 }}>
        <RenderTool showAnimation={isChatting} tool={tool} />
      </Box>
    ));
  }
  return null;
};
export default React.memo(AIResponseBox);
