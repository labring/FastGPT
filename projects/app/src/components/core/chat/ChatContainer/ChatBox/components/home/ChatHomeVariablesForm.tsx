import LabelAndFormRender from '@/components/core/app/formRender/LabelAndForm';
import { ChatBoxContext } from '@/components/core/chat/ChatContainer/ChatBox/Provider';
import { Box, Flex, Card, Button } from '@chakra-ui/react';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'react-i18next';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { variableInputTypeToInputType } from '@/components/core/app/formRender/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { UseFormReturn } from 'react-hook-form';
import type { ChatBoxInputFormType } from '@/components/core/chat/ChatContainer/ChatBox/type';

type Props = {
  chatForm: UseFormReturn<ChatBoxInputFormType>;
};

const ChatHomeVariablesForm = ({ chatForm }: Props) => {
  const { t } = useTranslation();

  const variablesForm = useContextSelector(ChatItemContext, (v) => v.variablesForm);

  const variableList = useContextSelector(ChatBoxContext, (v) => v.variableList);
  const allVariableList = useContextSelector(ChatBoxContext, (v) => v.allVariableList);

  return (
    <Card
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
        <Button
          leftIcon={<MyIcon name={'core/chat/sendLight'} w={'1rem'} />}
          w={'100%'}
          mt={6}
          variant={'primaryOutline'}
          onClick={variablesForm.handleSubmit(() => {
            chatForm.setValue('chatStarted', true);
          })}
        >
          {t('chat:start_chat')}
        </Button>
      </Box>
    </Card>
  );
};

export default ChatHomeVariablesForm;
