import { Flex, Stack } from '@chakra-ui/react';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { type UserInputFormItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { isReferenceOptionFormItem } from '@fastgpt/global/core/workflow/template/system/interactive/constants';
import { useForm } from 'react-hook-form';
import { useToast } from '@fastgpt/web/hooks/useToast';
import InputTypeConfig from '../NodePluginIO/InputTypeConfig';
import InputTypeSelector from '@fastgpt/web/components/common/InputTypeSelector';
import { getFormInputTypeList } from '@fastgpt/web/components/common/InputTypeSelector/configs';
import {
  useValidateFieldName,
  useSubmitErrorHandler
} from '@/components/core/app/utils/formValidation';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pageComponents/app/detail/context';
import { WorkflowBufferDataContext } from '../../../context/workflowInitContext';
import {
  DYNAMIC_OPTION_EXCLUDED_VALUE_TYPES,
  getNodeAllSource,
  workflowReferenceValueIsSelectable
} from '@/web/core/workflow/utils';

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
  list: [{ label: '', value: '' }],
  listInputType: FlowNodeInputTypeEnum.input,
  listReference: []
};

// Modal for add or edit user input form items
const InputFormEditModal = ({
  nodeId,
  defaultValue,
  onClose,
  onSubmit,
  keys
}: {
  nodeId: string;
  defaultValue: UserInputFormItemType;
  onClose: () => void;
  onSubmit: (data: UserInputFormItemType) => void;
  keys: string[];
}) => {
  const isEdit = !!defaultValue.key;
  const { t } = useTranslation();
  const { toast } = useToast();
  const validateFieldName = useValidateFieldName();
  const onSubmitError = useSubmitErrorHandler();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const { edges, getNodeById, childrenNodeIdListMap } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );

  const form = useForm({
    defaultValues: {
      ...defaultValue,
      list: defaultValue.list?.length ? defaultValue.list : [{ label: '', value: '' }]
    }
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
      const isValid = validateFieldName(data.label, {
        existingKeys: isEdit && !isChangeKey ? keys.filter((k) => k !== defaultValue.key) : keys,
        currentKey: defaultValue.key
      });

      if (!isValid) {
        return;
      }

      if (isReferenceOptionFormItem(data)) {
        const sourceNodes = data.listReference?.length
          ? getNodeAllSource({
              nodeId,
              getNodeById,
              edges,
              chatConfig: appDetail.chatConfig,
              t: t as any,
              childrenNodeIdListMap
            })
          : [];
        const selectableReferences = (data.listReference ?? []).filter((item) =>
          workflowReferenceValueIsSelectable({
            value: item,
            sourceNodes,
            excludeValueTypes: DYNAMIC_OPTION_EXCLUDED_VALUE_TYPES
          })
        );

        if (selectableReferences.length === 0) {
          toast({
            status: 'warning',
            title: t('workflow:please_select_variable')
          });
          return;
        }

        data.listReference = selectableReferences;
      }

      data.key = data.label;
      data.valueType = defaultValueType as WorkflowIOValueTypeEnum;

      onSubmit(data);

      if (action === 'confirm') {
        onClose();
      } else if (action === 'continue') {
        toast({
          status: 'success',
          title: t('common:add_success')
        });
        reset(defaultFormInput);
      }
    },
    [
      defaultValue.key,
      keys,
      defaultValueType,
      isEdit,
      nodeId,
      getNodeById,
      edges,
      appDetail.chatConfig,
      childrenNodeIdListMap,
      toast,
      t,
      onSubmit,
      onClose,
      reset,
      validateFieldName
    ]
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
        <Stack p={8}>
          <FormLabel color={'myGray.600'} fontWeight={'medium'}>
            {t('common:core.module.Input Type')}
          </FormLabel>
          <InputTypeSelector
            inputTypeList={inputTypeList}
            selectedType={inputType}
            onTypeChange={(type) => {
              if (type === inputType) return;

              setValue('type', type as FlowNodeInputTypeEnum);
              setValue('defaultValue', type === FlowNodeInputTypeEnum.multipleSelect ? [] : '');
            }}
          />
        </Stack>
        <InputTypeConfig
          nodeId={nodeId}
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
