import React from 'react';
import { Box, Switch, Textarea, Flex } from '@chakra-ui/react';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import MySelect from '@fastgpt/web/components/common/MySelect';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import dynamic from 'next/dynamic';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import AIModelSelector from '@/components/Select/AIModelSelector';
import FileSelector from '@/components/Select/FileSelector';

export type InputRenderConfig = {
  bg?: string;
  showCustomVariableTag?: boolean;
};

export type InputType = {
  key: string;
  label: string;
  description?: string;
  required?: boolean;
  isDisabled?: boolean;
  isInvalid?: boolean;
  placeholder?: string;

  // Number
  min?: number;
  max?: number;

  // File
  canSelectFile?: boolean;
  canSelectImg?: boolean;
  maxFiles?: number;
  setUploading?: React.Dispatch<React.SetStateAction<boolean>>;

  // select
  list?: { label: string; value: string }[];
};

export enum InputValueTypeEnum {
  string = 'string',
  number = 'number',
  boolean = 'boolean',
  object = 'object'
}

export enum InputTypeEnum {
  input = 'input',

  select = 'select',
  fileSelect = 'fileSelect',
  selectLLMModel = 'selectLLMModel',
  JSONEditor = 'JSONEditor',

  customVariable = 'customVariable'
}

export type InputRenderProps = {
  input: InputType;

  valueType?: InputValueTypeEnum;
  inputType?: InputTypeEnum;
  value: any;
  onChange: (value: any) => void;

  config?: InputRenderConfig;

  customRender?: (props: InputRenderProps) => React.ReactNode;
};

const JsonEditor = dynamic(() => import('@fastgpt/web/components/common/Textarea/JsonEditor'));

const InputRender = (props: InputRenderProps) => {
  const { t } = useTranslation();
  const { llmModelList } = useSystemStore();
  const { input, valueType, inputType, value, onChange, customRender, config } = props;

  const { bg = 'myGray.50', showCustomVariableTag = false } = config || {};

  if (customRender) {
    return <>{customRender(props)}</>;
  }

  const renderInput = () => {
    if (inputType === InputTypeEnum.select && input.list) {
      return (
        <MySelect
          list={input.list}
          value={value}
          onChange={onChange}
          isDisabled={input.isDisabled}
        />
      );
    }

    if (inputType === InputTypeEnum.fileSelect && input.setUploading) {
      return <FileSelector input={input} value={value} onChange={onChange} />;
    }

    if (inputType === InputTypeEnum.selectLLMModel) {
      return (
        <AIModelSelector
          w={'100%'}
          value={value}
          list={llmModelList.map((item) => ({
            value: item.model,
            label: item.name
          }))}
          onChange={onChange}
        />
      );
    }

    if (inputType === InputTypeEnum.JSONEditor) {
      return (
        <JsonEditor
          value={value}
          onChange={onChange}
          placeholder={t(input.placeholder as any) || ''}
          bg={bg}
          resize={true}
          isInvalid={input.isInvalid}
        />
      );
    }

    switch (valueType) {
      case InputValueTypeEnum.string: {
        return (
          <Textarea
            value={value || ''}
            onChange={onChange}
            placeholder={t(input.placeholder as any) || ''}
            bg={bg}
            isDisabled={input.isDisabled}
            isInvalid={input.isInvalid}
          />
        );
      }

      case InputValueTypeEnum.number: {
        return (
          <MyNumberInput
            value={value}
            onChange={onChange}
            step={1}
            min={input.min}
            max={input.max}
            bg={bg}
            isDisabled={input.isDisabled}
            isInvalid={input.isInvalid}
          />
        );
      }

      case InputValueTypeEnum.boolean: {
        return (
          <Box>
            <Switch
              isChecked={value}
              onChange={onChange}
              isDisabled={input.isDisabled}
              isInvalid={input.isInvalid}
            />
          </Box>
        );
      }

      default: {
        return (
          <JsonEditor
            value={value}
            onChange={onChange}
            placeholder={t(input.placeholder as any) || ''}
            bg={bg}
            resize={true}
            isInvalid={input.isInvalid}
          />
        );
      }
    }
  };

  return (
    <Box _notLast={{ mb: 4 }}>
      {inputType !== InputTypeEnum.fileSelect && (
        <Flex alignItems={'center'} mb={1}>
          {input.required && <Box color={'red.500'}>*</Box>}
          <FormLabel fontWeight={'500'}>{t(input.label as any)}</FormLabel>
          {input.description && <QuestionTip ml={2} label={t(input.description as any)} />}
          {showCustomVariableTag && inputType === InputTypeEnum.customVariable && (
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
      )}

      {renderInput()}
    </Box>
  );
};

export default InputRender;
