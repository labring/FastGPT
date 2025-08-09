import React from 'react';
import { Box, Switch, Input } from '@chakra-ui/react';
import type { InputRenderProps } from './type';
import { InputTypeEnum } from './constant';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MultipleSelect, {
  useMultipleSelect
} from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import JSONEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import AIModelSelector from '../../../Select/AIModelSelector';
import FileSelector from '../../../Select/FileSelector';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

const InputRender = (props: InputRenderProps) => {
  const {
    inputType,
    customRender,
    value,
    onChange,
    isDisabled,
    isInvalid,
    placeholder,
    bg = 'white'
  } = props;
  if (customRender) {
    return <>{customRender(props)}</>;
  }

  const { t } = useSafeTranslation();
  const {
    value: selectedValue,
    setValue,
    isSelectAll,
    setIsSelectAll
  } = useMultipleSelect<string>(
    Array.isArray(value) ? value : [],
    inputType === InputTypeEnum.multipleSelect &&
      Array.isArray(value) &&
      value.length === (props.list?.length || 0)
  );

  // Synchronize external value changes
  React.useEffect(() => {
    if (inputType === InputTypeEnum.multipleSelect && Array.isArray(value)) {
      setValue(value);
    }
  }, [value, inputType, setValue]);

  const commonProps = {
    value,
    onChange,
    isDisabled,
    isInvalid,
    placeholder: t(placeholder as any),
    bg
  };

  const renderInput = () => {
    if (inputType === InputTypeEnum.input) {
      return (
        <PromptEditor
          {...commonProps}
          variables={props.variables}
          variableLabels={props.variableLabels}
          title={props.title}
          maxLength={props.maxLength}
          minH={40}
          maxH={120}
        />
      );
    }

    if (inputType === InputTypeEnum.password) {
      return (
        <Input
          {...commonProps}
          type="password"
          placeholder={t('common:core.module.password_placeholder')}
          maxLength={props.maxLength}
        />
      );
    }

    if (inputType === InputTypeEnum.textarea) {
      return (
        <PromptEditor
          {...commonProps}
          variables={props.variables}
          variableLabels={props.variableLabels}
          title={props.title}
          maxLength={props.maxLength}
          minH={100}
          maxH={300}
        />
      );
    }

    if (inputType === InputTypeEnum.numberInput) {
      return (
        <MyNumberInput
          {...commonProps}
          value={value ?? ''}
          min={props.min}
          max={props.max}
          bg={undefined}
          inputFieldProps={{ bg: bg }}
        />
      );
    }

    if (inputType === InputTypeEnum.switch) {
      return (
        <Switch
          isChecked={value}
          onChange={(e) => onChange(e.target.checked)}
          isDisabled={isDisabled}
        />
      );
    }

    if (inputType === InputTypeEnum.select) {
      const list =
        props.list || props.enums?.map((item) => ({ label: item.value, value: item.value })) || [];
      return <MySelect {...commonProps} list={list} h={10} />;
    }

    if (inputType === InputTypeEnum.multipleSelect) {
      const list =
        props.list || props.enums?.map((item) => ({ label: item.value, value: item.value })) || [];
      return (
        <MultipleSelect<string>
          {...commonProps}
          h={10}
          list={list}
          value={selectedValue}
          onSelect={(val) => {
            setValue(val);
            onChange(val);
          }}
          isSelectAll={isSelectAll}
          setIsSelectAll={(all) => {
            setIsSelectAll(all);
            if (all) {
              // When selecting all, select all options
              onChange(list.map((item) => item.value));
            } else {
              // When deselecting all, clear the selection
              onChange([]);
            }
          }}
        />
      );
    }

    if (inputType === InputTypeEnum.JSONEditor) {
      return <JSONEditor {...commonProps} resize />;
    }

    if (inputType === InputTypeEnum.selectLLMModel) {
      return (
        <AIModelSelector
          {...commonProps}
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
      return (
        <FileSelector
          {...commonProps}
          canSelectFile={props.canSelectFile}
          canSelectImg={props.canSelectImg}
          maxFiles={props.maxFiles}
          setUploading={props.setUploading}
          form={props.form}
          fieldName={props.fieldName}
        />
      );
    }

    return null;
  };

  return <Box>{renderInput()}</Box>;
};

export default InputRender;
