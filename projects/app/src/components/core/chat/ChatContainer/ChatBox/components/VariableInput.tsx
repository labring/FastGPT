import React from 'react';
import { Controller, UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import {
  Box,
  Button,
  Card,
  Input,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Switch,
  Textarea
} from '@chakra-ui/react';
import ChatAvatar from './ChatAvatar';
import { MessageCardStyle } from '../constants';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ChatBoxInputFormType } from '../type.d';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../Provider';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

export const VariableInputItem = ({
  item,
  variablesForm
}: {
  item: any;
  variablesForm: UseFormReturn<any>;
}) => {
  const { register, control, setValue } = variablesForm;

  return (
    <Box key={item.id} mb={4} pl={1}>
      <Box
        as={'label'}
        display={'flex'}
        position={'relative'}
        mb={1}
        alignItems={'center'}
        w={'full'}
      >
        {item.label}
        {item.required && (
          <Box
            position={'absolute'}
            top={'-2px'}
            left={'-8px'}
            color={'red.500'}
            fontWeight={'bold'}
          >
            *
          </Box>
        )}
        {item.description && <QuestionTip ml={1} label={item.description} />}
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
                list={(item.enums || []).map((item: { value: any }) => ({
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
      {item.type === VariableInputEnum.numberInput && (
        <NumberInput
          step={1}
          min={item.min}
          max={item.max}
          bg={'white'}
          rounded={'md'}
          clampValueOnBlur={false}
          defaultValue={item.defaultValue}
        >
          <NumberInputField
            bg={'white'}
            {...register(item.key, {
              required: item.required,
              min: item.min,
              max: item.max,
              valueAsNumber: true
            })}
          />
          <NumberInputStepper>
            <NumberIncrementStepper />
            <NumberDecrementStepper />
          </NumberInputStepper>
        </NumberInput>
      )}
      {item.type === VariableInputEnum.switch && (
        <Switch {...register(item.key)} defaultChecked={!!item.defaultValue} />
      )}
    </Box>
  );
};

const VariableInput = ({
  chatForm,
  chatStarted
}: {
  chatStarted: boolean;
  chatForm: UseFormReturn<ChatBoxInputFormType>;
}) => {
  const { t } = useTranslation();

  const { appAvatar, variableList, variablesForm } = useContextSelector(ChatBoxContext, (v) => v);
  const { reset, handleSubmit: handleSubmitChat } = variablesForm;

  React.useEffect(() => {
    const defaultValues: Record<string, any> = {};
    variableList.forEach((item) => {
      if (item.defaultValue !== undefined && !variablesForm.getValues(item.key)) {
        defaultValues[item.key] = item.defaultValue;
      }
    });
    if (Object.keys(defaultValues).length > 0) {
      reset((formValues) => ({
        ...formValues,
        ...defaultValues
      }));
    }
  }, [variableList, reset, variablesForm]);

  return (
    <Box py={3}>
      <ChatAvatar src={appAvatar} type={'AI'} />
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
            <VariableInputItem key={item.id} item={item} variablesForm={variablesForm} />
          ))}
          {!chatStarted && (
            <Box>
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
            </Box>
          )}
        </Card>
      </Box>
    </Box>
  );
};

export default VariableInput;
