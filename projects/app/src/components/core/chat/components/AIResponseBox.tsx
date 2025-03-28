import Markdown from '@/components/Markdown';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
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
  UserInputInteractive,
  UserSelectInteractive
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { isEqual } from 'lodash';
import { useTranslation } from 'next-i18next';
import { eventBus, EventNameEnum } from '@/web/common/utils/eventbus';
import {
  SelectOptionsComponent,
  type SelectOptionType,
  FormInputComponent,
  type FormItemType
} from './Interactive/InteractiveComponents';
const onSendPrompt = (e: { text: string; isInteractivePrompt: boolean }) =>
  eventBus.emit(EventNameEnum.sendQuestion, e);
const StyledAccordionItem = React.memo(function StyledAccordionItem({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <AccordionItem borderTop={'none'} borderBottom={'none'}>
      {children}
    </AccordionItem>
  );
});
const StyledAccordionButton = React.memo(function StyledAccordionButton({
  children,
  py = 0
}: {
  children: React.ReactNode;
  py?: number | string;
}) {
  return (
    <AccordionButton
      w={'auto'}
      bg={'white'}
      borderRadius={'md'}
      borderWidth={'1px'}
      borderColor={'myGray.200'}
      boxShadow={'1'}
      pl={3}
      pr={2.5}
      py={py}
      _hover={{
        bg: 'auto'
      }}
    >
      {children}
    </AccordionButton>
  );
});
const RenderText = React.memo(function RenderText({
  showAnimation,
  text
}: {
  showAnimation: boolean;
  text?: string;
}) {
  let source = text || '';
  // First empty line
  // if (!source && !isLastChild) return null;

  return <Markdown source={source} showAnimation={showAnimation} />;
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
          const toolParams = (() => {
            try {
              return JSON.stringify(JSON.parse(tool.params), null, 2);
            } catch (error) {
              return tool.params;
            }
          })();
          const toolResponse = (() => {
            try {
              return JSON.stringify(JSON.parse(tool.response), null, 2);
            } catch (error) {
              return tool.response;
            }
          })();

          return (
            <Accordion key={tool.id} allowToggle _notLast={{ mb: 2 }}>
              <AccordionItem borderTop={'none'} borderBottom={'none'}>
                <AccordionButton
                  w={'auto'}
                  bg={'white'}
                  borderRadius={'md'}
                  borderWidth={'1px'}
                  borderColor={'myGray.200'}
                  boxShadow={'1'}
                  pl={3}
                  pr={2.5}
                  _hover={{
                    bg: 'auto'
                  }}
                >
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
      <StyledAccordionItem>
        <StyledAccordionButton py={1}>
          <HStack mr={2} spacing={1}>
            <MyIcon name={'core/chat/think'} w={'0.85rem'} />
            <Box fontSize={'sm'}>{t('chat:ai_reasoning')}</Box>
          </HStack>

          {showAnimation && <MyIcon name={'common/loading'} w={'0.85rem'} />}
          <AccordionIcon color={'myGray.600'} ml={5} />
        </StyledAccordionButton>
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
      </StyledAccordionItem>
    </Accordion>
  );
});
const RenderUserSelectInteractive = React.memo(function RenderInteractive({
  interactive
}: {
  interactive: InteractiveBasicType & UserSelectInteractive;
}) {
  return (
    <SelectOptionsComponent
      options={(interactive.params.userSelectOptions || []) as SelectOptionType[]}
      description={interactive.params.description}
      selectedValue={interactive.params.userSelectedVal}
      onSelectOption={(value: string) => {
        onSendPrompt({
          text: value,
          isInteractivePrompt: true
        });
      }}
      isDisabled={interactive.params.userSelectedVal !== undefined}
      variant="whitePrimary"
    />
  );
});
const RenderUserFormInteractive = React.memo(function RenderFormInput({
  interactive
}: {
  interactive: InteractiveBasicType & UserInputInteractive;
}) {
  const { t } = useTranslation();
  const defaultValues = useMemo(() => {
    if (interactive.type === 'userInput') {
      return interactive.params.inputForm?.reduce((acc: Record<string, any>, item) => {
        acc[item.label] = !!item.value ? item.value : item.defaultValue;
        return acc;
      }, {});
    }
    return {};
  }, [interactive]);
  const handleFormSubmit = useCallback((data: Record<string, any>) => {
    onSendPrompt({
      text: JSON.stringify(data),
      isInteractivePrompt: true
    });
  }, []);

  return (
    <Flex flexDirection={'column'} gap={2} w={'250px'}>
      <FormInputComponent
        inputForm={(interactive.params.inputForm || []) as FormItemType[]}
        description={interactive.params.description}
        onSubmit={handleFormSubmit}
        isDisabled={interactive.params.submitted}
        defaultValues={defaultValues}
        submitButtonText="common:Submit"
        isCompact={true}
      />
    </Flex>
  );
});
const getResponseRenderer = (
  value: UserChatItemValueItemType | AIChatItemValueItemType,
  isChatting: boolean,
  isLastResponseValue: boolean
) => {
  if (value.type === ChatItemValueTypeEnum.text && value.text) {
    return (
      <RenderText showAnimation={isChatting && isLastResponseValue} text={value.text.content} />
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
  if (value.type === ChatItemValueTypeEnum.tool && value.tools) {
    return <RenderTool showAnimation={isChatting} tools={value.tools} />;
  }
  if (value.type === ChatItemValueTypeEnum.interactive && value.interactive) {
    if (value.interactive.type === 'userSelect') {
      return <RenderUserSelectInteractive interactive={value.interactive} />;
    }
    if (value.interactive?.type === 'userInput') {
      return <RenderUserFormInteractive interactive={value.interactive} />;
    }
  }
  return null;
};
const AIResponseBox = React.memo(function AIResponseBox({
  value,
  isLastResponseValue,
  isChatting
}: {
  value: UserChatItemValueItemType | AIChatItemValueItemType;
  isLastResponseValue: boolean;
  isChatting: boolean;
}) {
  return getResponseRenderer(value, isChatting, isLastResponseValue);
});
export default AIResponseBox;
