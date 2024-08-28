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
  Stack,
  HStack
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { FlowValueTypeMap } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

import dynamic from 'next/dynamic';
import { useI18n } from '@/web/context/I18n';
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
  label: ''
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
  const { workflowT } = useI18n();
  const { toast } = useToast();

  const inputTypeList = useMemo(
    () => [
      {
        label: t('common:core.workflow.inputType.Reference'),
        value: FlowNodeInputTypeEnum.reference,
        defaultValueType: WorkflowIOValueTypeEnum.string
      },
      {
        label: t('common:core.workflow.inputType.input'),
        value: FlowNodeInputTypeEnum.input,
        defaultValueType: WorkflowIOValueTypeEnum.string
      },
      {
        label: t('common:core.workflow.inputType.textarea'),
        value: FlowNodeInputTypeEnum.textarea,
        defaultValueType: WorkflowIOValueTypeEnum.string
      },
      {
        label: t('common:core.workflow.inputType.JSON Editor'),
        value: FlowNodeInputTypeEnum.JSONEditor,
        defaultValueType: WorkflowIOValueTypeEnum.string
      },
      {
        label: t('common:core.workflow.inputType.number input'),
        value: FlowNodeInputTypeEnum.numberInput,
        defaultValueType: WorkflowIOValueTypeEnum.number
      },
      {
        label: t('common:core.workflow.inputType.switch'),
        value: FlowNodeInputTypeEnum.switch,
        defaultValueType: WorkflowIOValueTypeEnum.boolean
      },
      {
        label: t('common:core.workflow.inputType.selectApp'),
        value: FlowNodeInputTypeEnum.selectApp,
        defaultValueType: WorkflowIOValueTypeEnum.selectApp
      },
      {
        label: t('common:core.workflow.inputType.selectLLMModel'),
        value: FlowNodeInputTypeEnum.selectLLMModel,
        defaultValueType: WorkflowIOValueTypeEnum.string
      },
      {
        label: t('common:core.workflow.inputType.selectDataset'),
        value: FlowNodeInputTypeEnum.selectDataset,
        defaultValueType: WorkflowIOValueTypeEnum.selectDataset
      },
      ...(hasDynamicInput
        ? []
        : [
            {
              label: t('common:core.workflow.inputType.dynamicTargetInput'),
              value: FlowNodeInputTypeEnum.addInputParam,
              defaultValueType: WorkflowIOValueTypeEnum.dynamic
            }
          ])
    ],
    [hasDynamicInput, t]
  );

  const isEdit = !!defaultValue.key;
  const { register, getValues, setValue, handleSubmit, watch } = useForm({
    defaultValues: defaultValue
  });

  const inputType = watch('renderTypeList.0') || FlowNodeInputTypeEnum.reference;
  const valueType = watch('valueType');

  const [isToolInput, { toggle: setIsToolInput }] = useBoolean(!!getValues('toolDescription'));

  const maxLength = watch('maxLength');
  const max = watch('max');
  const min = watch('min');
  const selectValueTypeList = watch('customInputConfig.selectValueTypeList');

  const showValueTypeSelect = inputType === FlowNodeInputTypeEnum.reference;

  // input type config
  const showRequired = useMemo(() => {
    const list = [FlowNodeInputTypeEnum.addInputParam];
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
    inputTypeList.find((item) => item.value === inputType)?.defaultValueType ||
    WorkflowIOValueTypeEnum.string;

  const onSubmitSuccess = useCallback(
    (data: FlowNodeInputItemType) => {
      data.key = data?.key?.trim();

      if (!data.key) {
        return toast({
          status: 'warning',
          title: t('common:core.module.edit.Field Name Cannot Be Empty')
        });
      }

      if (data.renderTypeList[0] !== FlowNodeInputTypeEnum.reference) {
        data.valueType = defaultValueType;
      }

      const isChangeKey = defaultValue.key !== data.key;
      // create check key
      if (keys.includes(data.key)) {
        if (!isEdit || isChangeKey) {
          toast({
            status: 'warning',
            title: workflowT('field_name_already_exists')
          });
          return;
        }
      }

      if (isToolInput) {
        data.toolDescription = data.description;
      }

      data.label = data.key;

      onSubmit({
        data,
        isChangeKey
      });
      onClose();
    },
    [
      defaultValue.key,
      defaultValueType,
      isEdit,
      isToolInput,
      keys,
      onClose,
      onSubmit,
      t,
      toast,
      workflowT
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
      iconSrc="/imgs/workflow/extract.png"
      title={isEdit ? workflowT('edit_input') : workflowT('add_new_input')}
      maxW={['90vw', '800px']}
      w={'100%'}
    >
      <ModalBody display={'flex'} gap={8} flexDirection={['column', 'row']}>
        <Stack flex={1} gap={5}>
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 70px'}>{t('common:core.module.Input Type')}</FormLabel>
            <Box flex={1}>
              <MySelect<FlowNodeInputTypeEnum>
                list={inputTypeList}
                value={inputType}
                onchange={(e) => {
                  setValue('renderTypeList.0', e);
                }}
              />
            </Box>
          </Flex>
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 70px'}>{t('common:core.module.Field Name')}</FormLabel>
            <Input
              bg={'myGray.50'}
              placeholder="appointment/sql"
              {...register('key', {
                required: true
              })}
            />
          </Flex>
          <Box alignItems={'flex-start'}>
            <FormLabel flex={'0 0 70px'} mb={'1px'}>
              {workflowT('field_description')}
            </FormLabel>
            <Textarea
              bg={'myGray.50'}
              placeholder={workflowT('field_description_placeholder')}
              rows={4}
              {...register('description', { required: isToolInput ? true : false })}
            />
          </Box>
        </Stack>
        {/* input type config */}
        <Stack flex={1} gap={5}>
          {/* value type */}
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 70px'}>{t('common:core.module.Data Type')}</FormLabel>
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
              defaultValueType
            )}
          </Flex>

          {showRequired && (
            <Flex alignItems={'center'} minH={'40px'}>
              <FormLabel flex={'1'}>{workflowT('field_required')}</FormLabel>
              <Switch {...register('required')} />
            </Flex>
          )}

          {/* reference */}
          {inputType === FlowNodeInputTypeEnum.reference && (
            <>
              <Flex alignItems={'center'} minH={'40px'}>
                <FormLabel flex={'1'}>{workflowT('field_used_as_tool_input')}</FormLabel>
                <Switch
                  isChecked={isToolInput}
                  onChange={(e) => {
                    setIsToolInput();
                  }}
                />
              </Flex>
            </>
          )}

          {showMaxLenInput && (
            <Flex alignItems={'center'}>
              <FormLabel flex={'0 0 70px'}>{t('common:core.module.Max Length')}</FormLabel>
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
                <FormLabel flex={'0 0 70px'}>{t('common:core.module.Max Value')}</FormLabel>
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
                <FormLabel flex={'0 0 70px'}>{t('common:core.module.Min Value')}</FormLabel>
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
              <FormLabel flex={inputType === FlowNodeInputTypeEnum.switch ? 1 : '0 0 70px'}>
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
                <FormLabel flex={'0 0 70px'}>{t('common:core.module.Input Type')}</FormLabel>
                <Box flex={1} fontWeight={'bold'}>
                  {workflowT('only_the_reference_type_is_supported')}
                </Box>
              </Flex>
              <Box>
                <HStack mb={1}>
                  <FormLabel>{workflowT('optional_value_type')}</FormLabel>
                  <QuestionTip label={workflowT('optional_value_type_tip')} />
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
        </Stack>
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:common.Close')}
        </Button>
        <Button onClick={handleSubmit(onSubmitSuccess, onSubmitError)}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(FieldEditModal);
