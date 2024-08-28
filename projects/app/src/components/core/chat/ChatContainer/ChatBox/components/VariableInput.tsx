import React from 'react';
import { Controller, UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { Box, Button, Card, FormControl, Input, Textarea } from '@chakra-ui/react';
import ChatAvatar from './ChatAvatar';
import { MessageCardStyle } from '../constants';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ChatBoxInputFormType } from '../type.d';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../Provider';

const VariableInput = ({
  chatForm,
  chatStarted
}: {
  chatStarted: boolean;
  chatForm: UseFormReturn<ChatBoxInputFormType>;
}) => {
  const { t } = useTranslation();

  const { appAvatar, variableList, variablesForm } = useContextSelector(ChatBoxContext, (v) => v);
  const { register, setValue, handleSubmit: handleSubmitChat, control } = variablesForm;

  return (
    <Box py={3}>
      {/* avatar */}
      <ChatAvatar src={appAvatar} type={'AI'} />
      {/* message */}
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
            <Box key={item.id} mb={4}>
              <Box as={'label'} display={'inline-block'} position={'relative'} mb={1}>
                {item.label}
                {item.required && (
                  <Box
                    position={'absolute'}
                    top={'-2px'}
                    right={'-10px'}
                    color={'red.500'}
                    fontWeight={'bold'}
                  >
                    *
                  </Box>
                )}
              </Box>
              {item.type === VariableInputEnum.input && (
                <Input
                  bg={'myWhite.400'}
                  {...register(item.key, {
                    required: item.required
                  })}
                />
              )}
              {item.type === VariableInputEnum.textarea && (
                <Textarea
                  bg={'myWhite.400'}
                  {...register(item.key, {
                    required: item.required
                  })}
                  rows={5}
                  maxLength={4000}
                />
              )}
              {item.type === VariableInputEnum.select && (
                <Controller
                  key={item.key}
                  control={control}
                  name={item.key}
                  rules={{ required: item.required }}
                  render={({ field: { ref, value } }) => {
                    return (
                      <MySelect
                        ref={ref}
                        width={'100%'}
                        list={(item.enums || []).map((item) => ({
                          label: item.value,
                          value: item.value
                        }))}
                        value={value}
                        onchange={(e) => setValue(item.key, e)}
                      />
                    );
                  }}
                />
              )}
            </Box>
          ))}
          {!chatStarted && (
            <Button
              leftIcon={<MyIcon name={'core/chat/chatFill'} w={'16px'} />}
              size={'sm'}
              maxW={'100px'}
              onClick={handleSubmitChat(() => {
                chatForm.setValue('chatStarted', true);
              })}
            >
              {t('common:core.chat.Start Chat')}
            </Button>
          )}
        </Card>
      </Box>
    </Box>
  );
};

export default VariableInput;
