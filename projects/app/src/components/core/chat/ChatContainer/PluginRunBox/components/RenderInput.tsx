import React, { useCallback, useState } from 'react';
import { Controller } from 'react-hook-form';
import { Box, Button, Flex, FormControl, FormErrorMessage } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { PluginRunContext } from '../context';
import Markdown from '@/components/Markdown';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { type UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { type ChatBoxInputFormType } from '../../ChatBox/type';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import InputRender from '@/components/core/app/formRender';
import { nodeInputTypeToInputType } from '@/components/core/app/formRender/utils';
import { WorkflowRuntimeContext } from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useDeepCompareEffect } from 'ahooks';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';

const RenderInput = () => {
  const { t } = useTranslation();

  const pluginInputs = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app?.pluginInputs);
  const variablesForm = useContextSelector(ChatItemContext, (v) => v.variablesForm);

  const hasHistory = useContextSelector(ChatRecordContext, (v) => v.chatRecords.length > 0);
  const historyInputSnapshot = useContextSelector(ChatRecordContext, (v) => {
    const historyValue = v.chatRecords[0]?.value as UserChatItemValueItemType[] | undefined;
    return Array.isArray(historyValue)
      ? historyValue.find((item) => item.text?.content)?.text?.content
      : undefined;
  });

  const onStartChat = useContextSelector(PluginRunContext, (v) => v.onStartChat);
  const onNewChat = useContextSelector(PluginRunContext, (v) => v.onNewChat);
  const onSubmit = useContextSelector(PluginRunContext, (v) => v.onSubmit);
  const isChatting = useContextSelector(PluginRunContext, (v) => v.isChatting);
  const instruction = useContextSelector(PluginRunContext, (v) => v.instruction);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);

  const { control, handleSubmit, reset } = variablesForm;

  const parsedHistoryInputs = useMemoEnhance(() => {
    if (!hasHistory || !historyInputSnapshot) return undefined;
    try {
      const parsed = JSON.parse(historyInputSnapshot);
      return Array.isArray(parsed) ? (parsed as FlowNodeInputItemType[]) : undefined;
    } catch (error) {
      console.error('Failed to parse input value:', error);
      return undefined;
    }
  }, [hasHistory, historyInputSnapshot]);

  // Get plugin input components
  const formatPluginInputs = parsedHistoryInputs || pluginInputs;

  const [restartData, setRestartData] = useState<ChatBoxInputFormType>();
  const [fieldResetKeys, setFieldResetKeys] = useState<Record<string, number>>({});
  const onClickNewChat = useCallback(
    (e: ChatBoxInputFormType) => {
      setRestartData(e);
      onNewChat?.();
    },
    [onNewChat]
  );

  const resetFormVariables = useCallback(
    (nextValues: ChatBoxInputFormType) => {
      const nextVariables = nextValues.variables || {};
      reset(nextValues);
      // react-hook-form@7.43.1 的 Controller(useWatch) 在挂载时会把当时的字段值冻结为订阅闭包里的 defaultValue；
      // 仅当 reset 将字段设为 undefined 时，get(..., defaultValue) 会回退到旧值并被 register 写回。
      // 按字段粒度仅重建目标值为 undefined 的 Controller，避免已赋值字段（如附件选择器）被无谓卸载。
      const keysToRemount = formatPluginInputs
        .map((input) => input.key)
        .filter((key) => nextVariables[key] === undefined);

      if (keysToRemount.length > 0) {
        setFieldResetKeys((prev) => {
          const next = { ...prev };
          keysToRemount.forEach((key) => {
            next[key] = (prev[key] || 0) + 1;
          });
          return next;
        });
      }
    },
    [formatPluginInputs, reset]
  );

  const onResetDefault = useCallback(() => {
    resetFormVariables({
      variables: formatPluginInputs.reduce(
        (acc, input) => {
          acc[input.key] = input.defaultValue;
          return acc;
        },
        {} as Record<string, any>
      )
    });
  }, [formatPluginInputs, resetFormVariables]);

  // Reset input value
  useDeepCompareEffect(() => {
    // Set config default value
    if (!hasHistory) {
      if (restartData) {
        resetFormVariables(restartData);
        setRestartData(undefined);
        return;
      }

      onResetDefault();
      return;
    }

    // Set history to default value
    const historyVariables = parsedHistoryInputs?.reduce(
      (acc: Record<string, any>, { key, value }) => ({ ...acc, [key]: value }),
      {}
    );
    resetFormVariables({
      variables: historyVariables
    });
  }, [hasHistory, historyInputSnapshot, formatPluginInputs]);

  const formFileUploading = useContextSelector(WorkflowRuntimeContext, (v) => v.fileUploading);

  const fileUploading = formFileUploading;
  const isDisabledInput = !!hasHistory;

  return (
    <>
      {/* instruction */}
      {instruction && (
        <Box
          border={'1px solid'}
          borderColor={'myGray.250'}
          p={4}
          rounded={'md'}
          fontSize={'sm'}
          color={'myGray.600'}
          mb={4}
        >
          <Markdown source={instruction} />
        </Box>
      )}
      {/* Filed */}
      {formatPluginInputs
        .filter((input) => {
          const inputType = input.renderTypeList[0];
          const isOutLink = outLinkAuthData && Object.keys(outLinkAuthData).length > 0;

          if (isOutLink) {
            return (
              inputType !== FlowNodeInputTypeEnum.customVariable &&
              inputType !== FlowNodeInputTypeEnum.hidden &&
              inputType !== FlowNodeInputTypeEnum.off
            );
          }

          if (
            inputType === FlowNodeInputTypeEnum.hidden ||
            inputType === FlowNodeInputTypeEnum.off
          ) {
            return false;
          }

          return true;
        })
        .map((input) => {
          const inputType = input.renderTypeList[0];
          const inputKey = `variables.${input.key}` as const;
          const isOutLink = outLinkAuthData && Object.keys(outLinkAuthData).length > 0;

          return (
            <Box _notLast={{ mb: 4 }} key={inputKey}>
              <Flex alignItems={'center'} mb={1}>
                {input.required && <Box color={'red.500'}>*</Box>}
                <FormLabel>{input.label}</FormLabel>
                {input.description && <QuestionTip ml={1} label={input.description} />}
                {isOutLink && inputType === FlowNodeInputTypeEnum.customVariable && (
                  <Flex
                    color={'primary.600'}
                    bg={'primary.100'}
                    px={2}
                    py={1}
                    gap={1}
                    ml={2}
                    fontSize={'mini'}
                    rounded={'sm'}
                  >
                    <MyIcon name={'common/info'} color={'primary.600'} w={4} />
                    {t('chat:variable_invisable_in_share')}
                  </Flex>
                )}
              </Flex>
              <Controller
                key={`${inputKey}-${fieldResetKeys[input.key] || 0}`}
                control={control}
                name={inputKey}
                rules={{
                  validate: (value) => {
                    if (isDisabledInput) return true;
                    if (
                      input.renderTypeList.includes(FlowNodeInputTypeEnum.password) &&
                      input.minLength
                    ) {
                      if (!value || typeof value !== 'object' || !value.value) return false;
                      if (value.value.length < input.minLength) {
                        return t('common:min_length', { minLenth: input.minLength });
                      }
                      return true;
                    }
                    if (typeof value === 'number' || typeof value === 'boolean') return true;
                    if (!input.required) return true;

                    if (input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)) {
                      if (!value || !Array.isArray(value) || value.length === 0) {
                        return t('common:required');
                      }
                      return true;
                    }

                    return !!value;
                  }
                }}
                render={({ field: { onChange, value }, fieldState: { error } }) => {
                  return (
                    <FormControl isInvalid={!!error}>
                      <InputRender
                        {...input}
                        key={inputKey}
                        value={value}
                        onChange={onChange}
                        isDisabled={isDisabledInput}
                        isInvalid={!!error}
                        inputType={nodeInputTypeToInputType(input.renderTypeList)}
                        form={variablesForm}
                        fieldName={inputKey}
                        outLinkAuthData={outLinkAuthData}
                        isRichText={false}
                        canLocalUpload={input.canLocalUpload ?? true}
                      />
                      {error && <FormErrorMessage>{error.message}</FormErrorMessage>}
                    </FormControl>
                  );
                }}
              />
            </Box>
          );
        })}
      {/* Run Button */}
      {onStartChat && onNewChat && (
        <Flex justifyContent={'end'} mt={8} gap={4}>
          <PopoverConfirm
            content={t('chat:confirm_clear_input_value')}
            onConfirm={onResetDefault}
            Trigger={<Button variant={'whiteBase'}>{t('chat:clear_input_value')}</Button>}
          />

          <Button
            isLoading={isChatting}
            isDisabled={fileUploading}
            onClick={() => {
              handleSubmit((e) => {
                if (hasHistory) {
                  onClickNewChat(e);
                } else {
                  onSubmit(e);
                }
              })();
            }}
          >
            {hasHistory ? t('common:Restart') : t('common:Run')}
          </Button>
        </Flex>
      )}
    </>
  );
};

export default RenderInput;
