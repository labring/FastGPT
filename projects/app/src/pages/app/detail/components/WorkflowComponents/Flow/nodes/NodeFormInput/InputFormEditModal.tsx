import { Box, Flex, FormLabel, Stack } from '@chakra-ui/react';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { UserInputFormItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useForm } from 'react-hook-form';
import { useToast } from '@fastgpt/web/hooks/useToast';
import InputTypeConfig from '../NodePluginIO/InputTypeConfig';

export const defaultFormInput: UserInputFormItemType = {
  type: FlowNodeInputTypeEnum.input,
  key: '',
  label: '',
  description: '',
  value: '',
  maxLength: undefined,
  defaultValue: '',
  valueType: WorkflowIOValueTypeEnum.string,
  required: false,
  list: [{ label: '', value: '' }]
};

// Modal for add or edit user input form items
const InputFormEditModal = ({
  defaultValue,
  onClose,
  onSubmit,
  keys
}: {
  defaultValue: UserInputFormItemType;
  onClose: () => void;
  onSubmit: (data: UserInputFormItemType) => void;
  keys: string[];
}) => {
  const isEdit = !!defaultValue.key;
  const { t } = useTranslation();
  const { toast } = useToast();

  const form = useForm({
    defaultValues: defaultValue
  });
  const { setValue, watch, reset } = form;

  const inputType = watch('type') || FlowNodeInputTypeEnum.input;

  const inputTypeList = [
    {
      icon: 'core/workflow/inputType/input',
      label: t('common:core.workflow.inputType.textInput'),
      value: FlowNodeInputTypeEnum.input,
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
    }
  ];

  const defaultValueType = inputTypeList
    .flat()
    .find((item) => item.value === inputType)?.defaultValueType;

  const onSubmitSuccess = useCallback(
    (data: UserInputFormItemType, action: 'confirm' | 'continue') => {
      const isChangeKey = defaultValue.key !== data.key;
      if (keys.includes(data.key)) {
        if (!isEdit || isChangeKey) {
          toast({
            status: 'warning',
            title: t('workflow:field_name_already_exists')
          });
          return;
        }
      }

      data.key = data.label;
      data.valueType = defaultValueType;

      if (action === 'confirm') {
        onSubmit(data);
        onClose();
      } else if (action === 'continue') {
        onSubmit(data);
        toast({
          status: 'success',
          title: t('common:common.Add Success')
        });
        reset(defaultFormInput);
      }
    },
    [defaultValue.key, keys, defaultValueType, isEdit, toast, t, onSubmit, onClose, reset]
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
      iconSrc="file/fill/manual"
      title={isEdit ? t('workflow:edit_input') : t('workflow:add_new_input')}
      maxW={['90vw', '878px']}
      w={'100%'}
      isCentered
    >
      <Flex h={'494px'}>
        <Stack gap={4} p={8}>
          <FormLabel color={'myGray.600'} fontWeight={'medium'}>
            {t('common:core.module.Input Type')}
          </FormLabel>
          <Flex flexDirection={'column'} gap={4}>
            <Box display={'grid'} gridTemplateColumns={'repeat(2, 1fr)'} gap={4}>
              {inputTypeList.map((item) => {
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
                    boxShadow={isSelected ? '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)' : 'none'}
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
                      setValue('type', item.value);
                    }}
                  >
                    <MyIcon
                      name={item.icon as any}
                      w={'20px'}
                      mr={1.5}
                      color={isSelected ? 'primary.600' : 'myGray.400'}
                    />
                    <Box as="span" color={isSelected ? 'myGray.900' : 'inherit'} pr={4}>
                      {item.label}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Flex>
        </Stack>
        <InputTypeConfig
          form={form}
          type={'formInput'}
          isEdit={isEdit}
          inputType={inputType}
          onClose={onClose}
          onSubmitSuccess={onSubmitSuccess}
          onSubmitError={onSubmitError}
        />
      </Flex>
    </MyModal>
  );
};

export default React.memo(InputFormEditModal);
