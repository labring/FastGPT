import Markdown from '@/components/Markdown';
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
  ToolModuleResponseItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { SendPromptFnType } from '../ChatContainer/ChatBox/type';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../ChatContainer/ChatBox/Provider';
import { InteractiveNodeResponseItemType } from '@fastgpt/global/core/workflow/template/system/userSelect/type';
import { isEqual } from 'lodash';

type props = {
  value: UserChatItemValueItemType | AIChatItemValueItemType;
  isLastChild: boolean;
  isChatting: boolean;
  onSendMessage?: SendPromptFnType;
};

const RenderText = React.memo(function RenderText({
  showAnimation,
  text
}: {
  showAnimation: boolean;
  text?: string;
}) {
  let source = (text || '').trim();

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
const RenderInteractive = React.memo(
  function RenderInteractive({
    isChatting,
    interactive,
    onSendMessage,
    chatHistories
  }: {
    isChatting: boolean;
    interactive: InteractiveNodeResponseItemType;
    onSendMessage?: SendPromptFnType;
    chatHistories: ChatSiteItemType[];
  }) {
    return (
      <>
        {interactive?.params?.description && <Markdown source={interactive.params.description} />}
        <Flex flexDirection={'column'} gap={2} w={'250px'}>
          {interactive.params.userSelectOptions?.map((option) => {
            const selected = option.value === interactive?.params?.userSelectedVal;

            return (
              <Button
                key={option.key}
                variant={'whitePrimary'}
                whiteSpace={'pre-wrap'}
                isDisabled={interactive?.params?.userSelectedVal !== undefined}
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
                    isInteractivePrompt: true
                  });
                }}
              >
                {option.value}
              </Button>
            );
          })}
        </Flex>
      </>
    );
  },
  (
    prevProps,
    nextProps // isChatting 更新时候，onSendMessage 和 chatHistories 肯定都更新了，这里不需要额外的刷新
  ) =>
    prevProps.isChatting === nextProps.isChatting &&
    isEqual(prevProps.interactive, nextProps.interactive)
);

const AIResponseBox = ({ value, isLastChild, isChatting, onSendMessage }: props) => {
  const chatHistories = useContextSelector(ChatBoxContext, (v) => v.chatHistories);

  if (value.type === ChatItemValueTypeEnum.text && value.text)
    return <RenderText showAnimation={isChatting && isLastChild} text={value.text.content} />;
  if (value.type === ChatItemValueTypeEnum.tool && value.tools)
    return <RenderTool showAnimation={isChatting && isLastChild} tools={value.tools} />;
  if (
    value.type === ChatItemValueTypeEnum.interactive &&
    value.interactive &&
    value.interactive.type === 'userSelect'
  )
    return (
      <RenderInteractive
        isChatting={isChatting}
        interactive={value.interactive}
        onSendMessage={onSendMessage}
        chatHistories={chatHistories}
      />
    );
};

export default React.memo(AIResponseBox);
