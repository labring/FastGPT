import {
  Box,
  Button,
  Checkbox,
  Flex,
  FormControl,
  Grid,
  HStack,
  Input,
  Stack,
  Switch,
  Textarea,
  useDisclosure
} from '@chakra-ui/react';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowValueTypeMap
} from '@fastgpt/global/core/workflow/node/constant';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MultipleSelect, {
  useMultipleSelect
} from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import React, { useCallback, useMemo, useState } from 'react';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import TimeInput from '@/components/core/app/formRender/TimeInput';

import MySlider from '@/components/Slider';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import RadioGroup from '@fastgpt/web/components/common/Radio/RadioGroup';
import { DatasetSelectModal } from '@/components/core/app/DatasetSelectModal';
import type { EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.d';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import { FileTypeSelectorPanel } from '@fastgpt/web/components/core/app/FileTypeSelector';
import InputSlider from '@fastgpt/web/components/common/MySlider/InputSlider';

const InputTypeConfig = ({
  form,
  isEdit,
  onClose,
  type,
  inputType,
  defaultValueType,
  onSubmitSuccess,
  onSubmitError
}: {
  // Common fields
  form: UseFormReturn<any, any>;
  isEdit: boolean;
  onClose: () => void;
  type: 'plugin' | 'formInput' | 'variable';
  inputType: FlowNodeInputTypeEnum | VariableInputEnum;

  // Plugin-specific fields
  defaultValueType?: WorkflowIOValueTypeEnum;

  // Update methods
  onSubmitSuccess: (data: any, action: 'confirm' | 'continue') => void;
  onSubmitError: (e: Object) => void;
}) => {
  const { t } = useTranslation();
  const defaultListValue = { label: t('common:None'), value: '' };
  const { feConfigs, llmModelList } = useSystemStore();

  const availableModels = useMemoEnhance(() => {
    return llmModelList.map((model) => ({
      value: model.model,
      label: model.name
    }));
  }, [llmModelList]);

  const typeLabels = useMemo(() => {
    return {
      name: {
        formInput: t('common:core.module.input_name'),
        plugin: t('common:core.module.Field Name'),
        variable: t('workflow:Variable_name')
      },
      description: {
        formInput: t('common:core.module.input_description'),
        plugin: t('workflow:field_description'),
        variable: t('workflow:variable_description')
      }
    };
  }, [t]);

  const { register, setValue, handleSubmit, control, watch, getValues } = form;
  const maxLength = watch('maxLength');
  const max = watch('max');
  const min = watch('min');
  const minLength = watch('minLength');
  const defaultValue = watch('defaultValue');
  const valueType = watch('valueType');

  const timeGranularity = watch('timeGranularity');
  const timeRangeStart = watch('timeRangeStart');
  const timeRangeEnd = watch('timeRangeEnd');
  const timeRangeStartDefault =
    inputType === VariableInputEnum.timeRangeSelect && Array.isArray(defaultValue)
      ? defaultValue?.[0]
      : undefined;
  const timeRangeEndDefault =
    inputType === VariableInputEnum.timeRangeSelect && Array.isArray(defaultValue)
      ? defaultValue?.[1]
      : undefined;

  const maxFiles = watch('maxFiles') ?? 5;
  const maxSelectFiles = Math.min(feConfigs?.uploadFileMaxAmount ?? 20, 50);
  const canSelectFile = watch('canSelectFile') ?? true;
  const canSelectImg = watch('canSelectImg');
  const canSelectVideo = watch('canSelectVideo');
  const canSelectAudio = watch('canSelectAudio');
  const canSelectCustomFileExtension = watch('canSelectCustomFileExtension');
  const customFileExtensionList = watch('customFileExtensionList');
  const canLocalUpload = watch('canLocalUpload') ?? true;
  const canUrlUpload = watch('canUrlUpload');

  const {
    isOpen: isOpenDatasetSelect,
    onOpen: onOpenDatasetSelect,
    onClose: onCloseDatasetSelect
  } = useDisclosure();
  const datasetOptions = watch('datasetOptions');

  const selectValueTypeList = watch('customInputConfig.selectValueTypeList');
  const { isSelectAll: isSelectAllValueType, setIsSelectAll: setIsSelectAllValueType } =
    useMultipleSelect(selectValueTypeList, false);

  const toolDescription = watch('toolDescription');
  const isToolInput = !!toolDescription;

  const listValue = watch('list') ?? [];
  const {
    fields: selectEnums,
    append: appendEnums,
    remove: removeEnums
  } = useFieldArray({
    control,
    name: 'list'
  });

  const mergedSelectEnums = selectEnums.map((field, index) => ({
    ...field,
    ...listValue[index]
  }));

  const valueTypeSelectList = Object.values(FlowValueTypeMap)
    .filter((item) => !item.abandon)
    .map((item) => ({
      label: t(item.label as any),
      value: item.value
    }));

  const showValueTypeSelect =
    inputType === FlowNodeInputTypeEnum.reference ||
    inputType === FlowNodeInputTypeEnum.customVariable ||
    inputType === FlowNodeInputTypeEnum.hidden ||
    inputType === VariableInputEnum.custom ||
    inputType === VariableInputEnum.internal;

  const showRequired = useMemo(() => {
    const list = [
      FlowNodeInputTypeEnum.addInputParam,
      FlowNodeInputTypeEnum.customVariable,
      FlowNodeInputTypeEnum.hidden,
      FlowNodeInputTypeEnum.switch,
      VariableInputEnum.timePointSelect,
      VariableInputEnum.timeRangeSelect,
      VariableInputEnum.switch,
      VariableInputEnum.custom,
      VariableInputEnum.internal
    ];
    return !list.includes(inputType);
  }, [inputType]);

  const showMaxLenInput = useMemo(() => {
    const list = [FlowNodeInputTypeEnum.input];
    return list.includes(inputType as FlowNodeInputTypeEnum);
  }, [inputType]);

  const showMinMaxInput = useMemo(() => {
    const list = [FlowNodeInputTypeEnum.numberInput];
    return list.includes(inputType as FlowNodeInputTypeEnum);
  }, [inputType]);

  const showDefaultValue = useMemo(() => {
    const map = {
      [FlowNodeInputTypeEnum.input]: true,
      [FlowNodeInputTypeEnum.JSONEditor]: true,
      [FlowNodeInputTypeEnum.numberInput]: true,
      [FlowNodeInputTypeEnum.switch]: true,
      [FlowNodeInputTypeEnum.select]: true,
      [FlowNodeInputTypeEnum.multipleSelect]: true,
      [FlowNodeInputTypeEnum.selectLLMModel]: true,
      [FlowNodeInputTypeEnum.customVariable]: true,
      [FlowNodeInputTypeEnum.hidden]: true,
      [VariableInputEnum.custom]: true,
      [VariableInputEnum.internal]: true,
      [VariableInputEnum.timePointSelect]: true,
      [VariableInputEnum.timeRangeSelect]: true,
      [VariableInputEnum.llmSelect]: true,
      [VariableInputEnum.datasetSelect]: true
    };

    return map[inputType as keyof typeof map];
  }, [inputType]);

  const showIsToolInput = useMemo(() => {
    const list = [
      FlowNodeInputTypeEnum.reference,
      FlowNodeInputTypeEnum.JSONEditor,
      FlowNodeInputTypeEnum.input,
      FlowNodeInputTypeEnum.numberInput,
      FlowNodeInputTypeEnum.switch,
      FlowNodeInputTypeEnum.select,
      FlowNodeInputTypeEnum.multipleSelect
    ];
    return type === 'plugin' && list.includes(inputType as FlowNodeInputTypeEnum);
  }, [inputType, type]);

  const filterValidField = useCallback(
    (data: Record<string, any>) => {
      const commonData: Record<string, any> = {
        renderTypeList: data.renderTypeList,
        type: data.type,

        key: data.key,
        label: data.label,
        valueType: data.valueType,
        valueDesc: data.valueDesc,
        description: data.description,
        toolDescription: data.toolDescription,
        required: data.required,
        defaultValue: data.defaultValue
      };

      switch (inputType) {
        case FlowNodeInputTypeEnum.input:
        case FlowNodeInputTypeEnum.textarea:
          commonData.maxLength = data.maxLength;
          break;
        case FlowNodeInputTypeEnum.numberInput:
          commonData.max = data.max;
          commonData.min = data.min;
          break;
        case FlowNodeInputTypeEnum.select:
        case FlowNodeInputTypeEnum.multipleSelect:
          commonData.list = data.list;
          break;
        case FlowNodeInputTypeEnum.addInputParam:
          commonData.customInputConfig = data.customInputConfig;
          break;
        case FlowNodeInputTypeEnum.fileSelect:
          commonData.canLocalUpload = data.canLocalUpload ?? true;
          commonData.canUrlUpload = data.canUrlUpload;
          commonData.canSelectFile = data.canSelectFile ?? true;
          commonData.canSelectImg = data.canSelectImg;
          commonData.canSelectVideo = data.canSelectVideo;
          commonData.canSelectAudio = data.canSelectAudio;
          commonData.canSelectCustomFileExtension = data.canSelectCustomFileExtension;
          commonData.customFileExtensionList = data.customFileExtensionList;
          commonData.maxFiles = data.maxFiles ?? 5;
          break;
        case FlowNodeInputTypeEnum.timePointSelect:
        case FlowNodeInputTypeEnum.timeRangeSelect:
          commonData.timeGranularity = data.timeGranularity;
          commonData.timeRangeStart = data.timeRangeStart;
          commonData.timeRangeEnd = data.timeRangeEnd;
          break;
        case FlowNodeInputTypeEnum.password:
          commonData.minLength = data.minLength;
          break;
      }

      if (inputType === VariableInputEnum.datasetSelect) {
        commonData.datasetOptions = data.datasetOptions;
      }

      if (inputType === VariableInputEnum.file) {
        commonData.canSelectFile = data.canSelectFile;
        commonData.canSelectImg = data.canSelectImg;
        commonData.canSelectVideo = data.canSelectVideo;
        commonData.canSelectAudio = data.canSelectAudio;
        commonData.canSelectCustomFileExtension = data.canSelectCustomFileExtension;
        commonData.customFileExtensionList = data.customFileExtensionList;
        commonData.canLocalUpload = data.canLocalUpload;
        commonData.canUrlUpload = data.canUrlUpload;
        commonData.maxFiles = data.maxFiles;
      }

      if (commonData.timeRangeStart) {
        commonData.timeRangeStart = formatTime2YMDHMS(new Date(commonData.timeRangeStart));
      }
      if (commonData.timeRangeEnd) {
        commonData.timeRangeEnd = formatTime2YMDHMS(new Date(commonData.timeRangeEnd));
      }
      if (inputType === FlowNodeInputTypeEnum.timePointSelect && commonData.defaultValue) {
        commonData.defaultValue = formatTime2YMDHMS(new Date(commonData.defaultValue));
      } else if (
        inputType === FlowNodeInputTypeEnum.timeRangeSelect &&
        Array.isArray(commonData.defaultValue)
      ) {
        commonData.defaultValue = commonData.defaultValue.map((item) =>
          item ? formatTime2YMDHMS(new Date(item)) : ''
        );
      }

      return commonData;
    },
    [inputType]
  );

  return (
    <Stack flex={1} borderLeft={'1px solid #F0F1F6'} justifyContent={'space-between'}>
      <Flex flexDirection={'column'} p={8} gap={4} flex={'1 0 0'} overflow={'auto'}>
        <Flex alignItems={'center'}>
          <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
            {typeLabels.name[type] || typeLabels.name.formInput}
          </FormLabel>
          <Input
            bg={'myGray.50'}
            maxLength={30}
            placeholder="appointment/sql"
            {...register('label', {
              required: true
            })}
          />
        </Flex>
        <Flex alignItems={'flex-start'}>
          <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
            {typeLabels.description[type] || typeLabels.description.plugin}
          </FormLabel>
          <Textarea
            bg={'myGray.50'}
            placeholder={t('workflow:field_description_placeholder')}
            rows={3}
            minH={10}
            {...register('description', {
              required: showIsToolInput && isToolInput ? true : false
            })}
          />
        </Flex>

        {/* value type */}
        {type !== 'formInput' && (
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
              {t('common:core.module.Data Type')}
            </FormLabel>
            {showValueTypeSelect ? (
              <Box flex={1}>
                <MySelect<WorkflowIOValueTypeEnum>
                  list={valueTypeSelectList.filter(
                    (item) => item.value !== WorkflowIOValueTypeEnum.arrayAny
                  )}
                  value={valueType}
                  onChange={(e) => {
                    setValue('valueType', e);
                  }}
                />
              </Box>
            ) : (
              <Box fontSize={'14px'}>
                {defaultValueType ? t(FlowValueTypeMap[defaultValueType]?.label as any) : ''}
              </Box>
            )}
          </Flex>
        )}
        {showRequired && (
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
              {t('workflow:field_required')}
            </FormLabel>
            <Switch {...register('required')} />
          </Flex>
        )}
        {/* reference */}
        {showIsToolInput && (
          <>
            <Flex alignItems={'center'}>
              <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
                {t('workflow:field_used_as_tool_input')}
              </FormLabel>
              <Switch
                isChecked={isToolInput}
                onChange={(e) => {
                  setValue('toolDescription', e.target.checked ? 'sign' : '');
                }}
              />
            </Flex>
          </>
        )}

        {showMaxLenInput && (
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
              {t('common:core.module.Max Length')}
            </FormLabel>
            <MyNumberInput
              placeholder={t('common:core.module.Max Length placeholder')}
              value={maxLength}
              max={50000}
              onChange={(e) => {
                // @ts-ignore
                setValue('maxLength', e ?? '');
              }}
            />
          </Flex>
        )}

        {showMinMaxInput && (
          <>
            <Flex alignItems={'center'}>
              <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
                {t('common:core.module.Max Value')}
              </FormLabel>
              <MyNumberInput
                value={max}
                onChange={(e) => {
                  // @ts-ignore
                  setValue('max', e ?? '');
                }}
              />
            </Flex>
            <Flex alignItems={'center'}>
              <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
                {t('common:core.module.Min Value')}
              </FormLabel>
              <MyNumberInput
                value={min}
                onChange={(e) => {
                  // @ts-ignore
                  setValue('min', e ?? '');
                }}
              />
            </Flex>
          </>
        )}

        {(inputType === VariableInputEnum.timePointSelect ||
          inputType === VariableInputEnum.timeRangeSelect) && (
          <>
            <Flex>
              <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
                {t('app:time_granularity')}
              </FormLabel>
              <RadioGroup
                list={[
                  { title: t('common:day'), value: 'day' },
                  { title: t('common:hour'), value: 'hour' },
                  { title: t('common:minute'), value: 'minute' },
                  { title: t('common:second'), value: 'second' }
                ]}
                value={timeGranularity || 'day'}
                onChange={(value) => setValue('timeGranularity', value)}
              />
            </Flex>
            <Flex alignItems={'flex-top'}>
              <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
                {t('app:time_range_limit')}
              </FormLabel>
              <Flex flexDirection={'column'} gap={3}>
                <Box>
                  <Box color={'myGray.500'} fontSize="12px" mb={1}>
                    {t('app:time_range_start')}
                  </Box>
                  <TimeInput
                    value={timeRangeStart ? new Date(timeRangeStart) : undefined}
                    onDateTimeChange={(date) => {
                      setValue('timeRangeStart', date);
                    }}
                    popPosition="top"
                    timeGranularity={timeGranularity}
                    maxDate={timeRangeEnd ? new Date(timeRangeEnd) : undefined}
                  />
                </Box>
                <Box>
                  <Box color={'myGray.500'} fontSize="12px" mb={1}>
                    {t('app:time_range_end')}
                  </Box>
                  <TimeInput
                    value={timeRangeEnd ? new Date(timeRangeEnd) : undefined}
                    onDateTimeChange={(date) => {
                      setValue('timeRangeEnd', date);
                    }}
                    popPosition="top"
                    timeGranularity={timeGranularity}
                    minDate={timeRangeStart ? new Date(timeRangeStart) : undefined}
                  />
                </Box>
              </Flex>
            </Flex>
          </>
        )}

        {showDefaultValue && (
          <Flex alignItems={'center'} minH={'40px'}>
            <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
              {t('common:core.module.Default Value')}
            </FormLabel>
            <Flex flex={1} h={10}>
              {(inputType === FlowNodeInputTypeEnum.numberInput ||
                ((inputType === VariableInputEnum.custom ||
                  inputType === VariableInputEnum.internal ||
                  inputType === FlowNodeInputTypeEnum.customVariable ||
                  inputType === FlowNodeInputTypeEnum.hidden) &&
                  valueType === WorkflowIOValueTypeEnum.number)) && (
                <MyNumberInput
                  value={defaultValue}
                  min={min}
                  max={max}
                  onChange={(e) => {
                    // @ts-ignore
                    setValue('defaultValue', e ?? '');
                  }}
                />
              )}
              {(inputType === FlowNodeInputTypeEnum.input ||
                ((inputType === VariableInputEnum.custom ||
                  inputType === VariableInputEnum.internal ||
                  inputType === FlowNodeInputTypeEnum.customVariable ||
                  inputType === FlowNodeInputTypeEnum.hidden) &&
                  valueType === WorkflowIOValueTypeEnum.string)) && (
                <MyTextarea
                  value={defaultValue}
                  onChange={(e) => setValue('defaultValue', e.target.value)}
                  bg={'myGray.50'}
                  autoHeight
                  title={t('common:core.module.Default Value')}
                  minH={40}
                  maxH={100}
                />
              )}
              {(inputType === FlowNodeInputTypeEnum.JSONEditor ||
                ((inputType === VariableInputEnum.custom ||
                  inputType === VariableInputEnum.internal ||
                  inputType === FlowNodeInputTypeEnum.customVariable ||
                  inputType === FlowNodeInputTypeEnum.hidden) &&
                  ![
                    WorkflowIOValueTypeEnum.number,
                    WorkflowIOValueTypeEnum.string,
                    WorkflowIOValueTypeEnum.boolean
                  ].includes(valueType))) && (
                <JsonEditor
                  bg={'myGray.50'}
                  resize
                  w={'full'}
                  onChange={(e) => {
                    setValue('defaultValue', e);
                  }}
                  value={defaultValue}
                />
              )}
              {(inputType === FlowNodeInputTypeEnum.switch ||
                ((inputType === VariableInputEnum.custom ||
                  inputType === VariableInputEnum.internal ||
                  inputType === FlowNodeInputTypeEnum.customVariable ||
                  inputType === FlowNodeInputTypeEnum.hidden) &&
                  valueType === WorkflowIOValueTypeEnum.boolean)) && (
                <Flex h={10} alignItems={'center'}>
                  <Switch {...register('defaultValue')} />
                </Flex>
              )}
              {inputType === FlowNodeInputTypeEnum.select && (
                <MySelect<string>
                  list={[defaultListValue, ...listValue]
                    .filter((item) => item.label !== '')
                    .map((item) => ({
                      label: item.label,
                      value: item.value
                    }))}
                  value={
                    defaultValue && listValue.map((item: any) => item.value).includes(defaultValue)
                      ? defaultValue
                      : ''
                  }
                  onChange={(e) => {
                    setValue('defaultValue', e);
                  }}
                  w={'200px'}
                />
              )}
              {inputType === FlowNodeInputTypeEnum.multipleSelect && (
                <MultipleSelect<string>
                  flex={'1 0 0'}
                  itemWrap={true}
                  bg={'myGray.50'}
                  list={listValue
                    .filter((item: any) => item.label !== '')
                    .map((item: any) => ({
                      label: item.label,
                      value: item.value
                    }))}
                  placeholder={t('workflow:select_default_option')}
                  value={defaultValue || []}
                  onSelect={(val) => setValue('defaultValue', val)}
                  isSelectAll={
                    defaultValue &&
                    defaultValue.length ===
                      listValue.filter((item: any) => item.label !== '').length
                  }
                />
              )}
              {inputType === VariableInputEnum.timePointSelect && (
                <TimeInput
                  value={defaultValue ? new Date(defaultValue) : undefined}
                  onDateTimeChange={(date) => {
                    setValue('defaultValue', date);
                  }}
                  popPosition="top"
                  timeGranularity={timeGranularity}
                  minDate={timeRangeStart ? new Date(timeRangeStart) : undefined}
                  maxDate={timeRangeEnd ? new Date(timeRangeEnd) : undefined}
                />
              )}
              {inputType === VariableInputEnum.timeRangeSelect && (
                <Flex flexDirection={'column'} gap={3}>
                  <Box>
                    <Box color={'myGray.500'} fontSize="12px" mb={1}>
                      {t('app:time_range_start')}
                    </Box>
                    <TimeInput
                      value={timeRangeStartDefault}
                      onDateTimeChange={(date) => {
                        setValue('defaultValue', [date, timeRangeEndDefault]);
                      }}
                      popPosition="top"
                      timeGranularity={timeGranularity}
                      minDate={timeRangeStart ? new Date(timeRangeStart) : undefined}
                      maxDate={
                        timeRangeEndDefault && timeRangeEnd
                          ? new Date(
                              Math.min(
                                new Date(timeRangeEndDefault).getTime(),
                                new Date(timeRangeEnd).getTime()
                              )
                            )
                          : timeRangeEndDefault
                            ? new Date(timeRangeEndDefault)
                            : timeRangeEnd
                              ? new Date(timeRangeEnd)
                              : undefined
                      }
                    />
                  </Box>
                  <Box>
                    <Box color={'myGray.500'} fontSize="12px" mb={1}>
                      {t('app:time_range_end')}
                    </Box>
                    <TimeInput
                      value={timeRangeEndDefault}
                      onDateTimeChange={(date) => {
                        setValue('defaultValue', [timeRangeStartDefault, date]);
                      }}
                      popPosition="top"
                      timeGranularity={timeGranularity}
                      minDate={
                        timeRangeStartDefault && timeRangeStart
                          ? new Date(
                              Math.max(
                                new Date(timeRangeStartDefault).getTime(),
                                new Date(timeRangeStart).getTime()
                              )
                            )
                          : timeRangeStartDefault
                            ? new Date(timeRangeStartDefault)
                            : timeRangeStart
                              ? new Date(timeRangeStart)
                              : undefined
                      }
                      maxDate={timeRangeEnd ? new Date(timeRangeEnd) : undefined}
                    />
                  </Box>
                </Flex>
              )}
              {(inputType === VariableInputEnum.llmSelect ||
                inputType === FlowNodeInputTypeEnum.selectLLMModel) && (
                <Box flex={'1'}>
                  <AIModelSelector
                    value={defaultValue}
                    list={availableModels}
                    onChange={(model) => {
                      setValue('defaultValue', model);
                    }}
                  />
                </Box>
              )}
              {inputType === VariableInputEnum.datasetSelect && (
                <MultipleSelect<string>
                  bg={'myGray.50'}
                  h={9}
                  w={369}
                  list={
                    datasetOptions?.map((item: SelectedDatasetType) => ({
                      label: item.name,
                      value: item.datasetId,
                      icon: item.avatar
                    })) || []
                  }
                  placeholder={t('workflow:select_default_option')}
                  value={
                    defaultValue
                      ? defaultValue.map((item: SelectedDatasetType) => item.datasetId)
                      : []
                  }
                  onSelect={(selectedIds) => {
                    const selectedDatasets = selectedIds
                      .map((id) =>
                        datasetOptions?.find((item: SelectedDatasetType) => item.datasetId === id)
                      )
                      .filter(Boolean);
                    setValue('defaultValue', selectedDatasets);
                  }}
                  isSelectAll={
                    defaultValue &&
                    defaultValue.length === datasetOptions?.length &&
                    datasetOptions?.length > 0
                  }
                />
              )}
            </Flex>
          </Flex>
        )}
        {inputType === FlowNodeInputTypeEnum.addInputParam && (
          <>
            <Box>
              <HStack mb={1}>
                <FormLabel fontWeight={'medium'}>{t('workflow:optional_value_type')}</FormLabel>
                <QuestionTip label={t('workflow:optional_value_type_tip')} />
              </HStack>
              <MultipleSelect<WorkflowIOValueTypeEnum>
                list={valueTypeSelectList}
                bg={'myGray.50'}
                minH={'40px'}
                py={2}
                value={selectValueTypeList || []}
                onSelect={(e) => {
                  setValue('customInputConfig.selectValueTypeList', e);
                }}
                isSelectAll={isSelectAllValueType}
                setIsSelectAll={setIsSelectAllValueType}
              />
            </Box>
          </>
        )}

        {(inputType === FlowNodeInputTypeEnum.select ||
          inputType == FlowNodeInputTypeEnum.multipleSelect) && (
          <>
            <DndDrag<{ id: string; value: string }>
              onDragEndCb={(list) => {
                const newOrder = list.map((item) => item.id);
                const newSelectEnums = newOrder
                  .map((id) => mergedSelectEnums.find((item) => item.id === id))
                  .filter(Boolean) as { id: string; value: string }[];
                removeEnums();
                newSelectEnums.forEach((item) =>
                  appendEnums({ label: item.value, value: item.value })
                );

                // 防止最后一个元素被focus
                setTimeout(() => {
                  if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                  }
                }, 0);
              }}
              dataList={mergedSelectEnums}
              renderClone={(provided, snapshot, rubric) => {
                return (
                  <Box
                    bg={'myGray.50'}
                    border={'1px solid'}
                    borderColor={'myGray.200'}
                    p={2}
                    borderRadius="md"
                    boxShadow="md"
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                  >
                    {mergedSelectEnums[rubric.source.index].value}
                  </Box>
                );
              }}
            >
              {({ provided }) => (
                <Box
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  display={'flex'}
                  flexDirection={'column'}
                  gap={4}
                >
                  {mergedSelectEnums.map((item, i) => (
                    <Draggable key={i} draggableId={i.toString()} index={i}>
                      {(provided, snapshot) => (
                        <Box
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          style={{
                            ...provided.draggableProps.style,
                            opacity: snapshot.isDragging ? 0.8 : 1
                          }}
                        >
                          <Flex
                            alignItems={'center'}
                            position={'relative'}
                            transform={snapshot.isDragging ? `scale(0.5)` : ''}
                            transformOrigin={'top left'}
                          >
                            <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
                              {`${t('common:core.module.variable.variable options')} ${i + 1}`}
                            </FormLabel>
                            <FormControl>
                              <Input
                                fontSize={'12px'}
                                bg={'myGray.50'}
                                placeholder={`${t('common:core.module.variable.variable options')} ${i + 1}`}
                                {...register(`list.${i}.label`, {
                                  required: true,
                                  onChange: (e: any) => {
                                    setValue(`list.${i}.value`, e.target.value);
                                  }
                                })}
                              />
                            </FormControl>
                            {selectEnums.length > 1 && (
                              <Flex>
                                <MyIcon
                                  ml={3}
                                  name={'delete'}
                                  w={'16px'}
                                  cursor={'pointer'}
                                  p={2}
                                  borderRadius={'md'}
                                  _hover={{ bg: 'red.100' }}
                                  onClick={() => removeEnums(i)}
                                />
                                <Box {...provided.dragHandleProps}>
                                  <MyIcon
                                    name={'drag'}
                                    cursor={'pointer'}
                                    p={2}
                                    borderRadius={'md'}
                                    _hover={{ color: 'primary.600' }}
                                    w={'16px'}
                                  />
                                </Box>
                              </Flex>
                            )}
                          </Flex>
                        </Box>
                      )}
                    </Draggable>
                  ))}
                </Box>
              )}
            </DndDrag>
            <Button
              variant={'whiteBase'}
              leftIcon={<MyIcon name={'common/addLight'} w={'16px'} />}
              onClick={() => appendEnums({ label: '', value: '' })}
              fontWeight={'medium'}
              fontSize={'12px'}
              w={'24'}
              py={2}
            >
              {t('common:core.module.variable add option')}
            </Button>
          </>
        )}
        {(inputType === FlowNodeInputTypeEnum.fileSelect ||
          inputType === VariableInputEnum.file) && (
          <>
            <Flex alignItems={'center'}>
              <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
                {t('app:upload_method')}
              </FormLabel>
              <Grid gridTemplateColumns={'1fr 1fr'} gap={'12px'} flex={1}>
                <Checkbox
                  p={'3'}
                  h={'32px'}
                  alignItems={'center'}
                  border={'1px solid'}
                  borderColor={'myGray.200'}
                  borderRadius={'md'}
                  isChecked={canLocalUpload}
                  onChange={(e) => setValue('canLocalUpload', e.target.checked)}
                >
                  <Box fontSize={'sm'}>{t('app:local_upload')}</Box>
                </Checkbox>
                <Checkbox
                  p={'3'}
                  h={'32px'}
                  alignItems={'center'}
                  border={'1px solid'}
                  borderColor={'myGray.200'}
                  borderRadius={'md'}
                  isChecked={canUrlUpload ?? false}
                  onChange={(e) => setValue('canUrlUpload', e.target.checked)}
                >
                  <Box fontSize={'sm'}>{t('app:url_upload')}</Box>
                </Checkbox>
              </Grid>
            </Flex>
            <Flex alignItems={'center'}>
              <HStack flex={'0 0 132px'} gap={1}>
                <FormLabel fontWeight={'medium'}>{t('app:upload_file_max_amount')}</FormLabel>
                <QuestionTip label={t('app:upload_file_max_amount_tip')} />
              </HStack>

              <Box flex={'1 0 0'}>
                <InputSlider
                  min={1}
                  max={maxSelectFiles}
                  step={1}
                  value={maxFiles}
                  onChange={(val) => {
                    setValue('maxFiles', val);
                  }}
                />
              </Box>
            </Flex>
            <Box alignItems={'flex-start'}>
              <FormLabel fontWeight={'medium'}>{t('app:upload_file_extension_types')}</FormLabel>
              <Stack
                w="full"
                spacing={3}
                alignItems={'flex-start'}
                border="1px solid"
                borderColor="myGray.200"
                borderRadius="md"
                p={4}
                mt={2}
              >
                <FileTypeSelectorPanel
                  value={{
                    canSelectFile: canSelectFile,
                    canSelectImg: canSelectImg,
                    canSelectVideo: canSelectVideo,
                    canSelectAudio: canSelectAudio,
                    canSelectCustomFileExtension: canSelectCustomFileExtension,
                    customFileExtensionList: customFileExtensionList
                  }}
                  onChange={(newValue) => {
                    Object.entries(newValue).forEach(([key, val]) => {
                      setValue(key as any, val);
                    });
                  }}
                />
              </Stack>
            </Box>
          </>
        )}

        {inputType === VariableInputEnum.datasetSelect && (
          <>
            <Flex w={'full'} alignItems={'center'}>
              <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
                {t('app:dataset_select')}
              </FormLabel>
              <Button
                variant={'primaryOutline'}
                size={'md'}
                flex={1}
                onClick={onOpenDatasetSelect}
                leftIcon={<MyIcon name={'core/dataset/datasetLightSmall'} w={4} />}
              >
                {t('chat:select')}
              </Button>
            </Flex>
            <Flex>
              <Box flex={'0 0 132px'} />
              <Flex flex={1} gap={2} flexDirection={'column'} alignItems={'stretch'}>
                <Grid gridTemplateColumns={'1fr 1fr'} gap={'12px'}>
                  {datasetOptions.map((item: SelectedDatasetType) => (
                    <Flex
                      key={item.datasetId}
                      alignItems={'center'}
                      gap={2}
                      p={2}
                      border={'1px solid'}
                      borderColor={'myGray.200'}
                      borderRadius={'md'}
                    >
                      <Avatar src={item.avatar} w={6} h={6} borderRadius="sm" />
                      <Box fontSize={'sm'}>{item.name}</Box>
                    </Flex>
                  ))}
                </Grid>
              </Flex>
            </Flex>
            {isOpenDatasetSelect && (
              <DatasetSelectModal
                defaultSelectedDatasets={datasetOptions.map((item: SelectedDatasetType) => ({
                  datasetId: item.datasetId,
                  name: item.name,
                  avatar: item.avatar,
                  vectorModel: {} as EmbeddingModelItemType
                }))}
                onChange={(selectedDatasets) => {
                  const newDatasetList = selectedDatasets.map((item: SelectedDatasetType) => ({
                    name: item.name,
                    datasetId: item.datasetId,
                    avatar: item.avatar
                  }));
                  setValue('datasetOptions', newDatasetList);
                }}
                onClose={onCloseDatasetSelect}
              />
            )}
          </>
        )}

        {inputType === VariableInputEnum.password && (
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
              {t('common:core.module.Min Length')}
            </FormLabel>
            <MyNumberInput
              value={minLength}
              min={1}
              max={50}
              onChange={(e) => {
                setValue('minLength', e);
              }}
            />
          </Flex>
        )}
      </Flex>

      <Flex justify={'flex-end'} mt={4} gap={3} pb={6} pr={8}>
        <Button variant={'whiteBase'} fontWeight={'medium'} onClick={onClose} w={20}>
          {t('common:Close')}
        </Button>
        <Button
          variant={'primaryOutline'}
          fontWeight={'medium'}
          onClick={handleSubmit(
            (data) => onSubmitSuccess(filterValidField(data), 'confirm'),
            onSubmitError
          )}
          w={20}
        >
          {t('common:Confirm')}
        </Button>
        {!isEdit && (
          <Button
            fontWeight={'medium'}
            onClick={handleSubmit(
              (data) => onSubmitSuccess(filterValidField(data), 'continue'),
              onSubmitError
            )}
            w={20}
          >
            {t('common:Continue_Adding')}
          </Button>
        )}
      </Flex>
    </Stack>
  );
};

export default InputTypeConfig;
