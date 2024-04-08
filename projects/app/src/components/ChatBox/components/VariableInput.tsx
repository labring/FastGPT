import { VariableItemType } from '@fastgpt/global/core/app/type.d';
import React, { useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { Box, Button, Card, Input, Textarea } from '@chakra-ui/react';
import ChatAvatar from './ChatAvatar';
import { MessageCardStyle } from '../constants';
import { VariableInputEnum } from '@fastgpt/global/core/module/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ChatBoxInputFormType } from '../type.d';

const VariableInput = ({
  appAvatar,
  variableModules,
  variableIsFinish,
  chatForm,
  onSubmitVariables
}: {
  appAvatar?: string;
  variableModules: VariableItemType[];
  variableIsFinish: boolean;
  onSubmitVariables: (e: Record<string, any>) => void;
  chatForm: UseFormReturn<ChatBoxInputFormType>;
}) => {
  const { t } = useTranslation();
  const [refresh, setRefresh] = useState(false);
  const { register, setValue, handleSubmit: handleSubmitChat, watch } = chatForm;
  const variables = watch('variables');

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
          {variableModules.map((item) => (
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
                  isDisabled={variableIsFinish}
                  bg={'myWhite.400'}
                  {...register(`variables.${item.key}`, {
                    required: item.required
                  })}
                />
              )}
              {item.type === VariableInputEnum.textarea && (
                <Textarea
                  isDisabled={variableIsFinish}
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
                  isDisabled={variableIsFinish}
                  list={(item.enums || []).map((item) => ({
                    label: item.value,
                    value: item.value
                  }))}
                  {...register(`variables.${item.key}`, {
                    required: item.required
                  })}
                  value={variables[item.key]}
                  onchange={(e) => {
                    setValue(`variables.${item.key}`, e);
                    setRefresh((state) => !state);
                  }}
                />
              )}
            </Box>
          ))}
          {!variableIsFinish && (
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

export default React.memo(VariableInput);
