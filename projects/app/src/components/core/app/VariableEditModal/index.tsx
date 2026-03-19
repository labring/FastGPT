import React, { useCallback, useMemo, useEffect, useState } from 'react';
import { Flex, Stack } from '@chakra-ui/react';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import type { VariableItemType } from '@fastgpt/global/core/app/type';
import { useForm } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import InputTypeConfig from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/InputTypeConfig';
import { workflowSystemVariables } from '@/web/core/app/utils';
import InputTypeSelector from '@fastgpt/web/components/common/InputTypeSelector';
import { getVariableInputTypeList } from '@fastgpt/web/components/common/InputTypeSelector/configs';
import { addVariable } from '../VariableEdit';
import {
  useValidateFieldKey,
  useValidateFieldName,
  useSubmitErrorHandler
} from '../utils/formValidation';
import {
  getInitialVariableIdentifier,
  shouldLockVariableIdentifier,
  syncVariableIdentifier
} from '../utils/variableEditor';

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
  const validateFieldKey = useValidateFieldKey();
  const onSubmitError = useSubmitErrorHandler();

  const form = useForm<VariableItemType>({
    defaultValues: variable
  });
  const { setValue, reset, watch, getValues } = form;
  const type = watch('type');
  const label = watch('label');
  const key = watch('key');
  const [isIdentifierTouched, setIsIdentifierTouched] = useState(!!variable.key);
  const isIdentifierReadonly = useMemo(() => shouldLockVariableIdentifier(variable), [variable]);

  useEffect(() => {
    reset(variable);
    setValue('key', getInitialVariableIdentifier(variable));
    setIsIdentifierTouched(!!variable.key);
  }, [variable, reset, setValue]);

  useEffect(() => {
    if (isIdentifierReadonly) return;

    const nextKey = syncVariableIdentifier({
      label: label || '',
      key: key || '',
      touched: isIdentifierTouched
    });

    if (nextKey !== key) {
      setValue('key', nextKey, {
        shouldDirty: false
      });
    }
  }, [isIdentifierReadonly, isIdentifierTouched, key, label, setValue]);

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
      if (typeEnum === VariableInputEnum.file) {
        setValue('canLocalUpload', true);
      }

      setValue('type', typeEnum);
    },
    [setValue, getValues]
  );

  const onSubmitSuccess = useCallback(
    (data: VariableItemType, action: 'confirm' | 'continue') => {
      data.label = data?.label?.trim();
      data.key = data?.key?.trim();

      const otherVariables = variables.filter((v) => v.key !== variable.key);
      const isValidLabel = validateFieldName(data.label, {
        existingKeys: otherVariables.map((v) => v.label),
        systemVariables: workflowSystemVariables
      });
      if (!isValidLabel) {
        return;
      }

      const isValidKey = validateFieldKey(data.key, {
        existingKeys: otherVariables.map((v) => v.key),
        reservedKeys: workflowSystemVariables.map((item) => item.key)
      });
      if (!isValidKey) {
        return;
      }

      // For custom and internal types, user can select valueType manually, so don't override it
      // For other types, set valueType from defaultValueType
      if (
        ![VariableInputEnum.custom, VariableInputEnum.internal, VariableInputEnum].includes(
          data.type
        )
      ) {
        data.valueType = inputTypeList
          .flat()
          .find((item) => item.value === data.type)?.defaultValueType;
      }

      // Special types set required = false
      if (
        data.type === VariableInputEnum.custom ||
        data.type === VariableInputEnum.internal ||
        data.type === VariableInputEnum.switch
      ) {
        data.required = false;
      }

      Object.keys(data).forEach((key) => {
        if (data[key as keyof VariableItemType] === undefined) {
          delete data[key as keyof VariableItemType];
        }
      });

      const submittedData = data;

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
          key: getInitialVariableIdentifier(addVariable()),
          defaultValue: ''
        });
        setIsIdentifierTouched(false);
      }
    },
    [
      variables,
      inputTypeList,
      onChange,
      reset,
      onClose,
      validateFieldName,
      validateFieldKey,
      toast,
      t
    ]
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
          identifierReadonly={isIdentifierReadonly}
          onKeyChange={() => {
            if (!isIdentifierReadonly) {
              setIsIdentifierTouched(true);
            }
          }}
          onClose={onClose}
          onSubmitSuccess={onSubmitSuccess}
          onSubmitError={onSubmitError}
        />
      </Flex>
    </MyModal>
  );
};

export default VariableEditModal;
