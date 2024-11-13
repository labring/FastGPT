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
import InputTypeConfig from './InputTypeConfig';

export const defaultInput: FlowNodeInputItemType = {
  renderTypeList: [FlowNodeInputTypeEnum.reference], // Can only choose one here
  selectedTypeIndex: 0,
  valueType: WorkflowIOValueTypeEnum.string,
  canEdit: true,
  key: '',
  label: '',
  description: '',
  defaultValue: '',
  list: [{ label: '', value: '' }],
  maxFiles: 5,
  canSelectFile: true,
  canSelectImg: true
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
            value: [FlowNodeInputTypeEnum.reference],
            defaultValueType: WorkflowIOValueTypeEnum.string
          },
          {
            icon: 'core/workflow/inputType/input',
            label: t('common:core.workflow.inputType.textInput'),
            value: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
            defaultValueType: WorkflowIOValueTypeEnum.string
          },
          {
            icon: 'core/workflow/inputType/jsonEditor',
            label: t('common:core.workflow.inputType.JSON Editor'),
            value: [FlowNodeInputTypeEnum.JSONEditor, FlowNodeInputTypeEnum.reference],
            defaultValueType: WorkflowIOValueTypeEnum.string
          },
          {
            icon: 'core/workflow/inputType/numberInput',
            label: t('common:core.workflow.inputType.number input'),
            value: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
            defaultValueType: WorkflowIOValueTypeEnum.number
          },
          {
            icon: 'core/workflow/inputType/option',
            label: t('common:core.workflow.inputType.select'),
            value: [FlowNodeInputTypeEnum.select, FlowNodeInputTypeEnum.reference],
            defaultValueType: WorkflowIOValueTypeEnum.string
          },
          {
            icon: 'core/workflow/inputType/switch',
            label: t('common:core.workflow.inputType.switch'),
            value: [FlowNodeInputTypeEnum.switch, FlowNodeInputTypeEnum.reference],
            defaultValueType: WorkflowIOValueTypeEnum.boolean
          }
        ],
        [
          {
            icon: 'core/workflow/inputType/selectLLM',
            label: t('common:core.workflow.inputType.selectLLMModel'),
            value: [FlowNodeInputTypeEnum.selectLLMModel],
            defaultValueType: WorkflowIOValueTypeEnum.string
          },
          {
            icon: 'core/workflow/inputType/selectDataset',
            label: t('common:core.workflow.inputType.selectDataset'),
            value: [FlowNodeInputTypeEnum.selectDataset],
            defaultValueType: WorkflowIOValueTypeEnum.selectDataset
          },
          ...(hasDynamicInput
            ? []
            : [
                {
                  icon: 'core/workflow/inputType/dynamic',
                  label: t('common:core.workflow.inputType.dynamicTargetInput'),
                  value: [FlowNodeInputTypeEnum.addInputParam],
                  defaultValueType: WorkflowIOValueTypeEnum.dynamic
                }
              ])
        ],
        [
          {
            icon: 'core/workflow/inputType/file',
            label: t('app:file_upload'),
            value: [FlowNodeInputTypeEnum.fileSelect],
            defaultValueType: WorkflowIOValueTypeEnum.arrayString,
            description: t('app:file_upload_tip')
          },
          {
            icon: 'core/workflow/inputType/customVariable',
            label: t('common:core.workflow.inputType.custom'),
            value: [FlowNodeInputTypeEnum.customVariable],
            defaultValueType: WorkflowIOValueTypeEnum.string,
            description: t('app:variable.select type_desc')
          }
        ]
      ] as {
        icon: string;
        label: string;
        value: FlowNodeInputTypeEnum[];
        defaultValueType: WorkflowIOValueTypeEnum;
        description?: string;
      }[][],
    [hasDynamicInput, t]
  );

  const isEdit = !!defaultValue.key;
  const form = useForm({
    defaultValues: defaultValue
  });
  const { setValue, watch, reset } = form;

  const renderTypeList = watch('renderTypeList');
  const inputType = renderTypeList[0] || FlowNodeInputTypeEnum.reference;

  const defaultValueType = useMemo(
    () =>
      inputTypeList.flat().find((item) => item.value[0] === inputType)?.defaultValueType ||
      WorkflowIOValueTypeEnum.string,
    [inputType, inputTypeList]
  );

  const onSubmitSuccess = useCallback(
    (data: FlowNodeInputItemType, action: 'confirm' | 'continue') => {
      data.label = data?.label?.trim();

      if (!data.label) {
        return toast({
          status: 'warning',
          title: t('common:core.module.edit.Field Name Cannot Be Empty')
        });
      }

      // Auto set valueType
      if (
        data.renderTypeList[0] !== FlowNodeInputTypeEnum.reference &&
        data.renderTypeList[0] !== FlowNodeInputTypeEnum.customVariable
      ) {
        data.valueType = defaultValueType;
      }

      // Remove required
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

      // Get toolDescription and removes the types of some unusable tools
      if (data.toolDescription && data.renderTypeList.includes(FlowNodeInputTypeEnum.reference)) {
        data.toolDescription = data.description;
      } else {
        data.toolDescription = undefined;
      }

      data.key = data.label;

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
    [defaultValue.key, defaultValueType, isEdit, keys, onSubmit, t, toast, onClose, reset]
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
      isOpen
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
                      const isSelected = inputType === item.value[0];
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
                            setValue('renderTypeList', item.value);
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
          defaultValueType={defaultValueType}
          onSubmitSuccess={onSubmitSuccess}
          onSubmitError={onSubmitError}
        />
      </Flex>
    </MyModal>
  );
};

export default React.memo(FieldEditModal);
