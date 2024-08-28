import Markdown from '@/components/Markdown';
import { CodeClassNameEnum } from '@/components/Markdown/utils';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Button,
  Flex
} from '@chakra-ui/react';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  AIChatItemValueItemType,
  ChatSiteItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { SendPromptFnType } from '../ChatContainer/ChatBox/type';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../ChatContainer/ChatBox/Provider';
import { setUserSelectResultToHistories } from '../ChatContainer/ChatBox/utils';

type props = {
  value: UserChatItemValueItemType | AIChatItemValueItemType;
  index: number;
  chat: ChatSiteItemType;
  isLastChild: boolean;
  isChatting: boolean;
  questionGuides: string[];
  onSendMessage?: SendPromptFnType;
};

const AIResponseBox = ({
  value,
  index,
  chat,
  isLastChild,
  isChatting,
  questionGuides,
  onSendMessage
}: props) => {
  const chatHistories = useContextSelector(ChatBoxContext, (v) => v.chatHistories);

  if (value.type === ChatItemValueTypeEnum.text && value.text) {
    let source = (value.text?.content || '').trim();

    // First empty line
    if (!source && chat.value.length > 1) return null;

    // computed question guide
    if (
      isLastChild &&
      !isChatting &&
      questionGuides.length > 0 &&
      index === chat.value.length - 1
    ) {
      source = `${source}
\`\`\`${CodeClassNameEnum.questionGuide}
${JSON.stringify(questionGuides)}`;
    }

    return (
      <Markdown
        source={source}
        showAnimation={isLastChild && isChatting && index === chat.value.length - 1}
      />
    );
  }
  if (value.type === ChatItemValueTypeEnum.tool && value.tools) {
    return (
      <Box>
        {value.tools.map((tool) => {
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
            <Accordion key={tool.id} allowToggle>
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
                  {isChatting && !tool.response && <MyIcon name={'common/loading'} w={'14px'} />}
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
  }
  if (
    value.type === ChatItemValueTypeEnum.interactive &&
    value.interactive &&
    value.interactive.type === 'userSelect'
  ) {
    return (
      <Flex flexDirection={'column'} gap={2} minW={'200px'} maxW={'250px'}>
        {value.interactive.params.userSelectOptions?.map((option) => {
          const selected = option.value === value.interactive?.params?.userSelectedVal;

          return (
            <Button
              key={option.key}
              variant={'whitePrimary'}
              isDisabled={!isLastChild && value.interactive?.params?.userSelectedVal !== undefined}
              {...(selected
                ? {
                    _disabled: {
                      cursor: 'default',
                      borderColor: 'primary.300',
                      bg: 'primary.50 !important',
                      color: 'primary.600'
                    }
                  }
                : {})}
              onClick={() => {
                onSendMessage?.({
                  text: option.value,
                  history: setUserSelectResultToHistories(chatHistories, option.value)
                });
              }}
            >
              {option.value}
            </Button>
          );
        })}
      </Flex>
    );
  }
  return null;
};

export default React.memo(AIResponseBox);
