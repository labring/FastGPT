import React from 'react';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import TimeInput from '@/components/core/app/formRender/TimeInput';
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
  WorkflowIOValueTypeEnum,
  textInputVariableValueTypes
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowValueTypeMap
} from '@fastgpt/global/core/workflow/node/constant';
import Avatar from '@fastgpt/web/components/common/Avatar';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MultipleSelect, {
  useMultipleSelect
} from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import { useTranslation } from 'next-i18next';
import { useCallback, useMemo } from 'react';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';

import { DatasetSelectModal } from '@/components/core/app/DatasetSelectModal';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useFileUploadLimits } from '@/web/common/file/hooks/useFileUploadLimits';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { canInputBeAgentGenerated } from '@fastgpt/global/core/app/formEdit/utils';
import { getUserFileAmountLimit } from '@fastgpt/global/core/workflow/fileLimit';
import type {
  ReferenceArrayValueType,
  SelectedDatasetType
} from '@fastgpt/global/core/workflow/type/io';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import InputSlider from '@fastgpt/web/components/common/MySlider/InputSlider';
import RadioGroup from '@fastgpt/web/components/common/Radio/RadioGroup';
import { FileTypeSelectorPanel } from '@fastgpt/web/components/core/app/FileTypeSelector';
import NodeInputSelect from '@fastgpt/web/components/core/workflow/NodeInputSelect';
import { ReferSelector, useReference } from '../render/RenderInput/templates/Reference';
import { DYNAMIC_OPTION_EXCLUDED_VALUE_TYPES } from '@/web/core/workflow/utils';

const inputFormGridTemplateColumns = 'minmax(64px, max-content) minmax(0, 1fr)';

/** 仅在表单选项引用模式挂载，避免普通变量和工具参数编辑访问工作流上下文。 */
const DynamicOptionReferenceSelector = ({
  nodeId,
  value,
  onSelect
}: {
  nodeId?: string;
  value: ReferenceArrayValueType;
  onSelect: (value?: ReferenceArrayValueType) => void;
}) => {
  const { t } = useTranslation();
  const { referenceList } = useReference({
    nodeId: nodeId ?? '',
    valueType: WorkflowIOValueTypeEnum.any,
    excludeValueTypes: DYNAMIC_OPTION_EXCLUDED_VALUE_TYPES
  });

  return (
    <ReferSelector
      isArray={true}
      placeholder={t('workflow:please_select_variable')}
      list={referenceList}
      value={value}
      onSelect={onSelect}
      ButtonProps={{
        minH: '36px',
        borderRadius: 'sm'
      }}
    />
  );
};

const InputTypeConfig = ({
  nodeId,
  form,
  isEdit,
  onClose,
  type,
  inputType,
  defaultValueType,
  onSubmitSuccess,
  onSubmitError
}: {
  nodeId?: string;
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
  onSubmitError: (e: object) => void;
}) => {
  const { t } = useTranslation();
  const { maxUploadFileCount } = useFileUploadLimits();

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
  const inputKey = watch('key');
  const renderTypeList = watch('renderTypeList') ?? [];
  const defaultToAgentGenerated = watch('defaultToAgentGenerated') ?? false;
  const showDefaultToolParam =
    type === 'plugin' &&
    canInputBeAgentGenerated({ key: inputKey ?? '', renderTypeList: renderTypeList });

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
  // 模块可配置上限不能超过用户配额，额外保留节点配置的 50 个上限。
  const maxSelectFiles = Math.min(
    getUserFileAmountLimit({
      systemMaxFileAmount: maxUploadFileCount
    }),
    50
  );
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

  const listValue = watch('list') ?? [];
  const listInputType = watch('listInputType') || FlowNodeInputTypeEnum.custom;
  const listReference = watch('listReference') ?? [];
  const {
    fields: selectEnums,
    append: appendEnums,
    remove: removeEnums
  } = useFieldArray({
    control,
    name: 'list'
  });

  const isSelectInput =
    inputType === FlowNodeInputTypeEnum.select || inputType === VariableInputEnum.select;
  const isMultipleSelectInput =
    inputType === FlowNodeInputTypeEnum.multipleSelect ||
    inputType === VariableInputEnum.multipleSelect;
  const isOptionInput = isSelectInput || isMultipleSelectInput;
  const isReferenceOptionMode =
    type === 'formInput' && listInputType === FlowNodeInputTypeEnum.reference;
  const optionFields = (listValue.length ? listValue : selectEnums) as {
    id?: string;
    label?: string;
    value?: string;
  }[];
  const optionDragList = optionFields.map((item, index) => ({
    id: item.id || `${index}`,
    label: item.label || '',
    value: item.value || item.label || ''
  }));

  const handleRemoveEnum = useCallback(
    (index: number) => {
      const removedValue = getValues(`list.${index}.value`);
      removeEnums(index);

      if (!removedValue) return;

      if (isMultipleSelectInput) {
        const cur = getValues('defaultValue');
        if (Array.isArray(cur) && cur.includes(removedValue)) {
          setValue(
            'defaultValue',
            cur.filter((v: string) => v !== removedValue)
          );
        }
      } else if (isSelectInput) {
        if (getValues('defaultValue') === removedValue) {
          setValue('defaultValue', '');
        }
      }
    },
    [removeEnums, isMultipleSelectInput, isSelectInput, getValues, setValue]
  );

  const isOptionLimitReached = optionFields.length >= 50;

  const valueTypeSelectList = Object.values(FlowValueTypeMap)
    .filter((item) => !item.abandon)
    .map((item) => ({
      label: t(item.label as any),
      value: item.value
    }));

  const isVariableTextInput = type === 'variable' && inputType === VariableInputEnum.input;

  const isDynamicValueTypeInput =
    inputType === FlowNodeInputTypeEnum.customVariable ||
    inputType === FlowNodeInputTypeEnum.hidden ||
    inputType === VariableInputEnum.custom ||
    inputType === VariableInputEnum.internal ||
    isVariableTextInput;

  const showValueTypeSelect =
    inputType === FlowNodeInputTypeEnum.reference || isDynamicValueTypeInput;

  const valueTypeOptionList = isVariableTextInput
    ? valueTypeSelectList.filter((item) => textInputVariableValueTypes.includes(item.value))
    : valueTypeSelectList.filter((item) => item.value !== WorkflowIOValueTypeEnum.arrayAny);

  const showRequired = useMemo(() => {
    const list = [
      FlowNodeInputTypeEnum.addInputParam,
      FlowNodeInputTypeEnum.customVariable,
      FlowNodeInputTypeEnum.hidden,
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.switch,
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
    if (isOptionInput) return false;
    const map = {
      [FlowNodeInputTypeEnum.input]: true,
      [FlowNodeInputTypeEnum.JSONEditor]: true,
      [FlowNodeInputTypeEnum.numberInput]: true,
      [FlowNodeInputTypeEnum.switch]: true,
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
  }, [inputType, isOptionInput]);

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
        defaultToAgentGenerated: data.defaultToAgentGenerated,
        required: data.required,
        defaultValue: data.defaultValue
      };

      if (isOptionInput) {
        const optionMode =
          type === 'formInput'
            ? (data.listInputType ?? FlowNodeInputTypeEnum.custom)
            : FlowNodeInputTypeEnum.custom;
        if (type === 'formInput') {
          commonData.listInputType = optionMode;
        }
        if (optionMode === FlowNodeInputTypeEnum.reference) {
          commonData.listReference = Array.isArray(data.listReference) ? data.listReference : [];
          commonData.defaultValue = undefined;
        } else {
          const cleanList = (data.list ?? []).filter(
            (item: { label?: string; value?: string }) => !!item?.label
          );
          commonData.list = cleanList;
          const validValues = new Set(cleanList.map((item: { value: string }) => item.value));
          if (isMultipleSelectInput) {
            commonData.defaultValue = Array.isArray(commonData.defaultValue)
              ? commonData.defaultValue.filter((v: string) => validValues.has(v))
              : commonData.defaultValue;
          } else if (commonData.defaultValue && !validValues.has(commonData.defaultValue)) {
            commonData.defaultValue = '';
          }
        }
      }

      switch (inputType) {
        case FlowNodeInputTypeEnum.input:
        case FlowNodeInputTypeEnum.textarea:
          commonData.maxLength = data.maxLength;
          break;
        case FlowNodeInputTypeEnum.numberInput:
          commonData.max = data.max;
          commonData.min = data.min;
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
    [inputType, isMultipleSelectInput, isOptionInput, type]
  );

  return (
    <Stack
      flex={1}
      minH={0}
      overflow={'hidden'}
      borderLeft={'1px solid #F0F1F6'}
      justifyContent={'space-between'}
    >
      <Grid
        gridTemplateColumns={inputFormGridTemplateColumns}
        gridAutoRows={'max-content'}
        columnGap={4}
        rowGap={4}
        alignItems={'center'}
        alignContent={'start'}
        textAlign={'left'}
        p={8}
        flex={'0 1 auto'}
        overflow={'auto'}
      >
        <Grid display={'contents'}>
          <FormLabel whiteSpace={'nowrap'} fontWeight={'medium'}>
            {typeLabels.name[type] || typeLabels.name.formInput}
          </FormLabel>
          <Input
            minW={0}
            bg={'myGray.50'}
            maxLength={30}
            placeholder="appointment/sql"
            {...register('label', {
              required: true
            })}
          />
        </Grid>
        <Grid display={'contents'}>
          <FormLabel alignSelf={'flex-start'} whiteSpace={'nowrap'} fontWeight={'medium'}>
            {typeLabels.description[type] || typeLabels.description.plugin}
          </FormLabel>
          <Textarea
            alignSelf={'flex-start'}
            minW={0}
            h={'auto'}
            bg={'myGray.50'}
            placeholder={t('workflow:field_description_placeholder')}
            rows={3}
            minH={'76px'}
            {...register('description', {
              required: showDefaultToolParam && defaultToAgentGenerated
            })}
          />
        </Grid>

        {/* value type */}
        {type !== 'formInput' && (
          <Grid display={'contents'}>
            <FormLabel whiteSpace={'nowrap'} fontWeight={'medium'}>
              {t('common:core.module.Data Type')}
            </FormLabel>
            {showValueTypeSelect ? (
              <Box minW={0}>
                <MySelect<WorkflowIOValueTypeEnum>
                  list={valueTypeOptionList}
                  value={valueType}
                  onChange={(e) => {
                    setValue('valueType', e);
                    if (isVariableTextInput) {
                      setValue('defaultValue', '');
                    }
                  }}
                />
              </Box>
            ) : (
              <Box fontSize={'14px'}>
                {defaultValueType ? t(FlowValueTypeMap[defaultValueType]?.label as any) : ''}
              </Box>
            )}
          </Grid>
        )}
        {showRequired && (
          <Grid display={'contents'}>
            <FormLabel whiteSpace={'nowrap'} fontWeight={'medium'}>
              {t('workflow:field_required')}
            </FormLabel>
            <Switch {...register('required')} />
          </Grid>
        )}
        {showDefaultToolParam && (
          <Grid display={'contents'}>
            <FormLabel whiteSpace={'nowrap'} fontWeight={'medium'}>
              {t('workflow:field_used_as_tool_input')}
            </FormLabel>
            <Switch
              isChecked={defaultToAgentGenerated}
              onChange={(e) => setValue('defaultToAgentGenerated', e.target.checked)}
            />
          </Grid>
        )}
        {showMaxLenInput && (
          <Grid display={'contents'}>
            <FormLabel whiteSpace={'nowrap'} fontWeight={'medium'}>
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
          </Grid>
        )}

        {showMinMaxInput && (
          <>
            <Grid display={'contents'}>
              <FormLabel whiteSpace={'nowrap'} fontWeight={'medium'}>
                {t('common:core.module.Max Value')}
              </FormLabel>
              <MyNumberInput
                value={max}
                onChange={(e) => {
                  // @ts-ignore
                  setValue('max', e ?? '');
                }}
              />
            </Grid>
            <Grid display={'contents'}>
              <FormLabel whiteSpace={'nowrap'} fontWeight={'medium'}>
                {t('common:core.module.Min Value')}
              </FormLabel>
              <MyNumberInput
                value={min}
                onChange={(e) => {
                  // @ts-ignore
                  setValue('min', e ?? '');
                }}
              />
            </Grid>
          </>
        )}

        {(inputType === VariableInputEnum.timePointSelect ||
          inputType === VariableInputEnum.timeRangeSelect) && (
          <>
            <Grid display={'contents'}>
              <FormLabel whiteSpace={'nowrap'} fontWeight={'medium'}>
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
            </Grid>
            <Grid display={'contents'}>
              <FormLabel alignSelf={'flex-start'} whiteSpace={'nowrap'} fontWeight={'medium'}>
                {t('app:time_range_limit')}
              </FormLabel>
              <Flex alignSelf={'flex-start'} flexDirection={'column'} gap={3} minW={0}>
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
                    timeGranularity={timeGranularity || 'day'}
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
                    timeGranularity={timeGranularity || 'day'}
                    minDate={timeRangeStart ? new Date(timeRangeStart) : undefined}
                  />
                </Box>
              </Flex>
            </Grid>
          </>
        )}

        {showDefaultValue && (
          <Grid display={'contents'}>
            <FormLabel whiteSpace={'nowrap'} fontWeight={'medium'}>
              {t('common:core.module.Default Value')}
            </FormLabel>
            <Flex w={'full'} h={10} minW={0}>
              {(inputType === FlowNodeInputTypeEnum.numberInput ||
                (isDynamicValueTypeInput && valueType === WorkflowIOValueTypeEnum.number)) && (
                <MyNumberInput
                  value={defaultValue}
                  min={min ? min : undefined}
                  max={max ? max : undefined}
                  onChange={(e) => {
                    // @ts-ignore
                    setValue('defaultValue', e ?? '');
                  }}
                />
              )}
              {((inputType === FlowNodeInputTypeEnum.input && !isVariableTextInput) ||
                (isDynamicValueTypeInput &&
                  (valueType === WorkflowIOValueTypeEnum.string ||
                    valueType === WorkflowIOValueTypeEnum.any))) && (
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
                (isDynamicValueTypeInput &&
                  ![
                    WorkflowIOValueTypeEnum.number,
                    WorkflowIOValueTypeEnum.string,
                    WorkflowIOValueTypeEnum.boolean,
                    WorkflowIOValueTypeEnum.any
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
                (isDynamicValueTypeInput && valueType === WorkflowIOValueTypeEnum.boolean)) && (
                <Flex h={10} alignItems={'center'}>
                  <Switch {...register('defaultValue')} />
                </Flex>
              )}
              {inputType === VariableInputEnum.timePointSelect && (
                <TimeInput
                  value={defaultValue ? new Date(defaultValue) : undefined}
                  onDateTimeChange={(date) => {
                    setValue('defaultValue', date);
                  }}
                  popPosition="top"
                  timeGranularity={timeGranularity || 'day'}
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
                      timeGranularity={timeGranularity || 'day'}
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
                      timeGranularity={timeGranularity || 'day'}
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
                    modelType={ModelTypeEnum.llm}
                    value={defaultValue}
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
          </Grid>
        )}
        {inputType === FlowNodeInputTypeEnum.addInputParam && (
          <>
            <Box gridColumn={'1 / -1'}>
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

        {isOptionInput && (
          <>
            {type === 'formInput' && (
              <Grid display={'contents'}>
                <FormLabel whiteSpace={'nowrap'} fontWeight={'medium'}>
                  {t('workflow:option_config')}
                </FormLabel>
                <Flex alignItems={'center'} minH={7}>
                  <NodeInputSelect
                    bg={'white'}
                    renderTypeList={[FlowNodeInputTypeEnum.custom, FlowNodeInputTypeEnum.reference]}
                    selectedType={listInputType}
                    onChange={(e) => {
                      const nextType = e as FlowNodeInputTypeEnum;
                      setValue('listInputType', nextType);
                      setValue('defaultValue', isMultipleSelectInput ? [] : '');
                    }}
                  />
                </Flex>
              </Grid>
            )}

            {isReferenceOptionMode ? (
              <Grid display={'contents'}>
                <FormLabel whiteSpace={'nowrap'} fontWeight={'medium'}>
                  {t('workflow:option_variable')}
                </FormLabel>
                <Box minW={0}>
                  <DynamicOptionReferenceSelector
                    nodeId={nodeId}
                    value={listReference}
                    onSelect={(val) => setValue('listReference', val ?? [])}
                  />
                </Box>
              </Grid>
            ) : (
              <>
                <DndDrag<{ id: string; label: string; value: string }>
                  renderInnerPlaceholder={false}
                  onDragEndCb={(list) => {
                    removeEnums();
                    list.forEach((item) =>
                      appendEnums({
                        label: item.label || item.value,
                        value: item.value || item.label
                      })
                    );

                    // 防止最后一个元素被focus
                    setTimeout(() => {
                      if (document.activeElement instanceof HTMLElement) {
                        document.activeElement.blur();
                      }
                    }, 0);
                  }}
                  dataList={optionDragList}
                  renderClone={(provided, snapshot, rubric) => {
                    return (
                      <Box
                        bg={'white'}
                        border={'1px solid'}
                        borderColor={'myGray.200'}
                        p={2}
                        borderRadius="md"
                        boxShadow="md"
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                      >
                        {optionDragList[rubric.source.index]?.value}
                      </Box>
                    );
                  }}
                >
                  {({ provided }) => (
                    <Box
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      gridColumn={'1 / -1'}
                      display={'grid'}
                      gridTemplateColumns={'subgrid'}
                      rowGap={4}
                    >
                      {optionFields.map((item, i) => {
                        const optionValue =
                          watch(`list.${i}.value`) || watch(`list.${i}.label`) || '';
                        const isDefaultChecked = isMultipleSelectInput
                          ? Array.isArray(defaultValue) &&
                            !!optionValue &&
                            defaultValue.includes(optionValue)
                          : !!optionValue && defaultValue === optionValue;
                        const canDeleteOption = optionFields.length > 1;

                        return (
                          <Draggable key={i} draggableId={i.toString()} index={i}>
                            {(provided, snapshot) => (
                              <Grid
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                gridColumn={'1 / -1'}
                                gridTemplateColumns={'subgrid'}
                                alignItems={'center'}
                                position={'relative'}
                                transform={snapshot.isDragging ? `scale(0.5)` : ''}
                                transformOrigin={'top left'}
                                style={{
                                  ...provided.draggableProps.style,
                                  opacity: snapshot.isDragging ? 0.8 : 1
                                }}
                              >
                                <Flex alignItems={'center'} gap={1}>
                                  <Box
                                    {...provided.dragHandleProps}
                                    display={'flex'}
                                    alignItems={'center'}
                                  >
                                    <MyIcon
                                      name={'drag'}
                                      cursor={'pointer'}
                                      color={'myGray.500'}
                                      _hover={{ color: 'primary.600' }}
                                      w={'16px'}
                                    />
                                  </Box>
                                  <FormLabel whiteSpace={'nowrap'} fontWeight={'medium'}>
                                    {`${t('common:core.module.variable.variable options')} ${i + 1}`}
                                  </FormLabel>
                                </Flex>
                                <Flex alignItems={'center'} gap={2} minW={0}>
                                  <FormControl flex={1} minW={0}>
                                    <Input
                                      bg={'white'}
                                      placeholder={t('workflow:please_input_option')}
                                      {...register(`list.${i}.label`, {
                                        required: !isReferenceOptionMode,
                                        onChange: (e: any) => {
                                          const nextVal = e.target.value;
                                          const prevVal = getValues(`list.${i}.value`);
                                          setValue(`list.${i}.value`, nextVal);
                                          if (prevVal && prevVal !== nextVal) {
                                            if (isMultipleSelectInput) {
                                              const cur = getValues('defaultValue');
                                              if (Array.isArray(cur) && cur.includes(prevVal)) {
                                                setValue(
                                                  'defaultValue',
                                                  nextVal
                                                    ? cur.map((v: string) =>
                                                        v === prevVal ? nextVal : v
                                                      )
                                                    : cur.filter((v: string) => v !== prevVal)
                                                );
                                              }
                                            } else if (
                                              isSelectInput &&
                                              getValues('defaultValue') === prevVal
                                            ) {
                                              setValue('defaultValue', nextVal);
                                            }
                                          }
                                        }
                                      })}
                                    />
                                  </FormControl>
                                  <Flex alignItems={'center'} gap={2} flexShrink={0}>
                                    {isMultipleSelectInput ? (
                                      <Checkbox
                                        isChecked={isDefaultChecked}
                                        isDisabled={!optionValue}
                                        icon={<MyIcon name={'common/check'} w={'12px'} />}
                                        sx={{
                                          '.chakra-checkbox__control:not([data-checked])': {
                                            borderWidth: '1px',
                                            borderColor: 'myGray.300',
                                            bg: 'white',
                                            _hover: optionValue
                                              ? {
                                                  borderColor: 'primary.300',
                                                  bg: 'primary.50'
                                                }
                                              : {
                                                  borderColor: 'myGray.300',
                                                  bg: 'white'
                                                }
                                          },
                                          '.chakra-checkbox__label[data-disabled]': {
                                            opacity: 1
                                          }
                                        }}
                                        onChange={() => {
                                          if (!optionValue) return;
                                          const cur = Array.isArray(defaultValue)
                                            ? defaultValue
                                            : [];
                                          if (isDefaultChecked) {
                                            setValue(
                                              'defaultValue',
                                              cur.filter((v: string) => v !== optionValue)
                                            );
                                          } else {
                                            setValue('defaultValue', [...cur, optionValue]);
                                          }
                                        }}
                                      >
                                        <Box
                                          fontSize={'xs'}
                                          fontWeight={'medium'}
                                          color={'myGray.900'}
                                          whiteSpace={'nowrap'}
                                        >
                                          {t('common:core.module.Default Value')}
                                        </Box>
                                      </Checkbox>
                                    ) : (
                                      <Flex
                                        alignItems={'center'}
                                        gap={2}
                                        cursor={optionValue ? 'pointer' : 'not-allowed'}
                                        userSelect={'none'}
                                        role={'group'}
                                        onClick={() => {
                                          if (!optionValue) return;
                                          setValue(
                                            'defaultValue',
                                            isDefaultChecked ? '' : optionValue
                                          );
                                        }}
                                      >
                                        <Flex
                                          w={'16px'}
                                          h={'16px'}
                                          borderRadius={'full'}
                                          alignItems={'center'}
                                          justifyContent={'center'}
                                          border={isDefaultChecked ? '1.5px solid' : '1px solid'}
                                          borderColor={
                                            isDefaultChecked ? 'primary.600' : 'myGray.300'
                                          }
                                          bg={isDefaultChecked ? 'primary.50' : 'white'}
                                          _groupHover={
                                            optionValue && !isDefaultChecked
                                              ? {
                                                  borderColor: 'primary.300',
                                                  bg: 'primary.50'
                                                }
                                              : undefined
                                          }
                                        >
                                          {isDefaultChecked && (
                                            <Box
                                              w={'6px'}
                                              h={'6px'}
                                              borderRadius={'full'}
                                              bg={'primary.600'}
                                            />
                                          )}
                                        </Flex>
                                        <Box
                                          fontSize={'xs'}
                                          fontWeight={'medium'}
                                          color={'myGray.900'}
                                          whiteSpace={'nowrap'}
                                        >
                                          {t('common:core.module.Default Value')}
                                        </Box>
                                      </Flex>
                                    )}
                                    <MyIcon
                                      name={'delete'}
                                      w={'16px'}
                                      color={'myGray.500'}
                                      cursor={canDeleteOption ? 'pointer' : 'not-allowed'}
                                      opacity={canDeleteOption ? 1 : 0.4}
                                      borderRadius={'md'}
                                      _hover={canDeleteOption ? { color: 'red.600' } : undefined}
                                      onClick={() => {
                                        if (!canDeleteOption) return;
                                        handleRemoveEnum(i);
                                      }}
                                    />
                                  </Flex>
                                </Flex>
                              </Grid>
                            )}
                          </Draggable>
                        );
                      })}
                    </Box>
                  )}
                </DndDrag>
                <Button
                  gridColumn={'1 / -1'}
                  justifySelf={'flex-start'}
                  variant={'whiteBase'}
                  leftIcon={<MyIcon name={'common/addLight'} w={'16px'} />}
                  onClick={() => {
                    if (isOptionLimitReached) return;
                    appendEnums({ label: '', value: '' });
                  }}
                  isDisabled={isOptionLimitReached}
                  fontWeight={'medium'}
                  fontSize={'12px'}
                  px={3}
                  py={2}
                >
                  {t('common:core.module.variable add option')}
                </Button>
              </>
            )}
          </>
        )}
        {(inputType === FlowNodeInputTypeEnum.fileSelect ||
          inputType === VariableInputEnum.file) && (
          <>
            <Grid display={'contents'}>
              <FormLabel whiteSpace={'nowrap'} fontWeight={'medium'}>
                {t('app:upload_method')}
              </FormLabel>
              <Grid gridTemplateColumns={'1fr 1fr'} gap={'12px'} minW={0}>
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
            </Grid>
            <Grid display={'contents'}>
              <HStack gap={1} whiteSpace={'nowrap'}>
                <FormLabel fontWeight={'medium'}>{t('app:upload_file_max_amount')}</FormLabel>
                <QuestionTip label={t('app:upload_file_max_amount_tip')} />
              </HStack>

              <Box minW={0}>
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
            </Grid>
            <Grid display={'contents'}>
              <FormLabel alignSelf={'flex-start'} whiteSpace={'nowrap'} fontWeight={'medium'}>
                {t('app:upload_file_extension_types')}
              </FormLabel>
              <Stack
                alignSelf={'flex-start'}
                w="full"
                minW={0}
                spacing={3}
                alignItems={'flex-start'}
                border="1px solid"
                borderColor="myGray.200"
                borderRadius="md"
                p={4}
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
            </Grid>
          </>
        )}

        {inputType === VariableInputEnum.datasetSelect && (
          <>
            <Grid display={'contents'}>
              <FormLabel whiteSpace={'nowrap'} fontWeight={'medium'}>
                {t('app:dataset_select')}
              </FormLabel>
              <Button
                variant={'primaryOutline'}
                size={'md'}
                onClick={onOpenDatasetSelect}
                leftIcon={<MyIcon name={'core/dataset/datasetLightSmall'} w={4} />}
              >
                {t('chat:select')}
              </Button>
            </Grid>
            <Grid display={'contents'}>
              <Box visibility={'hidden'} whiteSpace={'nowrap'}>
                {t('app:dataset_select')}
              </Box>
              <Flex gap={2} flexDirection={'column'} alignItems={'stretch'} minW={0}>
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
            </Grid>
            {isOpenDatasetSelect && (
              <DatasetSelectModal
                defaultSelectedDatasets={datasetOptions.map((item: SelectedDatasetType) => ({
                  datasetId: item.datasetId,
                  name: item.name,
                  avatar: item.avatar
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
          <Grid display={'contents'}>
            <FormLabel whiteSpace={'nowrap'} fontWeight={'medium'}>
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
          </Grid>
        )}
      </Grid>

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
