import {
  Box,
  Button,
  Flex,
  Input,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Textarea
} from '@chakra-ui/react';
import { InteractiveNodeResponseItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useCallback, useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { onSendPrompt } from '../ChatContainer/useChat';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import MySelect from '@fastgpt/web/components/common/MySelect';

const RenderInputForm = ({ interactive }: { interactive: InteractiveNodeResponseItemType }) => {
  const { t } = useTranslation();
  const { register, setValue, handleSubmit: handleSubmitChat, control, reset } = useForm();

  const onSubmit = useCallback((data: any) => {
    onSendPrompt({
      text: JSON.stringify(data),
      isInteractivePrompt: true
    });
  }, []);

  useEffect(() => {
    if (interactive.type === 'userInput') {
      const defaultValues = interactive.params.inputForm?.reduce(
        (acc: Record<string, any>, item) => {
          acc[item.label] = !!item.value ? item.value : item.defaultValue;
          return acc;
        },
        {}
      );
      reset(defaultValues);
    }
  }, []);

  if (interactive.type === 'userInput') {
    return (
      <Flex flexDirection={'column'} gap={2} w={'250px'}>
        {interactive.params.inputForm?.map((input) => (
          <Box key={input.label}>
            <Flex mb={1}>
              <FormLabel required={input.required}>{input.label}</FormLabel>
              <QuestionTip ml={1} label={input.description} />
            </Flex>
            {input.type === FlowNodeInputTypeEnum.input && (
              <Input
                bg={'white'}
                maxLength={input.maxLength}
                isDisabled={interactive.params.submitted}
                {...register(input.label, {
                  required: input.required
                })}
              />
            )}
            {input.type === FlowNodeInputTypeEnum.textarea && (
              <Textarea
                isDisabled={interactive.params.submitted}
                bg={'white'}
                {...register(input.label, {
                  required: input.required
                })}
                rows={5}
                maxLength={input.maxLength || 4000}
              />
            )}
            {input.type === FlowNodeInputTypeEnum.numberInput && (
              <NumberInput
                step={1}
                min={input.min}
                max={input.max}
                isDisabled={interactive.params.submitted}
                bg={'white'}
              >
                <NumberInputField
                  bg={'white'}
                  {...register(input.label, {
                    required: input.required
                  })}
                />
                <NumberInputStepper>
                  <NumberIncrementStepper />
                  <NumberDecrementStepper />
                </NumberInputStepper>
              </NumberInput>
            )}
            {input.type === FlowNodeInputTypeEnum.select && (
              <Controller
                key={input.label}
                control={control}
                name={input.label}
                rules={{ required: input.required }}
                render={({ field: { ref, value } }) => {
                  if (!input.list) return <></>;
                  return (
                    <MySelect
                      ref={ref}
                      width={'100%'}
                      list={input.list}
                      value={value}
                      isDisabled={interactive.params.submitted}
                      onchange={(e) => setValue(input.label, e)}
                    />
                  );
                }}
              />
            )}
          </Box>
        ))}
        {!interactive.params.submitted && (
          <Flex w={'full'} justifyContent={'end'}>
            <Button onClick={handleSubmitChat(onSubmit)}>{t('common:Submit')}</Button>
          </Flex>
        )}
      </Flex>
    );
  } else {
    return null;
  }
};

export default RenderInputForm;
