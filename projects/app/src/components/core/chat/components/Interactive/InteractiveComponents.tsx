import React, { useCallback } from 'react';
import { Box, Button, Flex } from '@chakra-ui/react';
import { Controller, useForm, type UseFormHandleSubmit } from 'react-hook-form';
import Markdown from '@/components/Markdown';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import type {
  AgentPlanCheckInteractive,
  UserInputFormItemType,
  UserInputInteractive,
  UserSelectInteractive,
  UserSelectOptionItemType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import InputRender from '@/components/core/app/formRender';
import { nodeInputTypeToInputType } from '@/components/core/app/formRender/utils';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import { useTranslation } from 'next-i18next';

const DescriptionBox = React.memo(function DescriptionBox({
  description
}: {
  description?: string;
}) {
  if (!description) return null;
  return (
    <Box mb={4}>
      <Markdown source={description} />
    </Box>
  );
});

export const SelectOptionsComponent = React.memo(function SelectOptionsComponent({
  interactiveParams,
  onSelect
}: {
  interactiveParams: UserSelectInteractive['params'];
  onSelect: (value: string) => void;
}) {
  const { description, userSelectOptions, userSelectedVal } = interactiveParams;

  return (
    <Box maxW={'100%'}>
      <DescriptionBox description={description} />
      <Box w={'250px'}>
        <LeftRadio<string>
          py={3.5}
          gridGap={3}
          align={'center'}
          list={userSelectOptions.map((option: UserSelectOptionItemType) => ({
            title: (
              <Box fontSize={'sm'} whiteSpace={'pre-wrap'} wordBreak={'break-word'}>
                {option.value}
              </Box>
            ),
            value: option.value
          }))}
          value={userSelectedVal || ''}
          defaultBg={'white'}
          activeBg={'white'}
          onChange={(val) => onSelect(val)}
          isDisabled={!!userSelectedVal}
        />
      </Box>
    </Box>
  );
});

export const FormInputComponent = React.memo(function FormInputComponent({
  interactiveParams,
  defaultValues = {},
  SubmitButton
}: {
  interactiveParams: UserInputInteractive['params'];
  defaultValues?: Record<string, any>;
  SubmitButton: (e: { onSubmit: UseFormHandleSubmit<Record<string, any>> }) => React.JSX.Element;
}) {
  const { description, inputForm, submitted } = interactiveParams;

  const { handleSubmit, control } = useForm({
    defaultValues
  });

  const RenderFormInput = useCallback(
    ({ input }: { input: UserInputFormItemType }) => {
      return (
        <Controller
          key={input.label}
          control={control}
          name={input.label}
          rules={{ required: input.required }}
          render={({ field: { onChange, value }, fieldState: { error } }) => {
            const inputType = nodeInputTypeToInputType([input.type]);

            return (
              <InputRender
                inputType={inputType}
                value={value}
                onChange={onChange}
                placeholder={input.description}
                isDisabled={submitted}
                isInvalid={!!error}
                maxLength={input.maxLength}
                min={input.min}
                max={input.max}
                list={input.list}
              />
            );
          }}
        />
      );
    },
    [control, submitted]
  );

  return (
    <Box>
      <DescriptionBox description={description} />
      <Flex flexDirection={'column'} gap={3}>
        {inputForm.map((input) => (
          <Box key={input.label}>
            <Flex alignItems={'center'} mb={1}>
              {input.required && <Box color={'red.500'}>*</Box>}
              <FormLabel>{input.label}</FormLabel>
              {input.description && <QuestionTip ml={1} label={input.description} />}
            </Flex>
            <RenderFormInput input={input} />
          </Box>
        ))}
      </Flex>

      {!submitted && (
        <Flex justifyContent={'flex-end'} mt={4}>
          <SubmitButton onSubmit={handleSubmit} />
        </Flex>
      )}
    </Box>
  );
});

// Agent interactive
export const AgentPlanCheckComponent = React.memo(function AgentPlanCheckComponent({
  interactiveParams,
  onConfirm
}: {
  interactiveParams: AgentPlanCheckInteractive['params'];
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return interactiveParams?.confirmed ? (
    // TODO：临时 UI
    <Box>已确认计划</Box>
  ) : (
    <Box>
      <Box>{t('chat:confirm_plan_agent')}</Box>
      <Button onClick={onConfirm}>{t('common:Confirm')}</Button>
    </Box>
  );
});
