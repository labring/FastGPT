import React from 'react';
import { Controller } from 'react-hook-form';
import RenderPluginInput from './renderPluginInput';
import { Button, Flex } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { PluginRunBoxTabEnum } from '../constants';
import { useContextSelector } from 'use-context-selector';
import { PluginRunContext } from '../context';
import { useI18n } from '@/web/context/I18n';

const RenderInput = () => {
  const { pluginInputs, variablesForm, histories, onStartChat, onNewChat, onSubmit, isChatting } =
    useContextSelector(PluginRunContext, (v) => v);

  const { t } = useTranslation();
  const { appT } = useI18n();
  const { control, handleSubmit } = variablesForm;
  const isDisabledInput = histories.length > 0;

  return (
    <>
      {pluginInputs.map((input) => {
        return (
          <Controller
            key={input.key}
            control={control}
            name={input.key}
            rules={{ required: input.required }}
            render={({ field: { onChange, value } }) => {
              return (
                <RenderPluginInput
                  value={value}
                  onChange={onChange}
                  label={input.label}
                  description={input.description}
                  isDisabled={isDisabledInput}
                  valueType={input.valueType}
                  placeholder={input.placeholder}
                  required={input.required}
                  min={input.min}
                  max={input.max}
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
            {histories.length > 0 ? t('common.Restart') : appT('Run')}
          </Button>
        </Flex>
      )}
    </>
  );
};

export default RenderInput;
