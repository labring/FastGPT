import { VariableItemType } from '@fastgpt/global/core/app/type.d';
import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { Box, Button, Card, Input, Textarea } from '@chakra-ui/react';
import ChatAvatar from './ChatAvatar';
import { MessageCardStyle } from '../constants';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ChatBoxInputFormType } from '../type.d';
import { useRefresh } from '@fastgpt/web/hooks/useRefresh';

const VariableInput = ({
  appAvatar,
  variableList,
  chatForm,
  onSubmitVariables
}: {
  appAvatar?: string;
  variableList: VariableItemType[];
  onSubmitVariables: (e: Record<string, any>) => void;
  chatForm: UseFormReturn<ChatBoxInputFormType>;
}) => {
  const { t } = useTranslation();
  const { register, setValue, handleSubmit: handleSubmitChat, watch } = chatForm;
  const variables = watch('variables');
  const chatStarted = watch('chatStarted');
  const { refresh } = useRefresh();

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
                  {...register(`variables.${item.key}`, {
                    required: item.required
                  })}
                />
              )}
              {item.type === VariableInputEnum.textarea && (
                <Textarea
                  bg={'myWhite.400'}
                  {...register(`variables.${item.key}`, {
                    required: item.required
                  })}
                  rows={5}
                  maxLength={4000}
                />
              )}
              {item.type === VariableInputEnum.select && (
                <MySelect
                  width={'100%'}
                  list={(item.enums || []).map((item) => ({
                    label: item.value,
                    value: item.value
                  }))}
                  {...register(`variables.${item.key}`, {
                    required: item.required
                  })}
                  value={variables[item.key]}
                  onchange={(e) => {
                    refresh();
                    setValue(`variables.${item.key}`, e);
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
              onClick={handleSubmitChat((data) => {
                onSubmitVariables(data);
              })}
            >
              {t('core.chat.Start Chat')}
            </Button>
          )}
        </Card>
      </Box>
    </Box>
  );
};

export default VariableInput;
