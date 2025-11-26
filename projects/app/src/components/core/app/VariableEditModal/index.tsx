import React, { useCallback, useMemo, useEffect } from 'react';
import { Flex, Stack } from '@chakra-ui/react';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import type { VariableItemType } from '@fastgpt/global/core/app/type.d';
import { useForm } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import InputTypeConfig from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/InputTypeConfig';
import { workflowSystemVariables } from '@/web/core/app/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import InputTypeSelector from '@fastgpt/web/components/common/InputTypeSelector';
import { getVariableInputTypeList } from '@fastgpt/web/components/common/InputTypeSelector/configs';
import { addVariable } from '../VariableEdit';
import { useValidateFieldName, useSubmitErrorHandler } from '../utils/formValidation';

const VariableEditModal = ({
  onClose,
  variable,
  variables,
  onChange
}: {
  onClose: () => void;
  variable: VariableItemType;
  variables: VariableItemType[];
  onChange: (variables: VariableItemType[]) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const validateFieldName = useValidateFieldName();
  const onSubmitError = useSubmitErrorHandler();

  const form = useForm<VariableItemType>({
    defaultValues: variable
  });
  const { setValue, reset, watch, getValues } = form;
  const type = watch('type');
  useEffect(() => {
    reset(variable);
  }, [variable, reset]);

  const inputTypeList = useMemo(() => getVariableInputTypeList(), []);

  const defaultValueType = useMemo(() => {
    const item = inputTypeList.flat().find((item) => item.value === type);
    return item?.defaultValueType;
  }, [inputTypeList, type]);

  const handleTypeChange = useCallback(
    (newType: string) => {
      const typeEnum = newType as VariableInputEnum;
      const value = getValues();
      const defaultValIsNumber = !isNaN(Number(value.defaultValue));

      if (
        typeEnum === VariableInputEnum.select ||
        typeEnum === VariableInputEnum.multipleSelect ||
        typeEnum === VariableInputEnum.file ||
        (typeEnum === VariableInputEnum.numberInput && !defaultValIsNumber)
      ) {
        setValue('defaultValue', '');
      }
      if (typeEnum === VariableInputEnum.datasetSelect && !value.datasetOptions) {
        setValue('datasetOptions', []);
      }

      setValue('type', typeEnum);
    },
    [setValue, getValues]
  );

  const onSubmitSuccess = useCallback(
    (data: VariableItemType, action: 'confirm' | 'continue') => {
      data.label = data?.label?.trim();

      const otherVariables = variables.filter((v) => v.key !== data.key);
      const isValid = validateFieldName(data.label, {
        existingKeys: otherVariables.flatMap((v) => [v.key, v.label]),
        systemVariables: workflowSystemVariables,
        currentKey: data.key
      });

      if (!isValid) {
        return;
      }

      if (
        data.type === VariableInputEnum.custom ||
        data.type === VariableInputEnum.internal ||
        data.type === VariableInputEnum.switch
      ) {
        data.required = false;
      } else {
        data.valueType = inputTypeList
          .flat()
          .find((item) => item.value === data.type)?.defaultValueType;
      }

      Object.keys(data).forEach((key) => {
        if (data[key as keyof VariableItemType] === undefined) {
          delete data[key as keyof VariableItemType];
        }
      });

      const submittedData = data.key ? data : { ...data, key: getNanoid(8) };

      const updatedVariables =
        submittedData.key && variables.some((v) => v.key === submittedData.key)
          ? variables.map((item) => (item.key === submittedData.key ? submittedData : item))
          : [...variables, submittedData];

      onChange(updatedVariables);

      if (action === 'confirm') {
        onClose();
      } else if (action === 'continue') {
        toast({
          status: 'success',
          title: t('common:add_success')
        });
        reset({
          ...addVariable(),
          defaultValue: ''
        });
      }
    },
    [variables, inputTypeList, onChange, reset, onClose, validateFieldName, toast, t]
  );

  return (
    <MyModal
      iconSrc="core/app/simpleMode/variable"
      title={t('common:core.module.Variable Setting')}
      isOpen={true}
      onClose={onClose}
      maxW={['90vw', '1078px']}
      w={'100%'}
      isCentered
    >
      <Flex h={'560px'}>
        <Stack p={8}>
          <FormLabel color={'myGray.600'} fontWeight={'medium'}>
            {t('workflow:Variable.Variable type')}
          </FormLabel>
          <InputTypeSelector
            inputTypeList={inputTypeList}
            selectedType={type}
            onTypeChange={handleTypeChange}
          />
        </Stack>
        <InputTypeConfig
          form={form}
          type={'variable'}
          isEdit={!!variable?.key}
          inputType={type}
          defaultValueType={defaultValueType}
          onClose={onClose}
          onSubmitSuccess={onSubmitSuccess}
          onSubmitError={onSubmitError}
        />
      </Flex>
    </MyModal>
  );
};

export default VariableEditModal;
