import LabelAndFormRender from '@/components/core/app/formRender/LabelAndForm';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import { ChatBoxContext } from '@/components/core/chat/ChatContainer/ChatBox/Provider';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { Box, Flex, Card, Button } from '@chakra-ui/react';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'react-i18next';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { variableInputTypeToInputType } from '@/components/core/app/formRender/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { UseFormReturn } from 'react-hook-form';
import type { ChatBoxInputFormType } from '@/components/core/chat/ChatContainer/ChatBox/type';

type Props = {
  chatType: ChatTypeEnum;
  chatForm: UseFormReturn<ChatBoxInputFormType>;
  chatStarted: boolean;
};

const ChatHomeVariablesForm = ({ chatType, chatForm, chatStarted }: Props) => {
  const { t } = useTranslation();

  const variablesForm = useContextSelector(ChatItemContext, (v) => v.variablesForm);

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);

  const quickApps = useContextSelector(ChatBoxContext, (v) => v.quickApps);
  const onSwitchQuickApp = useContextSelector(ChatBoxContext, (v) => v.onSwitchQuickApp);
  const currentQuickAppId = useContextSelector(ChatBoxContext, (v) => v.currentQuickAppId);
  const variableList = useContextSelector(ChatBoxContext, (v) => v.variableList);
  const allVariableList = useContextSelector(ChatBoxContext, (v) => v.allVariableList);

  return chatType === ChatTypeEnum.home &&
    chatRecords.length === 0 &&
    quickApps &&
    quickApps?.length > 0 ? (
    <>
      <Flex mb="2" alignItems="center" gap={2} flexWrap="wrap">
        {quickApps.map((q) => (
          <Flex
            key={q.id}
            alignItems="center"
            gap={1}
            border="sm"
            borderRadius="md"
            px={2}
            py={1}
            cursor="pointer"
            _hover={{ bg: 'myGray.50' }}
            bg={currentQuickAppId === q.id ? 'primary.50' : 'white'}
            color={currentQuickAppId === q.id ? 'primary.600' : 'myGray.600'}
            borderColor={currentQuickAppId === q.id ? 'primary.200' : 'myGray.200'}
            onClick={() => onSwitchQuickApp?.(q.id)}
          >
            <Avatar src={q.avatar} w={4} borderRadius="xs" />
            <Box fontSize="xs" fontWeight="500" userSelect="none">
              {q.name}
            </Box>
          </Flex>
        ))}
      </Flex>

      {/* variables form for quick app */}
      {chatType === ChatTypeEnum.home &&
        !chatStarted &&
        (variableList?.length > 0 ||
          allVariableList?.some((i) => i.type === VariableInputEnum.custom)) && (
          <Box mb={3}>
            <Card
              w={'full'}
              bg={'white'}
              border={'sm'}
              borderColor={'myGray.200'}
              boxShadow={'0 0 8px rgba(0,0,0,0.05)'}
            >
              <Box p={3}>
                {/* custom variables */}
                {allVariableList.filter((i) => i.type === VariableInputEnum.custom).length > 0 && (
                  <>
                    <Flex
                      color={'primary.600'}
                      bg={'primary.100'}
                      mb={3}
                      px={3}
                      py={1.5}
                      gap={1}
                      fontSize={'mini'}
                      rounded={'sm'}
                    >
                      <MyIcon name={'common/info'} color={'primary.600'} w={4} />
                      {t('chat:variable_invisable_in_share')}
                    </Flex>
                    {allVariableList
                      .filter((i) => i.type === VariableInputEnum.custom)
                      .map((item) => (
                        <LabelAndFormRender
                          {...item}
                          key={item.key}
                          formKey={`variables.${item.key}`}
                          placeholder={item.description}
                          inputType={variableInputTypeToInputType(item.type, item.valueType)}
                          variablesForm={variablesForm}
                          bg={'myGray.50'}
                        />
                      ))}
                  </>
                )}
                {/* normal variables */}
                {variableList.length > 0 && (
                  <>
                    {variableList.map((item) => (
                      <LabelAndFormRender
                        {...item}
                        key={item.key}
                        formKey={`variables.${item.key}`}
                        placeholder={item.description}
                        inputType={variableInputTypeToInputType(item.type)}
                        variablesForm={variablesForm}
                        bg={'myGray.50'}
                      />
                    ))}
                  </>
                )}
                {!chatStarted && (
                  <Button
                    leftIcon={<MyIcon name={'core/chat/chatFill'} w={'16px'} />}
                    size={'sm'}
                    maxW={'100px'}
                    mt={2}
                    onClick={variablesForm.handleSubmit(() => {
                      chatForm.setValue('chatStarted', true);
                    })}
                  >
                    {t('chat:start_chat')}
                  </Button>
                )}
              </Box>
            </Card>
          </Box>
        )}
    </>
  ) : null;
};

export default ChatHomeVariablesForm;
