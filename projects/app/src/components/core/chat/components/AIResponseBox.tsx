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
import { ChatBoxInputType } from '../ChatContainer/ChatBox/type';

type props = {
  value: UserChatItemValueItemType | AIChatItemValueItemType;
  index: number;
  chat: ChatSiteItemType;
  isLastChild: boolean;
  isChatting: boolean;
  questionGuides: string[];
  onSendMessage?: (val: ChatBoxInputType & { autoTTSResponse?: boolean }) => void;
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
  if (value.type === ChatItemValueTypeEnum.interactive && value.interactive?.params) {
    const description = value.interactive.params.description;
    return (
      <Box>
        <Markdown source={description} />
        <Flex mt={!!description ? 3 : 0} flexDirection={'column'} gap={2} minW={'240px'}>
          {value.interactive.params.userSelectOptions?.map((option, index) => (
            <Button
              key={index}
              w={'full'}
              variant={'whitePrimary'}
              isDisabled={!isLastChild}
              // _disabled={{ opacity: 0.7 }}
              onClick={() => {
                onSendMessage &&
                  onSendMessage({
                    text: option.value
                  });
              }}
              {...(index === value.interactive?.params?.userSeletedIndex &&
                !isLastChild && {
                  color: 'primary.600',
                  background: 'primary.1',
                  borderColor: 'primary.300'
                })}
            >
              {option.value}
            </Button>
          ))}
        </Flex>
      </Box>
    );
  }
  return null;
};

export default React.memo(AIResponseBox);
