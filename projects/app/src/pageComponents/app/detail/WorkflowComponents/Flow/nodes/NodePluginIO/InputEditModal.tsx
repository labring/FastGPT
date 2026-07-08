import React, { useCallback, useMemo } from 'react';
import { Flex, Stack } from '@chakra-ui/react';
import { useForm, useWatch } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import InputTypeConfig from './InputTypeConfig';
import InputTypeSelector from '@fastgpt/web/components/common/InputTypeSelector';
import {
  getPluginInputTypeList,
  getPluginInputTypeRawList
} from '@fastgpt/web/components/common/InputTypeSelector/configs';
import {
  useValidateFieldName,
  useSubmitErrorHandler
} from '@/components/core/app/utils/formValidation';
import { getSelectedInputRenderType } from '@fastgpt/global/core/app/formEdit/utils';

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
  canSelectImg: true,
  canLocalUpload: true,
  canUrlUpload: false
};

const FieldEditModal = ({
  defaultValue,
  keys = [],
  hasDynamicInput,
  showAgentGenerated,
  onClose,
  onSubmit
}: {
  defaultValue: FlowNodeInputItemType;
  keys: string[];
  hasDynamicInput: boolean;
  showAgentGenerated: boolean;
  onClose: () => void;
  onSubmit: (data: FlowNodeInputItemType) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const validateFieldName = useValidateFieldName();
  const onSubmitError = useSubmitErrorHandler();

  // rawInputTypeList: full renderTypeList array, used for onTypeChange
  const rawInputTypeList = useMemo(
    () => getPluginInputTypeRawList({ hasDynamicInput, showAgentGenerated }),
    [hasDynamicInput, showAgentGenerated]
  );
  // inputTypeList: for InputTypeSelector display
  const inputTypeList = useMemo(
    () => getPluginInputTypeList({ hasDynamicInput, showAgentGenerated }),
    [hasDynamicInput, showAgentGenerated]
  );

  const isEdit = !!defaultValue.key;
  const form = useForm({
    defaultValues: defaultValue
  });
  const { control, setValue, reset } = form;

  const renderTypeList = useWatch({ control, name: 'renderTypeList' });
  const selectedTypeIndex = useWatch({ control, name: 'selectedTypeIndex' });
  const inputType =
    renderTypeList?.[selectedTypeIndex ?? 0] || renderTypeList?.[0] || FlowNodeInputTypeEnum.reference;

  const defaultValueType = useMemo(
    () =>
      inputTypeList.flat().find((item) => item.value === inputType)?.defaultValueType ||
      WorkflowIOValueTypeEnum.string,
    [inputType, inputTypeList]
  );

  const onSubmitSuccess = useCallback(
    (data: FlowNodeInputItemType, action: 'confirm' | 'continue') => {
      data.label = data?.label?.trim();

      const isChangeKey = defaultValue.key !== data.key;
      const isValid = validateFieldName(data.label, {
        existingKeys: isEdit && !isChangeKey ? keys.filter((k) => k !== defaultValue.key) : keys,
        currentKey: defaultValue.key
      });

      if (!isValid) {
        return;
      }

      const selectedRenderType = getSelectedInputRenderType(data);

      // Auto set valueType
      if (
        selectedRenderType !== FlowNodeInputTypeEnum.reference &&
        selectedRenderType !== FlowNodeInputTypeEnum.customVariable &&
        selectedRenderType !== FlowNodeInputTypeEnum.hidden &&
        selectedRenderType !== FlowNodeInputTypeEnum.agentGenerated
      ) {
        data.valueType = defaultValueType;
      }

      // Remove required
      if (
        selectedRenderType === FlowNodeInputTypeEnum.addInputParam ||
        selectedRenderType === FlowNodeInputTypeEnum.customVariable ||
        selectedRenderType === FlowNodeInputTypeEnum.hidden ||
        selectedRenderType === FlowNodeInputTypeEnum.switch ||
        selectedRenderType === FlowNodeInputTypeEnum.agentGenerated
      ) {
        data.required = false;
      }

      if (selectedRenderType === FlowNodeInputTypeEnum.addInputParam) {
        if (
          !data.customInputConfig?.selectValueTypeList ||
          !data.customInputConfig?.selectValueTypeList.length
        ) {
          toast({
            status: 'warning',
            title: t('common:core.module.edit.Field Value Type Cannot Be Empty')
          });
          return;
        }
      }

      // Get toolDescription and removes the types of some unusable tools
      if (selectedRenderType === FlowNodeInputTypeEnum.agentGenerated) {
        data.toolDescription = data.toolDescription || data.description || data.label;
      } else {
        data.toolDescription = undefined;
      }

      data.key = data.label;

      // Remove undefined keys
      Object.keys(data).forEach((key) => {
        if (data[key as keyof FlowNodeInputItemType] === undefined) {
          delete data[key as keyof FlowNodeInputItemType];
        }
      });

      onSubmit(data);
      if (action === 'confirm') {
        onClose();
      } else if (action === 'continue') {
        toast({
          status: 'success',
          title: t('common:add_success')
        });
        reset(defaultInput);
      }
    },
    [
      defaultValue.key,
      keys,
      toast,
      t,
      defaultValueType,
      isEdit,
      onSubmit,
      onClose,
      reset,
      validateFieldName
    ]
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="/imgs/workflow/extract.png"
      title={isEdit ? t('workflow:edit_input') : t('workflow:add_new_input')}
      maxW={['90vw', '1078px']}
      w={'100%'}
      isCentered
    >
      <Flex h={'560px'}>
        <Stack p={8}>
          <FormLabel color={'myGray.600'} fontWeight={'medium'}>
            {t('common:core.module.Input Type')}
          </FormLabel>
          <InputTypeSelector
            inputTypeList={inputTypeList}
            selectedType={inputType}
            onTypeChange={(type) => {
              const targetItem = rawInputTypeList.flat().find((item) => item.value[0] === type);
              if (targetItem) {
                setValue('renderTypeList', targetItem.value);
                setValue('selectedTypeIndex', 0);
                setValue('defaultValue', '');
                if (
                  (type === FlowNodeInputTypeEnum.select ||
                    type === FlowNodeInputTypeEnum.multipleSelect) &&
                  !form.getValues('list')?.length
                ) {
                  setValue('list', [{ label: '', value: '' }]);
                }
              }
            }}
          />
        </Stack>
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
