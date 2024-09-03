import React, { useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  Flex,
  Switch,
  Input,
  Textarea,
  Stack,
  HStack,
  FormControl
} from '@chakra-ui/react';
import { useFieldArray, useForm } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { FlowValueTypeMap } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';

import dynamic from 'next/dynamic';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { useBoolean } from 'ahooks';

const MyNumberInput = dynamic(
  () => import('@fastgpt/web/components/common/Input/NumberInput/index')
);
const JsonEditor = dynamic(() => import('@fastgpt/web/components/common/Textarea/JsonEditor'));

export const defaultInput: FlowNodeInputItemType = {
  renderTypeList: [FlowNodeInputTypeEnum.reference], // Can only choose one here
  selectedTypeIndex: 0,
  valueType: WorkflowIOValueTypeEnum.string,
  canEdit: true,
  key: '',
  label: '',
  description: '',
  defaultValue: ''
};

const FieldEditModal = ({
  defaultValue,
  keys = [],
  hasDynamicInput,
  onClose,
  onSubmit
}: {
  defaultValue: FlowNodeInputItemType;
  keys: string[];
  hasDynamicInput: boolean;
  onClose: () => void;
  onSubmit: (e: { data: FlowNodeInputItemType; isChangeKey: boolean }) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const inputTypeList = useMemo(
    () =>
      [
        [
          {
            icon: 'core/workflow/inputType/reference',
            label: t('common:core.workflow.inputType.Reference'),
            value: FlowNodeInputTypeEnum.reference,
            defaultValueType: WorkflowIOValueTypeEnum.string
          },
          {
            icon: 'core/workflow/inputType/input',
            label: t('common:core.workflow.inputType.input'),
            value: FlowNodeInputTypeEnum.input,
            defaultValueType: WorkflowIOValueTypeEnum.string
          },
          {
            icon: 'core/workflow/inputType/textarea',
            label: t('common:core.workflow.inputType.textarea'),
            value: FlowNodeInputTypeEnum.textarea,
            defaultValueType: WorkflowIOValueTypeEnum.string
          },
          {
            icon: 'core/workflow/inputType/jsonEditor',
            label: t('common:core.workflow.inputType.JSON Editor'),
            value: FlowNodeInputTypeEnum.JSONEditor,
            defaultValueType: WorkflowIOValueTypeEnum.string
          },
          {
            icon: 'core/workflow/inputType/numberInput',
            label: t('common:core.workflow.inputType.number input'),
            value: FlowNodeInputTypeEnum.numberInput,
            defaultValueType: WorkflowIOValueTypeEnum.number
          },
          {
            icon: 'core/workflow/inputType/option',
            label: t('common:core.workflow.inputType.select'),
            value: FlowNodeInputTypeEnum.select,
            defaultValueType: WorkflowIOValueTypeEnum.string
          },
          {
            icon: 'core/workflow/inputType/switch',
            label: t('common:core.workflow.inputType.switch'),
            value: FlowNodeInputTypeEnum.switch,
            defaultValueType: WorkflowIOValueTypeEnum.boolean
          }
        ],
        [
          {
            icon: 'core/workflow/inputType/selectLLM',
            label: t('common:core.workflow.inputType.selectLLMModel'),
            value: FlowNodeInputTypeEnum.selectLLMModel,
            defaultValueType: WorkflowIOValueTypeEnum.string
          },
          {
            icon: 'core/workflow/inputType/selectDataset',
            label: t('common:core.workflow.inputType.selectDataset'),
            value: FlowNodeInputTypeEnum.selectDataset,
            defaultValueType: WorkflowIOValueTypeEnum.selectDataset
          },
          ...(hasDynamicInput
            ? []
            : [
                {
                  icon: 'core/workflow/inputType/dynamic',
                  label: t('common:core.workflow.inputType.dynamicTargetInput'),
                  value: FlowNodeInputTypeEnum.addInputParam,
                  defaultValueType: WorkflowIOValueTypeEnum.dynamic
                }
              ])
        ],
        [
          {
            icon: 'core/workflow/inputType/customVariable',
            label: t('common:core.workflow.inputType.custom'),
            value: FlowNodeInputTypeEnum.customVariable,
            defaultValueType: WorkflowIOValueTypeEnum.string,
            description: t('app:variable.select type_desc')
          }
        ]
      ] as {
        icon: string;
        label: string;
        value: FlowNodeInputTypeEnum;
        defaultValueType: WorkflowIOValueTypeEnum;
        description?: string;
      }[][],
    [hasDynamicInput, t]
  );

  const isEdit = !!defaultValue.key;
  const { register, getValues, setValue, handleSubmit, watch, control, reset } = useForm({
    defaultValues: {
      ...defaultValue,
      list: defaultValue.list?.length ? defaultValue.list : [{ label: '', value: '' }]
    }
  });
  const {
    fields: selectEnums,
    append: appendEnums,
    remove: removeEnums
  } = useFieldArray({
    control,
    name: 'list'
  });

  const inputType = watch('renderTypeList.0') || FlowNodeInputTypeEnum.reference;
  const valueType = watch('valueType');

  const [isToolInput, { toggle: setIsToolInput }] = useBoolean(!!getValues('toolDescription'));

  const maxLength = watch('maxLength');
  const max = watch('max');
  const min = watch('min');
  const selectValueTypeList = watch('customInputConfig.selectValueTypeList');

  const showValueTypeSelect =
    inputType === FlowNodeInputTypeEnum.reference ||
    inputType === FlowNodeInputTypeEnum.customVariable;

  // input type config
  const showRequired = useMemo(() => {
    const list = [FlowNodeInputTypeEnum.addInputParam, FlowNodeInputTypeEnum.customVariable];
    return !list.includes(inputType);
  }, [inputType]);
  const showDefaultValue = useMemo(() => {
    const list = [
      FlowNodeInputTypeEnum.input,
      FlowNodeInputTypeEnum.textarea,
      FlowNodeInputTypeEnum.JSONEditor,
      FlowNodeInputTypeEnum.numberInput,
      FlowNodeInputTypeEnum.switch
    ];

    return list.includes(inputType);
  }, [inputType]);
  const showMaxLenInput = useMemo(() => {
    const list = [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.textarea];

    return list.includes(inputType);
  }, [inputType]);
  const showMinMaxInput = useMemo(() => {
    const list = [FlowNodeInputTypeEnum.numberInput];
    return list.includes(inputType);
  }, [inputType]);

  const valueTypeSelectList = Object.values(FlowValueTypeMap).map((item) => ({
    label: t(item.label as any),
    value: item.value
  }));
  const defaultValueType =
    inputTypeList.flat().find((item) => item.value === inputType)?.defaultValueType ||
    WorkflowIOValueTypeEnum.string;

  const onSubmitSuccess = useCallback(
    (data: FlowNodeInputItemType, action: 'confirm' | 'continue') => {
      data.key = data?.key?.trim();

      if (!data.key) {
        return toast({
          status: 'warning',
          title: t('common:core.module.edit.Field Name Cannot Be Empty')
        });
      }

      if (
        data.renderTypeList[0] !== FlowNodeInputTypeEnum.reference &&
        data.renderTypeList[0] !== FlowNodeInputTypeEnum.customVariable
      ) {
        data.valueType = defaultValueType;
      }

      if (
        data.renderTypeList[0] === FlowNodeInputTypeEnum.addInputParam ||
        data.renderTypeList[0] === FlowNodeInputTypeEnum.customVariable
      ) {
        data.required = false;
      }

      const isChangeKey = defaultValue.key !== data.key;
      // create check key
      if (keys.includes(data.key)) {
        if (!isEdit || isChangeKey) {
          toast({
            status: 'warning',
            title: t('workflow:field_name_already_exists')
          });
          return;
        }
      }

      if (isToolInput) {
        data.toolDescription = data.description;
      } else {
        data.toolDescription = undefined;
      }

      data.label = data.key;

      if (action === 'confirm') {
        onSubmit({
          data,
          isChangeKey
        });
        onClose();
      } else if (action === 'continue') {
        onSubmit({
          data,
          isChangeKey
        });
        toast({
          status: 'success',
          title: t('common:common.Add Success')
        });
        reset(defaultInput);
      }
    },
    [
      defaultValue.key,
      defaultValueType,
      isEdit,
      isToolInput,
      keys,
      onSubmit,
      t,
      toast,
      onClose,
      reset
    ]
  );
  const onSubmitError = useCallback(
    (e: Object) => {
      for (const item of Object.values(e)) {
        if (item.message) {
          toast({
            status: 'warning',
            title: item.message
          });
          break;
        }
      }
    },
    [toast]
  );

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/workflow/extract.png"
      title={isEdit ? t('workflow:edit_input') : t('workflow:add_new_input')}
      maxW={['90vw', '1028px']}
      w={'100%'}
      isCentered
    >
      <Flex h={'560px'}>
        <Stack gap={4} p={8}>
          <Box alignItems={'center'}>
            <FormLabel color={'myGray.600'} fontWeight={'medium'}>
              {t('common:core.module.Input Type')}
            </FormLabel>
            <Flex flexDirection={'column'} gap={4}>
              {inputTypeList.map((list, index) => {
                return (
                  <Box
                    key={index}
                    display={'grid'}
                    gridTemplateColumns={'repeat(3, 1fr)'}
                    gap={4}
                    mt={5}
                  >
                    {list.map((item) => {
                      const isSelected = inputType === item.value;
                      return (
                        <Box
                          display={'flex'}
                          key={item.label}
                          border={isSelected ? '1px solid #3370FF' : '1px solid #DFE2EA'}
                          p={3}
                          rounded={'6px'}
                          fontWeight={'medium'}
                          fontSize={'14px'}
                          alignItems={'center'}
                          cursor={'pointer'}
                          boxShadow={
                            isSelected ? '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)' : 'none'
                          }
                          _hover={{
                            '& > svg': {
                              color: 'primary.600'
                            },
                            '& > span': {
                              color: 'myGray.900'
                            },
                            border: '1px solid #3370FF',
                            boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)'
                          }}
                          onClick={() => {
                            setValue('renderTypeList.0', item.value);
                          }}
                        >
                          <MyIcon
                            name={item.icon as any}
                            w={'20px'}
                            mr={1.5}
                            color={isSelected ? 'primary.600' : 'myGray.400'}
                          />
                          <Box as="span" color={isSelected ? 'myGray.900' : 'inherit'}>
                            {item.label}
                          </Box>
                          {item.description && <QuestionTip label={item.description} ml={1} />}
                        </Box>
                      );
                    })}
                  </Box>
                );
              })}
            </Flex>
          </Box>
        </Stack>
        {/* input type config */}
        <Stack flex={1} borderLeft={'1px solid #F0F1F6'} justifyContent={'space-between'}>
          <Flex flexDirection={'column'} p={8} gap={4} flex={'1 0 0'} overflow={'auto'}>
            <Flex alignItems={'center'}>
              <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
                {t('common:core.module.Field Name')}
              </FormLabel>
              <Input
                bg={'myGray.50'}
                placeholder="appointment/sql"
                {...register('key', {
                  required: true
                })}
              />
            </Flex>
            <Flex alignItems={'flex-start'}>
              <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
                {t('workflow:field_description')}
              </FormLabel>
              <Textarea
                bg={'myGray.50'}
                placeholder={t('workflow:field_description_placeholder')}
                rows={4}
                {...register('description', { required: isToolInput ? true : false })}
              />
            </Flex>

            {/* value type */}
            <Flex alignItems={'center'}>
              <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
                {t('common:core.module.Data Type')}
              </FormLabel>
              {showValueTypeSelect ? (
                <Box flex={1}>
                  <MySelect<WorkflowIOValueTypeEnum>
                    list={valueTypeSelectList}
                    value={valueType}
                    onchange={(e) => {
                      setValue('valueType', e);
                    }}
                  />
                </Box>
              ) : (
                <Box fontSize={'14px'}>{defaultValueType}</Box>
              )}
            </Flex>

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
                      setIsToolInput();
                      console.log(isToolInput);
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
                    value={watch('max')}
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
                    value={watch('min')}
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
                    defaultValue={String(getValues('defaultValue'))}
                  />
                )}
                {inputType === FlowNodeInputTypeEnum.switch && (
                  <Switch {...register('defaultValue')} />
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
                <Flex flexDirection={'column'} gap={4}>
                  {selectEnums.map((item, i) => (
                    <Flex key={item.id} alignItems={'center'}>
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
                            onChange: (e) => {
                              setValue(`list.${i}.value`, e.target.value);
                            }
                          })}
                        />
                      </FormControl>
                      {selectEnums.length > 1 && (
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
                      )}
                    </Flex>
                  ))}
                </Flex>
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
                {t('common:comon.Continue_Adding')}
              </Button>
            )}
          </Flex>
        </Stack>
      </Flex>
    </MyModal>
  );
};

export default React.memo(FieldEditModal);
