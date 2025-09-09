import React, { useMemo, useState } from 'react';
import { Box, Input, Switch, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { InputRenderProps } from './type';
import { InputTypeEnum } from './constant';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import JSONEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import AIModelSelector from '../../../Select/AIModelSelector';
import FileSelector from '../../../Select/FileSelector';
import TimeInput from './TimeInput';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { isSecretValue } from '@fastgpt/global/common/secret/utils';

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

  const [isPasswordEditing, setIsPasswordEditing] = useState(false);

  if (customRender) {
    return <>{customRender(props)}</>;
  }

  const { t } = useSafeTranslation();

  const isSelectAll = useMemo(() => {
    return (
      inputType === InputTypeEnum.multipleSelect &&
      Array.isArray(value) &&
      value.length === (props.list?.length || 0)
    );
    // @ts-ignore
  }, [inputType, value, props.list?.length]);

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
          isRichText={true}
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
      const isPasswordConfigured = isSecretValue(value);
      return !isPasswordConfigured || isPasswordEditing ? (
        <Input
          {...commonProps}
          type="password"
          value={typeof value === 'string' ? value : ''}
          autoFocus={isPasswordEditing}
          onBlur={() => setIsPasswordEditing(false)}
          autoComplete="new-password"
          data-form-type="other"
        />
      ) : (
        <Flex alignItems="center" gap={2}>
          <Flex
            flex={1}
            borderRadius={'6px'}
            border={'0.5px solid'}
            borderColor={isDisabled ? 'myGray.200' : 'primary.200'}
            bg={isDisabled ? 'myGray.50' : 'primary.50'}
            h={9}
            px={3}
            alignItems={'center'}
            gap={1}
            opacity={isDisabled ? 0.6 : 1}
          >
            <MyIcon
              name="checkCircle"
              w={'16px'}
              color={isDisabled ? 'myGray.500' : 'primary.600'}
            />
            <Box
              fontSize={'sm'}
              fontWeight={'medium'}
              color={isDisabled ? 'myGray.500' : 'primary.600'}
            >
              {t('common:had_auth_value')}
            </Box>
          </Flex>
          <IconButton
            aria-label="Edit password"
            icon={<MyIcon name="edit" w={'16px'} />}
            size="sm"
            variant="ghost"
            color={'myGray.500'}
            _hover={{ color: 'primary.600' }}
            isDisabled={isDisabled}
            onClick={() => setIsPasswordEditing(true)}
          />
        </Flex>
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
          value={value}
          onSelect={onChange}
          isSelectAll={isSelectAll}
          itemWrap
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

    if (inputType === InputTypeEnum.timePointSelect) {
      const { timeRangeStart, timeRangeEnd } = props;
      return (
        <TimeInput
          value={value ? new Date(value) : new Date()}
          onDateTimeChange={(date) => onChange(date.toISOString())}
          timeGranularity={props.timeGranularity}
          minDate={timeRangeStart ? new Date(timeRangeStart) : undefined}
          maxDate={timeRangeEnd ? new Date(timeRangeEnd) : undefined}
        />
      );
    }

    if (inputType === InputTypeEnum.timeRangeSelect) {
      const { timeRangeStart, timeRangeEnd } = props;
      const rangeArray = Array.isArray(value) ? value : [null, null];
      const [startDate, endDate] = rangeArray;
      return (
        <Box>
          <Box mb={2}>
            <Box fontSize="12px" color="myGray.500" mb={1}>
              {t('app:time_range_start')}
            </Box>
            <TimeInput
              value={startDate ? new Date(startDate) : new Date()}
              onDateTimeChange={(date) => {
                const newArray = [...rangeArray];
                newArray[0] = date.toISOString();
                onChange(newArray);
              }}
              timeGranularity={props.timeGranularity}
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
              value={endDate ? new Date(endDate) : new Date()}
              onDateTimeChange={(date) => {
                const newArray = [...rangeArray];
                newArray[1] = date.toISOString();
                onChange(newArray);
              }}
              timeGranularity={props.timeGranularity}
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

    return null;
  };

  return <Box>{renderInput()}</Box>;
};

export default InputRender;
