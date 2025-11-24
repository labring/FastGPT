import { Flex, FormLabel, Stack } from '@chakra-ui/react';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { type UserInputFormItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useForm } from 'react-hook-form';
import { useToast } from '@fastgpt/web/hooks/useToast';
import InputTypeConfig from '../NodePluginIO/InputTypeConfig';
import InputTypeSelector from '@fastgpt/web/components/common/InputTypeSelector';
import { getFormInputTypeList } from '@fastgpt/web/components/common/InputTypeSelector/configs';

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

  // 表单错误处理
  const handleFormError = useCallback(
    (errors: Record<string, any>) => {
      const firstError = Object.values(errors).find((error) => error?.message);
      if (firstError) {
        toast({
          status: 'warning',
          title: firstError.message
        });
      }
    },
    [toast]
  );

  const form = useForm({
    defaultValues: defaultValue
  });
  const { setValue, watch, reset } = form;

  const inputType = watch('type') || FlowNodeInputTypeEnum.input;

  const inputTypeList = useMemo(() => getFormInputTypeList(), []);

  const defaultValueType = useMemo(
    () => inputTypeList.flat().find((item) => item.value === inputType)?.defaultValueType,
    [inputTypeList, inputType]
  );

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
      data.valueType = defaultValueType as WorkflowIOValueTypeEnum;

      if (action === 'confirm') {
        onSubmit(data);
        onClose();
      } else if (action === 'continue') {
        onSubmit(data);
        toast({
          status: 'success',
          title: t('common:add_success')
        });
        reset(defaultFormInput);
      }
    },
    [defaultValue.key, keys, defaultValueType, isEdit, toast, t, onSubmit, onClose, reset]
  );

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="file/fill/manual"
      title={isEdit ? t('workflow:edit_input') : t('workflow:add_new_input')}
      maxW={['90vw', '1078px']}
      w={'100%'}
      isCentered
    >
      <Flex h={'560px'}>
        <Stack gap={4} p={8}>
          <FormLabel color={'myGray.600'} fontWeight={'medium'}>
            {t('common:core.module.Input Type')}
          </FormLabel>
          <InputTypeSelector
            inputTypeList={inputTypeList}
            selectedType={inputType}
            onTypeChange={(type) => {
              setValue('type', type as FlowNodeInputTypeEnum);
              setValue('defaultValue', '');
            }}
          />
        </Stack>
        <InputTypeConfig
          form={form}
          type={'formInput'}
          isEdit={isEdit}
          inputType={inputType}
          onClose={onClose}
          onSubmitSuccess={onSubmitSuccess}
          onSubmitError={handleFormError}
        />
      </Flex>
    </MyModal>
  );
};

export default React.memo(InputFormEditModal);
