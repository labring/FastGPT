import React from 'react';
import { Box, Switch } from '@chakra-ui/react';
import type { InputRenderProps } from './type';
import { InputTypeEnum } from './constant';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import JSONEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import AIModelSelector from '../Select/AIModelSelector';
import FileSelector from '../Select/FileSelector';

const InputRender = (props: InputRenderProps) => {
  const { inputType, customRender } = props;

  if (customRender) {
    return <>{customRender(props)}</>;
  }

  const Render = (() => {
    if (inputType === InputTypeEnum.input) {
      return <PromptEditor {...props} minH={30} maxH={120} />;
    }
    if (inputType === InputTypeEnum.textarea) {
      return <PromptEditor {...props} minH={100} maxH={300} />;
    }
    if (inputType === InputTypeEnum.numberInput) {
      return <MyNumberInput {...props} inputFieldProps={{ bg: 'white' }} />;
    }
    if (inputType === InputTypeEnum.switch) {
      const { value, ...rest } = props;
      return <Switch {...rest} isChecked={value} />;
    }
    if (inputType === InputTypeEnum.select) {
      return <MySelect {...props} list={props.list || []} h={10} />;
    }
    if (inputType === InputTypeEnum.multipleSelect) {
      const { onChange, value, list } = props;
      return (
        <MultipleSelect<string>
          {...props}
          h={10}
          bg={'white'}
          list={list || []}
          onSelect={onChange}
          isSelectAll={value.length === list?.length}
          setIsSelectAll={(all) => {
            if (all) {
              onChange(list?.map((item) => item.value));
            } else {
              onChange([]);
            }
          }}
        />
      );
    }
    if (inputType === InputTypeEnum.JSONEditor) {
      return <JSONEditor {...props} />;
    }
    if (inputType === InputTypeEnum.selectLLMModel) {
      return (
        <AIModelSelector
          {...props}
          list={
            props.modelList?.map((item) => ({
              value: item.model,
              label: item.name
            })) || []
          }
        />
      );
    }
    if (inputType === InputTypeEnum.fileSelect) {
      return <FileSelector {...props} form={props.form!} fieldName={props.fieldName!} />;
    }
    return null;
  })();

  return <Box>{Render}</Box>;
};

export default InputRender;
