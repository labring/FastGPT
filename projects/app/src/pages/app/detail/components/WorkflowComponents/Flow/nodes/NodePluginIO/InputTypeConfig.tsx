import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Input,
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
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import React, { useMemo } from 'react';
import { useFieldArray, UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';

type ListValueType = { id: string; value: string; label: string }[];

const InputTypeConfig = ({
  form,
  isEdit,
  onClose,
  type,
  inputType,
  maxLength,
  max,
  min,
  selectValueTypeList,
  defaultValue,
  isToolInput,
  setIsToolInput,
  valueType,
  defaultValueType,
  onSubmitSuccess,
  onSubmitError
}: {
  // Common fields
  form: UseFormReturn<any>;
  isEdit: boolean;
  onClose: () => void;
  type: 'plugin' | 'formInput' | 'variable';
  inputType: FlowNodeInputTypeEnum | VariableInputEnum;

  maxLength?: number;
  max?: number;
  min?: number;

  selectValueTypeList?: WorkflowIOValueTypeEnum[];
  defaultValue?: string;

  // Plugin-specific fields
  isToolInput?: boolean;
  setIsToolInput?: () => void;
  valueType?: WorkflowIOValueTypeEnum;
  defaultValueType?: WorkflowIOValueTypeEnum;

  // Update methods
  onSubmitSuccess: (data: any, action: 'confirm' | 'continue') => void;
  onSubmitError: (e: Object) => void;
}) => {
  const { t } = useTranslation();

  const { register, setValue, handleSubmit, control, watch } = form;
  const listValue: ListValueType = watch('list');

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
    const list = [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.textarea];
    return list.includes(inputType as FlowNodeInputTypeEnum) && type !== 'variable';
  }, [inputType, type]);

  const showMinMaxInput = useMemo(() => {
    const list = [FlowNodeInputTypeEnum.numberInput];
    return list.includes(inputType as FlowNodeInputTypeEnum);
  }, [inputType]);

  const showDefaultValue = useMemo(() => {
    const list = [
      FlowNodeInputTypeEnum.input,
      FlowNodeInputTypeEnum.textarea,
      FlowNodeInputTypeEnum.JSONEditor,
      FlowNodeInputTypeEnum.numberInput,
      FlowNodeInputTypeEnum.switch,
      FlowNodeInputTypeEnum.select
    ];

    return list.includes(inputType as FlowNodeInputTypeEnum);
  }, [inputType]);

  return (
    <Stack flex={1} borderLeft={'1px solid #F0F1F6'} justifyContent={'space-between'}>
      <Flex flexDirection={'column'} p={8} gap={4} flex={'1 0 0'} overflow={'auto'}>
        <Flex alignItems={'center'}>
          <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
            {typeLabels.name[type] || typeLabels.name.formInput}
          </FormLabel>
          <Input
            bg={'myGray.50'}
            placeholder="appointment/sql"
            {...register('label', {
              required: true
            })}
          />
        </Flex>
        <Flex alignItems={'flex-start'}>
          <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
            {typeLabels.description[type] || typeLabels.description.plugin}
          </FormLabel>
          <Textarea
            bg={'myGray.50'}
            placeholder={t('workflow:field_description_placeholder')}
            rows={3}
            {...register('description', { required: isToolInput ? true : false })}
          />
        </Flex>

        {/* value type */}
        {type !== 'formInput' && (
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
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
                {defaultValueType}
              </Box>
            )}
          </Flex>
        )}
        {showRequired && (
          <Flex alignItems={'center'} minH={'40px'}>
            <FormLabel flex={'1'} fontWeight={'medium'}>
              {t('workflow:field_required')}
            </FormLabel>
            <Switch {...register('required')} />
          </Flex>
        )}

        {/* reference */}
        {inputType === FlowNodeInputTypeEnum.reference && (
          <>
            <Flex alignItems={'center'} minH={'40px'}>
              <FormLabel flex={'1'} fontWeight={'medium'}>
                {t('workflow:field_used_as_tool_input')}
              </FormLabel>
              <Switch
                isChecked={isToolInput}
                onChange={(e) => {
                  setIsToolInput && setIsToolInput();
                }}
              />
            </Flex>
          </>
        )}

        {showMaxLenInput && (
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
              {t('common:core.module.Max Length')}
            </FormLabel>
            <MyNumberInput
              flex={'1 0 0'}
              bg={'myGray.50'}
              placeholder={t('common:core.module.Max Length placeholder')}
              value={maxLength}
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
              <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
                {t('common:core.module.Max Value')}
              </FormLabel>
              <MyNumberInput
                flex={'1 0 0'}
                bg={'myGray.50'}
                value={max}
                onChange={(e) => {
                  // @ts-ignore
                  setValue('max', e || '');
                }}
              />
            </Flex>
            <Flex alignItems={'center'}>
              <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
                {t('common:core.module.Min Value')}
              </FormLabel>
              <MyNumberInput
                flex={'1 0 0'}
                bg={'myGray.50'}
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
            <FormLabel
              flex={inputType === FlowNodeInputTypeEnum.switch ? 1 : '0 0 100px'}
              fontWeight={'medium'}
            >
              {t('common:core.module.Default Value')}
            </FormLabel>
            {inputType === FlowNodeInputTypeEnum.numberInput && (
              <Input
                bg={'myGray.50'}
                max={max}
                min={min}
                type={'number'}
                {...register('defaultValue')}
              />
            )}
            {inputType === FlowNodeInputTypeEnum.input && (
              <Input bg={'myGray.50'} maxLength={maxLength} {...register('defaultValue')} />
            )}
            {inputType === FlowNodeInputTypeEnum.textarea && (
              <Textarea bg={'myGray.50'} maxLength={maxLength} {...register('defaultValue')} />
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
            {inputType === FlowNodeInputTypeEnum.switch && <Switch {...register('defaultValue')} />}
            {inputType === FlowNodeInputTypeEnum.select && (
              <MySelect<string>
                list={listValue.map((item) => ({
                  label: item.label,
                  value: item.value
                }))}
                value={defaultValue}
                onchange={(e) => {
                  setValue('defaultValue', e);
                }}
                w={'200px'}
              />
            )}
          </Flex>
        )}

        {inputType === FlowNodeInputTypeEnum.addInputParam && (
          <>
            <Flex alignItems={'center'}>
              <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
                {t('common:core.module.Input Type')}
              </FormLabel>
              <Box fontSize={'14px'}>{t('workflow:only_the_reference_type_is_supported')}</Box>
            </Flex>
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
                newSelectEnums.forEach((item) => appendEnums(item));

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
                            <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
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
      </Flex>

      <Flex justify={'flex-end'} gap={3} pb={8} pr={8}>
        <Button variant={'whiteBase'} fontWeight={'medium'} onClick={onClose} w={20}>
          {t('common:common.Close')}
        </Button>
        <Button
          variant={'primaryOutline'}
          fontWeight={'medium'}
          onClick={handleSubmit(
            (data: FlowNodeInputItemType) => onSubmitSuccess(data, 'confirm'),
            onSubmitError
          )}
          w={20}
        >
          {t('common:common.Confirm')}
        </Button>
        {!isEdit && (
          <Button
            fontWeight={'medium'}
            onClick={handleSubmit(
              (data: FlowNodeInputItemType) => onSubmitSuccess(data, 'continue'),
              onSubmitError
            )}
            w={20}
          >
            {t('common:common.Continue_Adding')}
          </Button>
        )}
      </Flex>
    </Stack>
  );
};

export default React.memo(InputTypeConfig);
