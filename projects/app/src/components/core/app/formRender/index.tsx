import React, { useMemo, useState } from 'react';
import {
  Box,
  Input,
  Switch,
  Flex,
  IconButton,
  InputGroup,
  InputLeftElement
} from '@chakra-ui/react';
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
import GlobalVarFilePreview from '@/components/core/chat/ChatContainer/components/GlobalVarFilePreview';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useSystemStore } from '@/web/common/system/useSystemStore';

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

  const { t } = useSafeTranslation();
  // const { llmModelList } = useSystemStore();

  // Password
  const [isPasswordEditing, setIsPasswordEditing] = useState(false);
  // File
  const [urlInput, setUrlInput] = useState('');
  const [urlFileList, setUrlFileList] = useState<string[]>([]);

  const isSelectAll = useMemo(() => {
    return (
      inputType === InputTypeEnum.multipleSelect &&
      Array.isArray(value) &&
      value.length === (props.list?.length || 0)
    );
    // @ts-ignore
  }, [inputType, value, props.list?.length]);

  const commonProps = useMemoEnhance(
    () => ({
      value,
      onChange,
      isDisabled,
      isInvalid,
      placeholder: t(placeholder as any),
      bg
    }),
    [bg, isDisabled, isInvalid, onChange, placeholder, t, value]
  );

  if (customRender) {
    return <>{customRender(props)}</>;
  }

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
          <MyIcon name="checkCircle" w={'16px'} color={isDisabled ? 'myGray.500' : 'primary.600'} />
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
    const { llmModelList } = useSystemStore();
    return (
      <AIModelSelector
        {...commonProps}
        list={
          llmModelList?.map((item) => ({
            value: item.model,
            label: item.name
          })) || []
        }
      />
    );
  }

  if (inputType === InputTypeEnum.fileSelect) {
    const handleAddUrl = () => {
      const trimmedUrl = urlInput.trim();
      if (trimmedUrl) {
        setUrlFileList((prev) => [...prev, trimmedUrl]);
        setUrlInput('');
      }
    };

    const handleDeleteUrl = (index: number) => {
      const newFileList = urlFileList.filter((_, i) => i !== index);
      setUrlFileList(newFileList);
    };

    const allFiles = [
      ...(Array.isArray(value) ? value : []),
      ...urlFileList.map((url) => ({
        id: url,
        status: 0,
        name: url,
        url: url,
        icon: url,
        type: 'file'
      }))
    ];

    const handleRemoveFile = (index?: number | number[]) => {
      if (index === undefined) return;

      const indices = Array.isArray(index) ? index : [index];
      indices.forEach((idx) => {
        if (idx < (Array.isArray(value) ? value.length : 0)) {
          const newValue = Array.isArray(value) ? value.filter((_, i) => i !== idx) : [];
          onChange(newValue);
        } else {
          const urlIndex = idx - (Array.isArray(value) ? value.length : 0);
          handleDeleteUrl(urlIndex);
        }
      });
    };

    return (
      <>
        {props.canLocalUpload && (
          <FileSelector
            {...commonProps}
            maxFiles={props.maxFiles}
            canSelectFile={props.canSelectFile}
            canSelectImg={props.canSelectImg}
            canSelectAudio={props.canSelectAudio}
            canSelectVideo={props.canSelectVideo}
            canSelectCustomFileExtension={props.canSelectCustomFileExtension}
            customFileExtensionList={props.customFileExtensionList}
            setUploading={props.setUploading}
            form={props.form}
            fieldName={props.fieldName}
          />
        )}
        {props.canUrlUpload && (
          <Box mt={'8px'}>
            <InputGroup>
              <InputLeftElement>
                <MyIcon name="common/addLight" w={'22px'} h={'22px'} color={'blue.600'} />
              </InputLeftElement>
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onBlur={handleAddUrl}
                border={'1.5px dashed'}
                borderColor={'myGray.250'}
                borderRadius={'8px'}
                p={'8px'}
                pl={'40px'}
                placeholder={t('chat:click_to_add_url')}
                h="auto"
              />
            </InputGroup>
          </Box>
        )}
        {allFiles.length > 0 && (
          <GlobalVarFilePreview fileList={allFiles} removeFiles={handleRemoveFile} />
        )}
      </>
    );
  }

  if (inputType === InputTypeEnum.selectDataset) {
    const list = props.dataset?.map((item: any) => ({
      label: item.name,
      value: item.datasetId,
      icon: item.avatar,
      iconSize: '1.5rem'
    }));

    const selectedValues = Array.isArray(value)
      ? value.map((item: any) => (typeof item === 'string' ? item : item.datasetId))
      : typeof value === 'string'
        ? [value]
        : [];

    return (
      <MultipleSelect<string>
        {...commonProps}
        h={10}
        list={list ?? []}
        value={selectedValues}
        onSelect={(selectedVals) => {
          onChange(
            selectedVals.map((val) => {
              const item = list?.find((l) => l.value === val);
              return item
                ? {
                    name: item.label,
                    datasetId: item.value,
                    icon: item.icon
                  }
                : { name: val, datasetId: val, icon: '' };
            })
          );
        }}
        isSelectAll={selectedValues.length === list?.length && list?.length > 0}
        itemWrap
      />
    );
  }

  if (inputType === InputTypeEnum.timePointSelect) {
    const { timeRangeStart, timeRangeEnd, defaultValue } = props;
    const val = value || defaultValue;
    return (
      <TimeInput
        value={val ? new Date(val) : undefined}
        onDateTimeChange={(date) => onChange(date ? date.toISOString() : undefined)}
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
            value={startDate ? new Date(formatTime2YMDHMS(startDate)) : undefined}
            onDateTimeChange={(date) => {
              const newArray = [...rangeArray];
              newArray[0] = date ? date.toISOString() : undefined;
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
            value={endDate ? new Date(formatTime2YMDHMS(endDate)) : undefined}
            onDateTimeChange={(date) => {
              const newArray = [...rangeArray];
              newArray[1] = date ? date.toISOString() : undefined;
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

export default InputRender;
