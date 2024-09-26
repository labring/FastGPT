import React, { useCallback, useMemo } from 'react';
import { Box, Flex, Stack } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';

import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useBoolean } from 'ahooks';
import InputTypeConfig from './InputTypeConfig';

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
  onSubmit: (data: FlowNodeInputItemType) => void;
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
  const form = useForm({
    defaultValues: {
      ...defaultValue,
      list: defaultValue.list?.length ? defaultValue.list : [{ label: '', value: '' }]
    }
  });
  const { getValues, setValue, watch, reset } = form;

  const inputType = watch('renderTypeList.0') || FlowNodeInputTypeEnum.reference;
  const valueType = watch('valueType');

  const [isToolInput, { toggle: setIsToolInput }] = useBoolean(!!getValues('toolDescription'));

  const maxLength = watch('maxLength');
  const max = watch('max');
  const min = watch('min');
  const selectValueTypeList = watch('customInputConfig.selectValueTypeList');
  const defaultJsonValue = watch('defaultValue');

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

      // Focus remove toolDescription
      if (isToolInput && data.renderTypeList.includes(FlowNodeInputTypeEnum.reference)) {
        data.toolDescription = data.description;
      } else {
        data.toolDescription = undefined;
      }

      data.label = data.key;

      if (action === 'confirm') {
        onSubmit(data);
        onClose();
      } else if (action === 'continue') {
        onSubmit(data);
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
        <InputTypeConfig
          form={form}
          type={'plugin'}
          isEdit={isEdit}
          onClose={onClose}
          inputType={inputType}
          maxLength={maxLength}
          max={max}
          min={min}
          selectValueTypeList={selectValueTypeList}
          defaultJsonValue={defaultJsonValue}
          isToolInput={isToolInput}
          setIsToolInput={setIsToolInput}
          valueType={valueType}
          defaultValueType={defaultValueType}
          onSubmitSuccess={onSubmitSuccess}
          onSubmitError={onSubmitError}
        />
      </Flex>
    </MyModal>
  );
};

export default React.memo(FieldEditModal);
