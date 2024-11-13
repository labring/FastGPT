import {
  Box,
  Button,
  Flex,
  FormControl,
  HStack,
  Input,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Stack,
  Switch,
  Textarea
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
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import React, { useMemo } from 'react';
import { useFieldArray, UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';

import ChatFunctionTip from '@/components/core/app/Tip';
import MySlider from '@/components/Slider';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

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
  const { feConfigs } = useSystemStore();

  const typeLabels = {
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

  const { register, setValue, handleSubmit, control, watch } = form;
  const maxLength = watch('maxLength');
  const max = watch('max');
  const min = watch('min');
  const selectValueTypeList = watch('customInputConfig.selectValueTypeList');
  const defaultValue = watch('defaultValue');
  const valueType = watch('valueType');

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

  const valueTypeSelectList = Object.values(FlowValueTypeMap).map((item) => ({
    label: t(item.label as any),
    value: item.value
  }));

  const showValueTypeSelect =
    inputType === FlowNodeInputTypeEnum.reference ||
    inputType === FlowNodeInputTypeEnum.customVariable ||
    inputType === VariableInputEnum.custom;

  const showRequired = useMemo(() => {
    const list = [
      FlowNodeInputTypeEnum.addInputParam,
      FlowNodeInputTypeEnum.customVariable,
      VariableInputEnum.custom
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
    const list = [
      FlowNodeInputTypeEnum.input,
      FlowNodeInputTypeEnum.JSONEditor,
      FlowNodeInputTypeEnum.numberInput,
      FlowNodeInputTypeEnum.switch,
      FlowNodeInputTypeEnum.select
    ];

    return list.includes(inputType as FlowNodeInputTypeEnum);
  }, [inputType]);

  const showIsToolInput = useMemo(() => {
    const list = [
      FlowNodeInputTypeEnum.reference,
      FlowNodeInputTypeEnum.JSONEditor,
      FlowNodeInputTypeEnum.input,
      FlowNodeInputTypeEnum.numberInput,
      FlowNodeInputTypeEnum.switch,
      FlowNodeInputTypeEnum.select
    ];
    return type === 'plugin' && list.includes(inputType as FlowNodeInputTypeEnum);
  }, [inputType, type]);

  // File select
  const maxFiles = watch('maxFiles');
  const maxSelectFiles = Math.min(feConfigs?.uploadFileMaxAmount ?? 20, 50);

  return (
    <Stack flex={1} borderLeft={'1px solid #F0F1F6'} justifyContent={'space-between'}>
      <Flex flexDirection={'column'} p={8} pb={2} gap={4} flex={'1 0 0'} overflow={'auto'}>
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
                  onchange={(e) => {
                    setValue('valueType', e);
                  }}
                />
              </Box>
            ) : (
              <Box fontSize={'14px'} mb={2}>
                {defaultValueType ? t(FlowValueTypeMap[defaultValueType]?.label as any) : ''}
              </Box>
            )}
          </Flex>
        )}
        {showRequired && (
          <Flex alignItems={'center'} minH={'40px'}>
            <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
              {t('workflow:field_required')}
            </FormLabel>
            <Switch {...register('required')} />
          </Flex>
        )}
        {/* reference */}
        {showIsToolInput && (
          <>
            <Flex alignItems={'center'} minH={'40px'}>
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
                setValue('maxLength', e || '');
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
                  setValue('max', e || '');
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
                  setValue('min', e || '');
                }}
              />
            </Flex>
          </>
        )}

        {showDefaultValue && (
          <Flex alignItems={'center'} minH={'40px'}>
            <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
              {t('common:core.module.Default Value')}
            </FormLabel>
            <Flex alignItems={'start'} flex={1} h={10}>
              {inputType === FlowNodeInputTypeEnum.numberInput && (
                <MyNumberInput
                  value={defaultValue}
                  min={min}
                  max={max}
                  onChange={(e) => {
                    // @ts-ignore
                    setValue('defaultValue', e || '');
                  }}
                />
              )}
              {inputType === FlowNodeInputTypeEnum.input && (
                <MyTextarea
                  {...register('defaultValue')}
                  bg={'myGray.50'}
                  autoHeight
                  minH={40}
                  maxH={100}
                />
              )}
              {inputType === FlowNodeInputTypeEnum.JSONEditor && (
                <JsonEditor
                  bg={'myGray.50'}
                  resize
                  w={'full'}
                  onChange={(e) => {
                    setValue('defaultValue', e);
                  }}
                  defaultValue={defaultValue}
                />
              )}
              {inputType === FlowNodeInputTypeEnum.switch && (
                <Switch {...register('defaultValue')} />
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
                  onchange={(e) => {
                    setValue('defaultValue', e);
                  }}
                  w={'200px'}
                />
              )}
            </Flex>
          </Flex>
        )}

        {inputType === FlowNodeInputTypeEnum.addInputParam && (
          <>
            {/* <Flex alignItems={'center'}>
              <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
                {t('common:core.module.Input Type')}
              </FormLabel>
              <Box fontSize={'14px'}>{t('workflow:only_the_reference_type_is_supported')}</Box>
            </Flex> */}
            <Box>
              <HStack mb={1}>
                <FormLabel fontWeight={'medium'}>{t('workflow:optional_value_type')}</FormLabel>
                <QuestionTip label={t('workflow:optional_value_type_tip')} />
              </HStack>
              <MultipleSelect<WorkflowIOValueTypeEnum>
                list={valueTypeSelectList}
                bg={'myGray.50'}
                value={selectValueTypeList || []}
                onSelect={(e) => {
                  setValue('customInputConfig.selectValueTypeList', e);
                }}
              />
            </Box>
          </>
        )}

        {inputType === FlowNodeInputTypeEnum.select && (
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
              {(provided) => (
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
                  <Box h="0" w="0">
                    {provided.placeholder}
                  </Box>
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

        {inputType === FlowNodeInputTypeEnum.fileSelect && (
          <>
            <Flex alignItems={'center'} minH={'40px'}>
              <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
                {t('app:document_upload')}
              </FormLabel>
              <Switch
                {...register('canSelectFile', {
                  required: true
                })}
              />
            </Flex>
            <Box w={'full'} minH={'40px'}>
              <Flex alignItems={'center'}>
                <FormLabel flex={'0 0 132px'} fontWeight={'medium'}>
                  {t('app:image_upload')}
                </FormLabel>
                <Switch
                  {...register('canSelectImg', {
                    required: true
                  })}
                />
              </Flex>
              <Flex color={'myGray.500'}>
                <Box fontSize={'xs'}>{t('app:image_upload_tip')}</Box>
                <ChatFunctionTip type="visionModel" />
              </Flex>
            </Box>
            <Box>
              <HStack>
                <FormLabel fontWeight={'medium'}>{t('app:upload_file_max_amount')}</FormLabel>
                <QuestionTip label={t('app:upload_file_max_amount_tip')} />
              </HStack>

              <Box mt={5}>
                <MySlider
                  markList={[
                    { label: '1', value: 1 },
                    { label: `${maxSelectFiles}`, value: maxSelectFiles }
                  ]}
                  width={'100%'}
                  min={1}
                  max={maxSelectFiles}
                  step={1}
                  value={maxFiles ?? 5}
                  onChange={(e) => {
                    setValue('maxFiles', e);
                  }}
                />
              </Box>
            </Box>
          </>
        )}
      </Flex>

      <Flex justify={'flex-end'} gap={3} pb={8} pr={8}>
        <Button variant={'whiteBase'} fontWeight={'medium'} onClick={onClose} w={20}>
          {t('common:common.Close')}
        </Button>
        <Button
          variant={'primaryOutline'}
          fontWeight={'medium'}
          onClick={handleSubmit((data) => onSubmitSuccess(data, 'confirm'), onSubmitError)}
          w={20}
        >
          {t('common:common.Confirm')}
        </Button>
        {!isEdit && (
          <Button
            fontWeight={'medium'}
            onClick={handleSubmit((data) => onSubmitSuccess(data, 'continue'), onSubmitError)}
            w={20}
          >
            {t('common:common.Continue_Adding')}
          </Button>
        )}
      </Flex>
    </Stack>
  );
};

export default InputTypeConfig;
