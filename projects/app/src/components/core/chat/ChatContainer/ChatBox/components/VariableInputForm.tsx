import React, { useEffect, useMemo } from 'react';
import { type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { Box, Button, Card, Flex } from '@chakra-ui/react';
import ChatAvatar from './ChatAvatar';
import { MessageCardStyle } from '../constants';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { type ChatBoxInputFormType } from '../type';
import { useContextSelector } from 'use-context-selector';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatBoxContext } from '../Provider';
import LabelAndFormRender from '@/components/core/app/formRender/LabelAndForm';
import { variableInputTypeToInputType } from '@/components/core/app/formRender/utils';

const VariableInput = ({
  chatForm,
  chatStarted,
  showExternalVariables = false
}: {
  chatForm: UseFormReturn<ChatBoxInputFormType>;
  chatStarted: boolean;
  showExternalVariables?: boolean;
}) => {
  const { t } = useTranslation();

  const appAvatar = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app?.avatar);
  const variablesForm = useContextSelector(ChatItemContext, (v) => v.variablesForm);
  const variableList = useContextSelector(ChatBoxContext, (v) => v.variableList);
  const allVariableList = useContextSelector(ChatBoxContext, (v) => v.allVariableList);

  const externalVariableList = useMemo(
    () =>
      allVariableList.filter((item) =>
        showExternalVariables ? item.type === VariableInputEnum.custom : false
      ),
    [allVariableList, showExternalVariables]
  );

  const { getValues, setValue, reset } = variablesForm;

  // Init variables and add default values
  useEffect(() => {
    const values = getValues();

    allVariableList.forEach((item) => {
      const val = getValues(`variables.${item.key}`);
      if (item.defaultValue !== undefined && (val === undefined || val === null || val === '')) {
        values.variables[item.key] = item.defaultValue;
      }
    });

    reset(values);
  }, [allVariableList, getValues, reset, setValue, variableList]);

  return (
    <Box py={3}>
      <ChatAvatar src={appAvatar} type={'AI'} />
      {externalVariableList.length > 0 && (
        <Box textAlign={'left'}>
          <Card
            order={2}
            mt={2}
            w={'400px'}
            {...MessageCardStyle}
            bg={'white'}
            boxShadow={'0 0 8px rgba(0,0,0,0.15)'}
          >
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
            {externalVariableList.map((item) => {
              return (
                <LabelAndFormRender
                  {...item}
                  key={item.key}
                  formKey={`variables.${item.key}`}
                  placeholder={item.description}
                  inputType={variableInputTypeToInputType(item.type, item.valueType)}
                  variablesForm={variablesForm}
                  bg={'myGray.50'}
                />
              );
            })}
            {variableList.length === 0 && !chatStarted && (
              <Button
                leftIcon={<MyIcon name={'core/chat/chatFill'} w={'16px'} />}
                size={'sm'}
                maxW={'100px'}
                mt={4}
                onClick={variablesForm.handleSubmit(() => {
                  chatForm.setValue('chatStarted', true);
                })}
              >
                {t('chat:start_chat')}
              </Button>
            )}
          </Card>
        </Box>
      )}

      {variableList.length > 0 && (
        <Box textAlign={'left'}>
          <Card
            order={2}
            mt={2}
            w={'400px'}
            {...MessageCardStyle}
            bg={'white'}
            boxShadow={'0 0 8px rgba(0,0,0,0.15)'}
          >
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
            {!chatStarted && (
              <Button
                leftIcon={<MyIcon name={'core/chat/chatFill'} w={'16px'} />}
                size={'sm'}
                maxW={'100px'}
                mt={4}
                onClick={variablesForm.handleSubmit(() => {
                  chatForm.setValue('chatStarted', true);
                })}
              >
                {t('chat:start_chat')}
              </Button>
            )}
          </Card>
        </Box>
      )}
    </Box>
  );
};

export default VariableInput;
