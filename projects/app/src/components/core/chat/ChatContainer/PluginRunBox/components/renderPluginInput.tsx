import {
  Box,
  Flex,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Switch,
  Textarea
} from '@chakra-ui/react';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import MySelect from '@fastgpt/web/components/common/MySelect';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';

const JsonEditor = dynamic(() => import('@fastgpt/web/components/common/Textarea/JsonEditor'));

const RenderPluginInput = ({
  value,
  onChange,
  isDisabled,
  isInvalid,
  input
}: {
  value: any;
  onChange: () => void;
  isDisabled?: boolean;
  isInvalid: boolean;
  input: FlowNodeInputItemType;
}) => {
  const { t } = useTranslation();
  const inputType = input.renderTypeList[0];

  const render = (() => {
    if (inputType === FlowNodeInputTypeEnum.customVariable) {
      return null;
    }
    if (inputType === FlowNodeInputTypeEnum.select && input.list) {
      return (
        <MySelect list={input.list} value={value} onchange={onChange} isDisabled={isDisabled} />
      );
    }
    if (input.valueType === WorkflowIOValueTypeEnum.string) {
      return (
        <Textarea
          value={value}
          defaultValue={input.defaultValue}
          onChange={onChange}
          isDisabled={isDisabled}
          placeholder={t(input.placeholder as any)}
          bg={'myGray.50'}
          isInvalid={isInvalid}
        />
      );
    }
    if (input.valueType === WorkflowIOValueTypeEnum.number) {
      return (
        <NumberInput
          step={1}
          min={input.min}
          max={input.max}
          bg={'myGray.50'}
          isDisabled={isDisabled}
          isInvalid={isInvalid}
        >
          <NumberInputField value={value} onChange={onChange} defaultValue={input.defaultValue} />
          <NumberInputStepper>
            <NumberIncrementStepper />
            <NumberDecrementStepper />
          </NumberInputStepper>
        </NumberInput>
      );
    }
    if (input.valueType === WorkflowIOValueTypeEnum.boolean) {
      return (
        <Switch
          isChecked={value}
          onChange={onChange}
          isDisabled={isDisabled}
          isInvalid={isInvalid}
          defaultChecked={!!input.defaultValue}
        />
      );
    }

    return (
      <JsonEditor
        bg={'myGray.50'}
        placeholder={t(input.placeholder as any)}
        resize
        value={value}
        onChange={onChange}
        isInvalid={isInvalid}
        defaultValue={input.defaultValue}
      />
    );
  })();

  return !!render ? (
    <Box _notLast={{ mb: 4 }} px={1}>
      <Flex alignItems={'center'} mb={1}>
        <Box position={'relative'}>
          {input.required && (
            <Box position={'absolute'} left={-2} top={'-1px'} color={'red.600'}>
              *
            </Box>
          )}
          {t(input.label as any)}
        </Box>
        {input.description && <QuestionTip ml={2} label={t(input.description as any)} />}
      </Flex>
      {render}
    </Box>
  ) : null;
};

export default RenderPluginInput;
