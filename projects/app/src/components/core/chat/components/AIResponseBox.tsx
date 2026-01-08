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
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import type {
  AIChatItemValueItemType,
  ToolModuleResponseItemType,
  UserChatItemValueItemType
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
    />
  );
});

const RenderTool = React.memo(
  function RenderTool({
    showAnimation,
    tools
  }: {
    showAnimation: boolean;
    tools: ToolModuleResponseItemType[];
  }) {
    return (
      <Box>
        {tools.map((tool) => {
          const formatJson = (string: string) => {
            try {
              return JSON.stringify(JSON.parse(string), null, 2);
            } catch (error) {
              return string;
            }
          };
          const toolParams = formatJson(tool.params);
          const toolResponse = formatJson(tool.response);

          return (
            <Accordion key={tool.id} allowToggle _notLast={{ mb: 2 }}>
              <AccordionItem borderTop={'none'} borderBottom={'none'}>
                <AccordionButton {...accordionButtonStyle}>
                  <Avatar src={tool.toolAvatar} w={'1.25rem'} h={'1.25rem'} borderRadius={'sm'} />
                  <Box mx={2} fontSize={'sm'} color={'myGray.900'}>
                    {tool.toolName}
                  </Box>
                  {showAnimation && !tool.response && <MyIcon name={'common/loading'} w={'14px'} />}
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
                  {toolParams && toolParams !== '{}' && (
                    <Box mb={3}>
                      <Markdown
                        source={`~~~json#Input
${toolParams}`}
                      />
                    </Box>
                  )}
                  {toolResponse && (
                    <Markdown
                      source={`~~~json#Response
${toolResponse}`}
                    />
                  )}
                </AccordionPanel>
              </AccordionItem>
            </Accordion>
          );
        })}
      </Box>
    );
  },
  (prevProps, nextProps) => isEqual(prevProps, nextProps)
);

const onSendPrompt = (e: { text: string; isInteractivePrompt: boolean }) =>
  eventBus.emit(EventNameEnum.sendQuestion, e);
const RenderUserSelectInteractive = React.memo(function RenderInteractive({
  interactive
}: {
  interactive: InteractiveBasicType & UserSelectInteractive;
}) {
  return (
    <SelectOptionsComponent
      interactiveParams={interactive.params}
      onSelect={(value) => {
        onSendPrompt({
          text: value,
          isInteractivePrompt: true
        });
      }}
    />
  );
});
const RenderUserFormInteractive = React.memo(function RenderFormInput({
  interactive,
  chatItemDataId
}: {
  interactive: InteractiveBasicType & UserInputInteractive;
  chatItemDataId: string;
}) {
  const { t } = useTranslation();

  const defaultValues = useMemo(() => {
    if (interactive.type === 'userInput') {
      return interactive.params.inputForm?.reduce((acc: Record<string, any>, item, index) => {
        // 使用 ?? 运算符，只有 undefined 或 null 时才使用 defaultValue
        acc[item.key] = item.value ?? item.defaultValue;
        return acc;
      }, {});
    }
    return {};
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

      onSendPrompt({
        text: JSON.stringify(finalData),
        isInteractivePrompt: true
      });
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
          onSendPrompt({
            text: 'Continue',
            isInteractivePrompt: true
          });
        }}
      >
        {t('chat:continue_run')}
      </Button>
    </>
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
  value: UserChatItemValueItemType | AIChatItemValueItemType;
  isLastResponseValue: boolean;
  isChatting: boolean;
  onOpenCiteModal?: (e?: OnOpenCiteModalProps) => void;
}) => {
  const showRunningStatus = useContextSelector(ChatItemContext, (v) => v.showRunningStatus);

  if (value.type === ChatItemValueTypeEnum.text && value.text) {
    return (
      <RenderText
        chatItemDataId={chatItemDataId}
        showAnimation={isChatting && isLastResponseValue}
        text={value.text.content}
        onOpenCiteModal={onOpenCiteModal}
      />
    );
  }
  if (value.type === ChatItemValueTypeEnum.reasoning && value.reasoning) {
    return (
      <RenderResoningContent
        isChatting={isChatting}
        isLastResponseValue={isLastResponseValue}
        content={value.reasoning.content}
      />
    );
  }
  if (value.type === ChatItemValueTypeEnum.tool && value.tools && showRunningStatus) {
    return <RenderTool showAnimation={isChatting} tools={value.tools} />;
  }
  if (value.type === ChatItemValueTypeEnum.interactive && value.interactive) {
    const finalInteractive = extractDeepestInteractive(value.interactive);
    if (finalInteractive.type === 'userSelect') {
      return <RenderUserSelectInteractive interactive={finalInteractive} />;
    }
    if (finalInteractive.type === 'userInput') {
      return (
        <RenderUserFormInteractive interactive={finalInteractive} chatItemDataId={chatItemDataId} />
      );
    }
    if (finalInteractive.type === 'paymentPause') {
      return <RenderPaymentPauseInteractive interactive={finalInteractive} />;
    }
  }
  return null;
};
export default React.memo(AIResponseBox);
