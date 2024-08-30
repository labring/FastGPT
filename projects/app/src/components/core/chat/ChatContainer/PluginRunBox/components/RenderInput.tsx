import React, { useEffect, useMemo } from 'react';
import { Controller } from 'react-hook-form';
import RenderPluginInput from './renderPluginInput';
import { Box, Button, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { PluginRunContext } from '../context';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { isEqual } from 'lodash';
import { AppChatConfigType } from '@fastgpt/global/core/app/type';
import Markdown from '@/components/Markdown';

const RenderInput = () => {
  const {
    pluginInputs,
    variablesForm,
    histories,
    onStartChat,
    onNewChat,
    onSubmit,
    isChatting,
    chatConfig
  } = useContextSelector(PluginRunContext, (v) => v);

  const { t } = useTranslation();
  const {
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { errors }
  } = variablesForm;

  const defaultFormValues = useMemo(() => {
    return pluginInputs.reduce(
      (acc, input) => {
        acc[input.key] = input.defaultValue;
        return acc;
      },
      {} as Record<string, any>
    );
  }, [pluginInputs]);

  const historyFormValues = useMemo(() => {
    if (histories.length === 0) return undefined;

    try {
      const inputValueString = histories[0].value[0].text?.content || '[]';
      return JSON.parse(inputValueString).reduce(
        (
          acc: Record<string, any>,
          {
            key,
            value
          }: {
            key: string;
            value: any;
          }
        ) => ({ ...acc, [key]: value }),
        {}
      );
    } catch (error) {
      console.error('Failed to parse input value:', error);
      return undefined;
    }
  }, [histories]);

  useEffect(() => {
    if (isEqual(getValues(), defaultFormValues)) return;
    reset(historyFormValues || defaultFormValues);
  }, [defaultFormValues, getValues, historyFormValues, reset]);

  const isDisabledInput = histories.length > 0;

  return (
    <>
      {/* instruction */}
      {chatConfig?.instruction && (
        <Box
          border={'1px solid'}
          borderColor={'myGray.250'}
          p={4}
          rounded={'md'}
          fontSize={'sm'}
          color={'myGray.600'}
          mb={4}
        >
          <Markdown source={chatConfig.instruction} />
        </Box>
      )}

      {pluginInputs.map((input) => {
        return (
          <Controller
            key={input.key}
            control={control}
            name={input.key}
            rules={{
              validate: (value) => {
                if (!input.required) return true;
                if (input.valueType === WorkflowIOValueTypeEnum.boolean) {
                  return value !== undefined;
                }
                return !!value;
              }
            }}
            render={({ field: { onChange, value } }) => {
              return (
                <RenderPluginInput
                  value={value}
                  onChange={onChange}
                  isDisabled={isDisabledInput}
                  isInvalid={errors && Object.keys(errors).includes(input.key)}
                  input={input}
                />
              );
            }}
          />
        );
      })}
      {onStartChat && onNewChat && (
        <Flex justifyContent={'end'} mt={8}>
          <Button
            isLoading={isChatting}
            onClick={() => {
              if (histories.length > 0) {
                return onNewChat();
              }
              handleSubmit(onSubmit)();
            }}
          >
            {histories.length > 0 ? t('common:common.Restart') : t('common:common.Run')}
          </Button>
        </Flex>
      )}
    </>
  );
};

export default RenderInput;
