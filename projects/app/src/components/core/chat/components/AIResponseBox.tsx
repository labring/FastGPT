import Markdown from '@/components/Markdown';
import { CodeClassNameEnum } from '@/components/Markdown/utils';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box
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

type props = {
  value: UserChatItemValueItemType | AIChatItemValueItemType;
  index: number;
  chat: ChatSiteItemType;
  isLastChild: boolean;
  isChatting: boolean;
  questionGuides: string[];
};

const AIResponseBox = ({ value, index, chat, isLastChild, isChatting, questionGuides }: props) => {
  if (value.text) {
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
                    <Markdown
                      source={`~~~json#Input
${toolParams}`}
                    />
                  )}
                  {toolResponse && (
                    <Box mt={3}>
                      <Markdown
                        source={`~~~json#Response
${toolResponse}`}
                      />
                    </Box>
                  )}
                </AccordionPanel>
              </AccordionItem>
            </Accordion>
          );
        })}
      </Box>
    );
  }
  return null;
};

export default React.memo(AIResponseBox);
