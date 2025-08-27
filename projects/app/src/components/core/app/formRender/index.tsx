import React from 'react';
import { Box, Input, Switch } from '@chakra-ui/react';
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
import TimeInput from './TimeInput';
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
    value,
    inputType === InputTypeEnum.multipleSelect && value.length === (props.list?.length || 0)
  );

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
          ExtensionPopover={props.ExtensionPopover}
        />
      );
    }

    if (inputType === InputTypeEnum.password) {
      return <Input {...commonProps} type="password" minLength={props.minLength} />;
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
            onChange(all ? list.map((item) => item.value) : []);
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

    if (inputType === InputTypeEnum.dateTimePicker) {
      const {
        timeGranularity = 'second',
        timeType = 'point',
        timeRangeStart,
        timeRangeEnd
      } = props;

      if (timeType === 'point') {
        return (
          <TimeInput
            value={value ? new Date(value) : undefined}
            onDateTimeChange={(date) => onChange(date.toISOString())}
            timeGranularity={timeGranularity}
            minDate={timeRangeStart ? new Date(timeRangeStart) : undefined}
            maxDate={timeRangeEnd ? new Date(timeRangeEnd) : undefined}
          />
        );
      } else {
        // For time range, use array format: [dateStart, dateEnd]
        const rangeArray = Array.isArray(value) ? value : [null, null];
        const [startDate, endDate] = rangeArray;

        const updateRange = (index: number, newDate: string) => {
          const newArray = [...rangeArray];
          newArray[index] = newDate;
          onChange(newArray);
        };

        return (
          <Box>
            <Box mb={2}>
              <Box fontSize="12px" color="myGray.500" mb={1}>
                {t('app:time_range_start')}
              </Box>
              <TimeInput
                value={startDate ? new Date(startDate) : undefined}
                onDateTimeChange={(date) => updateRange(0, date.toISOString())}
                timeGranularity={timeGranularity}
                maxDate={
                  endDate ? new Date(endDate) : timeRangeEnd ? new Date(timeRangeEnd) : undefined
                }
                minDate={timeRangeStart ? new Date(timeRangeStart) : undefined}
              />
            </Box>
            <Box>
              <Box fontSize="12px" color="myGray.500" mb={1}>
                {t('app:time_range_end')}
              </Box>
              <TimeInput
                value={endDate ? new Date(endDate) : undefined}
                onDateTimeChange={(date) => updateRange(1, date.toISOString())}
                timeGranularity={timeGranularity}
                minDate={
                  startDate
                    ? new Date(startDate)
                    : timeRangeStart
                      ? new Date(timeRangeStart)
                      : undefined
                }
                maxDate={timeRangeEnd ? new Date(timeRangeEnd) : undefined}
              />
            </Box>
          </Box>
        );
      }
    }

    return null;
  };

  return <Box>{renderInput()}</Box>;
};

export default InputRender;
