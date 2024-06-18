import React, { useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  ModalFooter,
  ModalBody,
  Flex,
  Switch,
  Input,
  Textarea,
  Stack
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { FlowValueTypeMap } from '@/web/core/workflow/constants/dataType';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  EditInputFieldMapType,
  EditNodeFieldType
} from '@fastgpt/global/core/workflow/node/type.d';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

import dynamic from 'next/dynamic';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput/index';
import { useI18n } from '@/web/context/I18n';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

const JsonEditor = dynamic(() => import('@fastgpt/web/components/common/Textarea/JsonEditor'));
const EmptyTip = dynamic(() => import('@fastgpt/web/components/common/EmptyTip'));

const defaultValue: EditNodeFieldType = {
  inputType: FlowNodeInputTypeEnum.reference,
  valueType: WorkflowIOValueTypeEnum.string,
  key: '',
  label: '',
  description: '',
  isToolInput: false,
  defaultValue: '',
  maxLength: undefined,
  max: undefined,
  min: undefined,
  editField: {},
  dynamicParamDefaultValue: {
    inputType: FlowNodeInputTypeEnum.reference,
    valueType: WorkflowIOValueTypeEnum.string,
    required: true
  }
};

const FieldEditModal = ({
  editField = {
    key: true
  },
  defaultField,
  keys = [],
  onClose,
  onSubmit
}: {
  editField?: EditInputFieldMapType;
  defaultField: EditNodeFieldType;
  keys: string[];
  onClose: () => void;
  onSubmit: (e: { data: EditNodeFieldType; changeKey: boolean }) => void;
}) => {
  const { t } = useTranslation();
  const { workflowT } = useI18n();
  const { toast } = useToast();
  const showDynamicInputSelect =
    !keys.includes(NodeInputKeyEnum.addInputParam) ||
    defaultField.key === NodeInputKeyEnum.addInputParam;

  const inputTypeList = useMemo(
    () => [
      {
        label: t('core.workflow.inputType.Reference'),
        value: FlowNodeInputTypeEnum.reference,
        defaultValue: {}
      },
      {
        label: t('core.workflow.inputType.input'),
        value: FlowNodeInputTypeEnum.input,
        defaultValue: {
          valueType: WorkflowIOValueTypeEnum.string
        }
      },
      {
        label: t('core.workflow.inputType.textarea'),
        value: FlowNodeInputTypeEnum.textarea,
        defaultValue: {
          valueType: WorkflowIOValueTypeEnum.string
        }
      },
      {
        label: t('core.workflow.inputType.JSON Editor'),
        value: FlowNodeInputTypeEnum.JSONEditor,
        defaultValue: {
          valueType: WorkflowIOValueTypeEnum.string
        }
      },
      {
        label: t('core.workflow.inputType.number input'),
        value: FlowNodeInputTypeEnum.numberInput,
        defaultValue: {
          valueType: WorkflowIOValueTypeEnum.number
        }
      },
      {
        label: t('core.workflow.inputType.switch'),
        value: FlowNodeInputTypeEnum.switch,
        defaultValue: {
          valueType: WorkflowIOValueTypeEnum.boolean
        }
      },
      {
        label: t('core.workflow.inputType.selectApp'),
        value: FlowNodeInputTypeEnum.selectApp,
        defaultValue: {
          valueType: WorkflowIOValueTypeEnum.selectApp
        }
      },
      {
        label: t('core.workflow.inputType.selectLLMModel'),
        value: FlowNodeInputTypeEnum.selectLLMModel,
        defaultValue: {
          valueType: WorkflowIOValueTypeEnum.string
        }
      },
      {
        label: t('core.workflow.inputType.selectDataset'),
        value: FlowNodeInputTypeEnum.selectDataset,
        defaultValue: {
          valueType: WorkflowIOValueTypeEnum.selectDataset
        }
      },
      ...(showDynamicInputSelect
        ? [
            {
              label: t('core.workflow.inputType.dynamicTargetInput'),
              value: FlowNodeInputTypeEnum.addInputParam,
              defaultValue: {
                label: t('core.workflow.inputType.dynamicTargetInput'),
                valueType: WorkflowIOValueTypeEnum.dynamic,
                key: NodeInputKeyEnum.addInputParam,
                required: false
              }
            }
          ]
        : [])
    ],
    [showDynamicInputSelect, t]
  );

  const { register, getValues, setValue, handleSubmit, watch } = useForm<EditNodeFieldType>({
    defaultValues: {
      ...defaultValue,
      ...defaultField,
      valueType: defaultField.valueType ?? WorkflowIOValueTypeEnum.string
    }
  });
  const inputType = watch('inputType');
  const valueType = watch('valueType');

  const isToolInput = watch('isToolInput');
  const maxLength = watch('maxLength');
  const max = watch('max');
  const min = watch('min');
  const defaultInputValueType = watch('dynamicParamDefaultValue.valueType');

  const showKeyInput = useMemo(() => {
    if (inputType === FlowNodeInputTypeEnum.addInputParam) return false;

    return editField.key;
  }, [editField.key, inputType]);

  const showInputTypeSelect = useMemo(() => {
    return editField.inputType;
  }, [editField.inputType]);

  const showDescriptionInput = useMemo(() => {
    return editField.description;
  }, [editField.description]);

  const showValueTypeSelect = useMemo(() => {
    if (!editField.valueType) return false;
    if (inputType !== FlowNodeInputTypeEnum.reference) return false;

    return true;
  }, [editField.valueType, inputType]);

  // input type config
  const showToolInput = useMemo(() => {
    return inputType === FlowNodeInputTypeEnum.reference;
  }, [inputType]);

  const showDefaultValue = useMemo(() => {
    if (inputType === FlowNodeInputTypeEnum.input) return true;
    if (inputType === FlowNodeInputTypeEnum.textarea) return true;
    if (inputType === FlowNodeInputTypeEnum.JSONEditor) return true;
    if (inputType === FlowNodeInputTypeEnum.numberInput) return true;
    if (inputType === FlowNodeInputTypeEnum.switch) return true;

    return false;
  }, [inputType]);

  const showMaxLenInput = useMemo(() => {
    if (inputType === FlowNodeInputTypeEnum.input) return true;
    if (inputType === FlowNodeInputTypeEnum.textarea) return true;

    return false;
  }, [inputType]);

  const showMinMaxInput = useMemo(
    () => inputType === FlowNodeInputTypeEnum.numberInput,
    [inputType]
  );

  const showDynamicInput = useMemo(() => {
    return inputType === FlowNodeInputTypeEnum.addInputParam;
  }, [inputType]);

  const slicedTypeMap = Object.values(FlowValueTypeMap).slice(0, -1);

  const dataTypeSelectList = slicedTypeMap.map((item) => ({
    label: t(item.label),
    value: item.value
  }));

  const onSubmitSuccess = useCallback(
    (data: EditNodeFieldType) => {
      data.key = data?.key?.trim();
      // add default value
      const inputTypeConfig = inputTypeList.find((item) => item.value === data.inputType);
      if (inputTypeConfig?.defaultValue) {
        data.label = data.key;
        for (const key in inputTypeConfig.defaultValue) {
          // @ts-ignore
          data[key] = inputTypeConfig.defaultValue[key];
        }
      }

      if (!data.key) {
        return toast({
          status: 'warning',
          title: t('core.module.edit.Field Name Cannot Be Empty')
        });
      }

      // create check key
      if (!defaultField.key && keys.includes(data.key)) {
        return toast({
          status: 'warning',
          title: t('core.module.edit.Field Already Exist')
        });
      }
      // edit check repeat key
      if (defaultField.key && defaultField.key !== data.key && keys.includes(data.key)) {
        return toast({
          status: 'warning',
          title: t('core.module.edit.Field Already Exist')
        });
      }
      if (showValueTypeSelect && !data.valueType) {
        return toast({
          status: 'warning',
          title: '数据类型不能为空'
        });
      }

      onSubmit({
        data,
        changeKey: !keys.includes(data.key)
      });
    },
    [defaultField.key, inputTypeList, keys, onSubmit, showValueTypeSelect, t, toast]
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
      iconSrc="/imgs/workflow/extract.png"
      title={t('core.module.edit.Field Edit')}
      maxW={['90vw', showInputTypeSelect ? '800px' : '400px']}
      w={'100%'}
      overflow={'unset'}
    >
      <ModalBody overflow={'visible'}>
        <Flex gap={8} flexDirection={['column', 'row']}>
          <Stack flex={1} gap={5}>
            {showInputTypeSelect && (
              <Flex alignItems={'center'}>
                <FormLabel flex={'0 0 70px'}>{t('core.module.Input Type')}</FormLabel>
                <Box flex={1}>
                  <MySelect
                    list={inputTypeList}
                    value={inputType}
                    onchange={(e: string) => {
                      const type = e as FlowNodeInputTypeEnum;

                      setValue('inputType', type);
                    }}
                  />
                </Box>
              </Flex>
            )}
            {showValueTypeSelect && !showInputTypeSelect && (
              <Flex alignItems={'center'}>
                <FormLabel flex={'0 0 70px'}>{t('core.module.Data Type')}</FormLabel>
                <Box flex={1}>
                  <MySelect
                    w={'full'}
                    list={dataTypeSelectList}
                    value={valueType}
                    onchange={(e: string) => {
                      const type = e as WorkflowIOValueTypeEnum;
                      setValue('valueType', type);
                    }}
                  />
                </Box>
              </Flex>
            )}
            {showKeyInput && (
              <Flex alignItems={'center'}>
                <FormLabel flex={'0 0 70px'}>{t('core.module.Field Name')}</FormLabel>
                <Input
                  bg={'myGray.50'}
                  placeholder="appointment/sql"
                  {...register('key', {
                    required: true
                  })}
                />
              </Flex>
            )}
            {showDescriptionInput && (
              <Box alignItems={'flex-start'}>
                <FormLabel flex={'0 0 70px'} mb={'1px'}>
                  {t('core.module.Field Description')}
                </FormLabel>
                <Textarea
                  bg={'myGray.50'}
                  placeholder={
                    isToolInput ? t('core.module.Plugin tool Description') : t('common.choosable')
                  }
                  rows={5}
                  {...register('description', { required: isToolInput ? true : false })}
                />
              </Box>
            )}
          </Stack>
          {/* input type config */}
          {showInputTypeSelect && (
            <Stack flex={1} gap={5}>
              <Flex alignItems={'center'}>
                <FormLabel flex={'0 0 70px'}>{workflowT('Field required')}</FormLabel>
                <Switch {...register('required')} />
              </Flex>
              {showToolInput && (
                <Flex alignItems={'center'}>
                  <FormLabel flex={'0 0 70px'}>工具参数</FormLabel>
                  <Switch {...register('isToolInput')} />
                </Flex>
              )}
              {showValueTypeSelect && (
                <Flex alignItems={'center'}>
                  <FormLabel flex={'0 0 70px'}>{t('core.module.Data Type')}</FormLabel>
                  <Box flex={1}>
                    <MySelect
                      w={'full'}
                      list={dataTypeSelectList}
                      value={valueType}
                      onchange={(e: string) => {
                        const type = e as WorkflowIOValueTypeEnum;
                        setValue('valueType', type);
                      }}
                    />
                  </Box>
                </Flex>
              )}
              {showDefaultValue && (
                <Flex alignItems={'center'}>
                  <FormLabel flex={'0 0 70px'}>{t('core.module.Default Value')}</FormLabel>
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
                    <Textarea
                      bg={'myGray.50'}
                      maxLength={maxLength}
                      {...register('defaultValue')}
                    />
                  )}
                  {inputType === FlowNodeInputTypeEnum.JSONEditor && (
                    <JsonEditor
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
              {showMaxLenInput && (
                <Flex alignItems={'center'}>
                  <FormLabel flex={'0 0 70px'}>{t('core.module.Max Length')}</FormLabel>
                  <MyNumberInput
                    flex={'1 0 0'}
                    bg={'myGray.50'}
                    placeholder={t('core.module.Max Length placeholder')}
                    value={maxLength}
                    onChange={(e) => {
                      // @ts-ignore
                      setValue('maxLength', e);
                    }}
                    // {...register('maxLength')}
                  />
                </Flex>
              )}
              {showMinMaxInput && (
                <>
                  <Flex alignItems={'center'}>
                    <FormLabel flex={'0 0 70px'}>{t('core.module.Max Value')}</FormLabel>
                    <MyNumberInput
                      flex={'1 0 0'}
                      bg={'myGray.50'}
                      value={watch('max')}
                      onChange={(e) => {
                        // @ts-ignore
                        setValue('max', e);
                      }}
                    />
                  </Flex>
                  <Flex alignItems={'center'}>
                    <FormLabel flex={'0 0 70px'}>{t('core.module.Min Value')}</FormLabel>
                    <MyNumberInput
                      flex={'1 0 0'}
                      bg={'myGray.50'}
                      value={watch('min')}
                      onChange={(e) => {
                        // @ts-ignore
                        setValue('min', e);
                      }}
                    />
                  </Flex>
                </>
              )}
              {showDynamicInput && (
                <Stack gap={5}>
                  <Flex alignItems={'center'}>
                    <FormLabel flex={'0 0 70px'}>{t('core.module.Input Type')}</FormLabel>
                    <Box flex={1} fontWeight={'bold'}>
                      {t('core.workflow.inputType.Reference')}
                    </Box>
                  </Flex>
                  <Flex alignItems={'center'}>
                    <FormLabel flex={'0 0 70px'}>{t('core.module.Data Type')}</FormLabel>
                    <Box flex={1}>
                      <MySelect
                        list={dataTypeSelectList}
                        value={defaultInputValueType}
                        onchange={(e) => {
                          setValue(
                            'dynamicParamDefaultValue.valueType',
                            e as WorkflowIOValueTypeEnum
                          );
                        }}
                      />
                    </Box>
                  </Flex>
                  <Flex alignItems={'center'}>
                    <FormLabel flex={'0 0 70px'}>{t('core.workflow.inputType.Required')}</FormLabel>
                    <Box flex={1}>
                      <Switch {...register('dynamicParamDefaultValue.required')} />
                    </Box>
                  </Flex>
                </Stack>
              )}
              {!showToolInput &&
                !showValueTypeSelect &&
                !showDefaultValue &&
                !showMaxLenInput &&
                !showMinMaxInput &&
                !showDynamicInput && <EmptyTip text={t('core.module.No Config Tips')} />}
            </Stack>
          )}
        </Flex>
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button onClick={handleSubmit(onSubmitSuccess, onSubmitError)}>
          {t('common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(FieldEditModal);
