import { Box, Button, Flex, HStack, Input, useDisclosure } from '@chakra-ui/react';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import type { FlowNodeInputItemType, InputConfigType } from '@fastgpt/global/core/workflow/type/io';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { useForm, Controller, useWatch } from 'react-hook-form';
import {
  SecretValueTypeSchema,
  type SecretValueType,
  type StoreSecretValueType
} from '@fastgpt/global/common/secret/type';
import {
  getSecretCipherValue,
  getSecretPlainValue,
  getSecretValueField,
  hasSecretValueField,
  isSecretReferenceValue
} from '@fastgpt/global/common/secret/utils';
import { migrateSecretValueToCurrent } from '@fastgpt/global/core/workflow/migration/secret';
import IconButton from '@/pageComponents/account/team/OrgManage/IconButton';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import InputRender from '@/components/core/app/formRender';
import { secretInputTypeToInputType } from '@/components/core/app/formRender/utils';
import { getAppToolTemplates } from '@/web/core/app/api/tool';
import type { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { InputTypeEnum } from '@/components/core/app/formRender/constant';
import UseGuideModal from '@/components/common/Modal/UseGuideModal';
import { ReferSelector } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/Reference';
import NodeInputSelect from '@fastgpt/web/components/core/workflow/NodeInputSelect';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

export type ToolParamsFormType = {
  type: SystemToolSecretInputTypeEnum;
  value?: StoreSecretValueType;
};

type SecretInputFormProps = {
  nodeId?: string;
  referenceList?: SecretReferenceList;
  parentId?: string;
  source?: string;
  isFolder?: boolean;
  inputConfig: FlowNodeInputItemType;
  hasSystemSecret?: boolean;
  secretCost?: number;
  courseUrl?: string;
  readmeUrl?: string;
  formId?: string;
  showTitle?: boolean;
  onChange?: (data: ToolParamsFormType) => void;
  onTypeChange?: (type: SystemToolSecretInputTypeEnum) => void;
  showExpandControl?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: (isExpanded: boolean) => void;
  onSubmit?: (data: ToolParamsFormType) => void;
};

type SecretInputValue = SecretValueType;
type FieldMode = 'manual' | 'reference';

const secretInputModeTypeMap = {
  input: FlowNodeInputTypeEnum.input,
  numberInput: FlowNodeInputTypeEnum.numberInput,
  secret: FlowNodeInputTypeEnum.password,
  switch: FlowNodeInputTypeEnum.switch,
  select: FlowNodeInputTypeEnum.select
} satisfies Record<InputConfigType['inputType'], FlowNodeInputTypeEnum>;

export const getSecretInputModeType = (inputType: InputConfigType['inputType']) =>
  secretInputModeTypeMap[inputType];

export type SecretReferenceList = {
  label: string | React.ReactNode;
  value: string;
  name?: string;
  avatar?: string;
  children: {
    label: string;
    value: string;
    valueType?: WorkflowIOValueTypeEnum;
  }[];
}[];

export const isReferenceArrayValue = (value?: SecretInputValue) =>
  isSecretReferenceValue(value) && Array.isArray(value.ref[0]);

export const formatReferenceValue = (value?: SecretInputValue) => {
  if (!isSecretReferenceValue(value)) return '';
  const reference = value.ref;
  return Array.isArray(reference[0])
    ? (reference as [string, string?][]).map((item) => item.join(' / ')).join(', ')
    : (reference as [string, string?]).join(' / ');
};

export const shouldShowSecretInput = ({
  value,
  isEditing = false
}: {
  value?: SecretInputValue;
  isEditing?: boolean;
}) => {
  const staticValue = isSecretReferenceValue(value) ? undefined : value;
  const hasCipherValue = !!getSecretCipherValue(staticValue);
  const hasPlainValue = !!getSecretPlainValue(staticValue);
  return (!hasCipherValue && !hasPlainValue) || isEditing;
};

export const normalizeInputValue = (
  value: unknown,
  inputType: InputConfigType['inputType'] = 'secret'
): SecretInputValue => {
  try {
    const migratedValue = migrateSecretValueToCurrent(value);
    const parsedValue = SecretValueTypeSchema.safeParse(migratedValue);
    if (parsedValue.success) return parsedValue.data;
  } catch {
    // Ignore malformed legacy references and let the editor start with an empty value.
  }

  const rawValue = hasSecretValueField(value, 'value')
    ? getSecretValueField(value, 'value')
    : value;

  return {
    value:
      inputType === 'secret'
        ? typeof rawValue === 'string'
          ? rawValue
          : ''
        : rawValue === undefined || rawValue === null
          ? ''
          : String(rawValue)
  };
};

export const formatManualInputValue = (value: unknown) =>
  value === undefined || value === null ? '' : String(value);

export const getSecretInputValueForMode = (mode: FieldMode) =>
  mode === 'reference' ? undefined : { value: '' };

export const filterReferenceListByInputType = (
  referenceList: SecretReferenceList,
  inputType: InputConfigType['inputType']
) => {
  const valueType =
    inputType === 'numberInput'
      ? WorkflowIOValueTypeEnum.number
      : inputType === 'switch'
        ? WorkflowIOValueTypeEnum.boolean
        : WorkflowIOValueTypeEnum.string;

  return referenceList
    .map((source) => ({
      ...source,
      children: source.children.filter(
        (child) =>
          child.valueType === undefined ||
          child.valueType === WorkflowIOValueTypeEnum.any ||
          child.valueType === valueType
      )
    }))
    .filter((source) => source.children.length > 0);
};

export const SecretInputForm = ({
  nodeId,
  referenceList = [],
  parentId,
  source,
  hasSystemSecret,
  secretCost = 0,
  isFolder,
  inputConfig,
  courseUrl,
  readmeUrl,
  formId,
  showTitle = true,
  onChange,
  onTypeChange,
  showExpandControl = false,
  isExpanded = true,
  onToggleExpand,
  onSubmit
}: SecretInputFormProps) => {
  const { t } = useTranslation();
  const [editIndex, setEditIndex] = useState<number>();
  const { isOpen: isSystemCostOpen, onToggle: onToggleSystemCost } = useDisclosure({
    defaultIsOpen: false
  });
  const inputList = inputConfig?.inputList || [];
  const [fieldModes, setFieldModes] = useState<Record<string, FieldMode>>({});

  const { register, setValue, getValues, handleSubmit, control } = useForm<ToolParamsFormType>({
    defaultValues: (() => {
      const defaultValue = inputConfig.value as ToolParamsFormType | undefined;
      const defaultFields = defaultValue?.value;
      return defaultValue
        ? {
            ...defaultValue,
            ...(defaultValue.type === SystemToolSecretInputTypeEnum.manual
              ? {
                  value: inputList.reduce(
                    (acc, item) => {
                      acc[item.key] = normalizeInputValue(
                        defaultFields?.[item.key],
                        item.inputType
                      );
                      return acc;
                    },
                    {} as Record<string, any>
                  )
                }
              : {})
          }
        : {
            type: hasSystemSecret
              ? SystemToolSecretInputTypeEnum.system
              : SystemToolSecretInputTypeEnum.manual,
            value:
              inputList?.reduce(
                (acc, item) => {
                  acc[item.key] = { value: '' };
                  return acc;
                },
                {} as Record<string, InputConfigType['value']>
              ) || {}
          };
    })()
  });
  const configType = useWatch({ control, name: 'type' });
  const formValues = useWatch({ control });

  const { data: childTools = [] } = useRequest<NodeTemplateListItemType[], []>(
    async () => {
      if (!isFolder) return [];
      return getAppToolTemplates({ parentId, source });
    },
    {
      manual: false,
      refreshDeps: [isFolder, parentId, source]
    }
  );

  const changeConfigType = (type: SystemToolSecretInputTypeEnum) => {
    setValue('type', type);
    if (type !== SystemToolSecretInputTypeEnum.manual) {
      setValue('value', undefined);
    }
    onTypeChange?.(type);
  };

  const getFieldMode = (key: string, value?: SecretInputValue): FieldMode =>
    fieldModes[key] || (isSecretReferenceValue(value) ? 'reference' : 'manual');

  const changeFieldMode = (key: string, mode: FieldMode) => {
    setFieldModes((prev) => ({ ...prev, [key]: mode }));
    const fieldPath = `value.${key}` as any;
    const fieldValuePath = `value.${key}.value` as any;
    setValue(fieldValuePath, undefined);
    setValue(fieldPath, undefined);

    const nextValue = getSecretInputValueForMode(mode);
    if (nextValue) {
      setValue(fieldValuePath, nextValue.value);
    }
  };

  const isCardExpanded = (type: SystemToolSecretInputTypeEnum) => configType === type && isExpanded;

  const expandCard = (type: SystemToolSecretInputTypeEnum) => {
    if (configType !== type) {
      changeConfigType(type);
    }
    onToggleExpand?.(true);
  };

  const renderExpandButton = (type: SystemToolSecretInputTypeEnum) => {
    if (!showExpandControl || isCardExpanded(type)) return null;

    return (
      <Button
        flexShrink={0}
        size={'xs'}
        h={'24px'}
        variant={'transparentBase'}
        color={'myGray.600'}
        leftIcon={<MyIcon name={'core/chat/chevronDown'} w={'12px'} color={'myGray.600'} />}
        px={2}
        onClick={(e) => {
          e.stopPropagation();
          expandCard(type);
        }}
      >
        {t('workflow:Unfold')}
      </Button>
    );
  };

  const renderCollapseButton = () => {
    if (!showExpandControl) return null;

    return (
      <Button
        size={'xs'}
        h={'24px'}
        variant={'transparentBase'}
        color={'myGray.600'}
        leftIcon={<MyIcon name={'core/chat/chevronUp'} w={'12px'} color={'myGray.600'} />}
        px={2}
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand?.(false);
        }}
      >
        {t('workflow:Fold')}
      </Button>
    );
  };

  const renderSecretTitle = ({
    type,
    title
  }: {
    type: SystemToolSecretInputTypeEnum;
    title: React.ReactNode;
  }) => (
    <Flex alignItems={'center'} justifyContent={'space-between'} gap={2} w={'full'} minW={0}>
      <Box minW={0} flex={1}>
        {title}
      </Box>
      {type === SystemToolSecretInputTypeEnum.manual &&
        (isCardExpanded(type) ? renderCollapseButton() : renderExpandButton(type))}
    </Flex>
  );

  const systemCostContent = (
    <Box w={'full'}>
      <Flex alignItems={'center'} justifyContent={'space-between'} gap={2}>
        {isFolder ? (
          <HStack flex={1} minW={0}>
            <MyIcon name={'common/info'} w={'1.1rem'} color={'primary.600'} />
            <Box fontSize={'sm'}>{t('app:tool_active_system_config_price_desc_folder')}</Box>
          </HStack>
        ) : (
          <HStack flex={1} minW={0}>
            <MyIcon name={'common/info'} w={'1.1rem'} color={'primary.600'} />
            <Box fontSize={'sm'}>
              {t('app:tool_active_system_config_price_desc', {
                price: secretCost
              })}
            </Box>
          </HStack>
        )}
        {isFolder && (
          <IconButton
            name={isSystemCostOpen ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
            w={'16px'}
            color={'myGray.500'}
            aria-label={t(isSystemCostOpen ? 'workflow:Fold' : 'workflow:Unfold')}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSystemCost();
            }}
          />
        )}
      </Flex>
      {isFolder && isSystemCostOpen && (
        <Box fontSize={'sm'} pl={6} mt={2}>
          {childTools.map((tool) => (
            <Box key={tool.id} fontSize={'sm'} mb={1}>
              {t(tool.name as any)}:{' '}
              {t('app:plugin_cost_per_times', { cost: tool.systemKeyCost || 0 })}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );

  useEffect(() => {
    if (!onChange) return;

    onChange(formValues as ToolParamsFormType);
  }, [formValues, onChange]);

  return (
    <Box
      as={onSubmit ? 'form' : 'div'}
      id={formId}
      onSubmit={onSubmit ? handleSubmit(onSubmit) : undefined}
    >
      <>
        {showTitle && (
          <FormLabel mb={1} fontSize={'md'}>
            {t('common:secret_key')}
          </FormLabel>
        )}
        <Box>
          <LeftRadio
            gap={2}
            defaultBg="white"
            activeBg="white"
            list={[
              ...(hasSystemSecret
                ? [
                    {
                      title: renderSecretTitle({
                        type: SystemToolSecretInputTypeEnum.system,
                        title: <Box fontSize={'sm'}>{t('app:system_secret')}</Box>
                      }),
                      desc: t('app:tool_active_system_config_desc'),
                      value: SystemToolSecretInputTypeEnum.system,
                      children:
                        configType === SystemToolSecretInputTypeEnum.system
                          ? systemCostContent
                          : null
                    }
                  ]
                : []),
              {
                title: renderSecretTitle({
                  type: SystemToolSecretInputTypeEnum.manual,
                  title:
                    courseUrl || readmeUrl ? (
                      <HStack
                        spacing={2}
                        color={'myGray.900'}
                        fontWeight={'500'}
                        whiteSpace={'nowrap'}
                        fontSize={'sm'}
                        lineHeight={1}
                      >
                        <Box>{t('app:manual_secret')}</Box>
                        <UseGuideModal
                          title={t('app:manual_secret')}
                          iconSrc="key"
                          link={courseUrl}
                          readmeUrl={readmeUrl}
                        >
                          {({ onClick }) => (
                            <HStack
                              spacing={1}
                              color={'primary.600'}
                              justifyContent={'flex-end'}
                              _hover={{
                                textDecoration: 'underline',
                                cursor: 'pointer'
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onClick();
                              }}
                            >
                              <MyIcon name={'book'} w={'14px'} />
                              <Box fontSize={'sm'}>{t('app:secret_get_course')}</Box>
                            </HStack>
                          )}
                        </UseGuideModal>
                      </HStack>
                    ) : (
                      <Box fontSize={'sm'}>{t('app:manual_secret')}</Box>
                    )
                }),
                desc: t('app:tool_active_manual_config_desc'),
                value: SystemToolSecretInputTypeEnum.manual,
                children:
                  configType === SystemToolSecretInputTypeEnum.manual &&
                  (!showExpandControl || isExpanded) ? (
                    <>
                      {inputList.map((item, i) => {
                        const inputKey = `value.${item.key}.value` as any;
                        const value = getValues(`value.${item.key}`);
                        const fieldMode = getFieldMode(item.key, value);
                        const manualInputType = getSecretInputModeType(item.inputType);
                        const fieldReferenceList = filterReferenceListByInputType(
                          referenceList,
                          item.inputType
                        );
                        const showInput = shouldShowSecretInput({
                          value,
                          isEditing: editIndex === i
                        });
                        const fieldLabel = t(item.label as any);

                        return (
                          <Box key={item.key} mb={inputList.length - 1 === i ? 2 : 5}>
                            <Flex alignItems={'center'} mb={1}>
                              <FormLabel required={item.required} color={'myGray.600'}>
                                {fieldLabel}
                              </FormLabel>
                              {item.description && <QuestionTip label={item.description} />}
                              {nodeId && (
                                <Box ml={2} className="nodrag">
                                  <NodeInputSelect
                                    renderTypeList={[
                                      manualInputType,
                                      FlowNodeInputTypeEnum.reference
                                    ]}
                                    selectedType={
                                      fieldMode === 'reference'
                                        ? FlowNodeInputTypeEnum.reference
                                        : manualInputType
                                    }
                                    onChange={(mode) =>
                                      changeFieldMode(
                                        item.key,
                                        mode === FlowNodeInputTypeEnum.reference
                                          ? 'reference'
                                          : 'manual'
                                      )
                                    }
                                  />
                                </Box>
                              )}
                              <Box flex={'1 0 0'} />
                            </Flex>
                            {fieldMode === 'reference' ? (
                              <Controller
                                control={control}
                                name={`value.${item.key}` as any}
                                rules={{
                                  required: item.required
                                }}
                                render={({ field: { value: referenceValue, onChange } }) =>
                                  nodeId && !isReferenceArrayValue(referenceValue) ? (
                                    <ReferSelector
                                      list={fieldReferenceList}
                                      value={
                                        isSecretReferenceValue(referenceValue)
                                          ? referenceValue.ref
                                          : undefined
                                      }
                                      onSelect={(ref) => onChange(ref ? { ref } : undefined)}
                                    />
                                  ) : (
                                    <Box
                                      borderRadius={'6px'}
                                      border={'0.5px solid'}
                                      borderColor={'primary.200'}
                                      bg={'primary.50'}
                                      minH={8}
                                      px={3}
                                      display={'flex'}
                                      alignItems={'center'}
                                    >
                                      {formatReferenceValue(referenceValue) || 'Reference'}
                                    </Box>
                                  )
                                }
                              />
                            ) : item.inputType === 'secret' ? (
                              <Flex alignItems={'center'}>
                                {showInput ? (
                                  <Input
                                    bg={'myGray.50'}
                                    h={10}
                                    py={0}
                                    display={'flex'}
                                    alignItems={'center'}
                                    lineHeight={'normal'}
                                    _placeholder={{ lineHeight: 'normal' }}
                                    placeholder={fieldLabel}
                                    {...register(inputKey, {
                                      required: item.required
                                    })}
                                    onFocus={() => setEditIndex(i)}
                                  />
                                ) : (
                                  <>
                                    <Flex
                                      flex={1}
                                      borderRadius={'6px'}
                                      border={'0.5px solid'}
                                      borderColor={'primary.200'}
                                      bg={'primary.50'}
                                      h={10}
                                      px={3}
                                      alignItems={'center'}
                                      gap={1}
                                      mr={1}
                                    >
                                      <MyIcon name="checkCircle" w={'16px'} color={'primary.600'} />
                                      <Box
                                        fontSize={'sm'}
                                        fontWeight={'medium'}
                                        color={'primary.600'}
                                      >
                                        {t('common:had_auth_value')}
                                      </Box>
                                    </Flex>
                                    <IconButton
                                      name="edit"
                                      onClick={() => {
                                        setEditIndex(i);
                                        // 进入编辑态即表示替换该密钥，空提交需要清除旧密文。
                                        setValue(`value.${item.key}` as any, { value: '' });
                                      }}
                                    />
                                  </>
                                )}
                              </Flex>
                            ) : item.inputType === 'input' ? (
                              <Controller
                                control={control}
                                name={inputKey}
                                rules={{
                                  required: item.required
                                }}
                                render={({ field: { onChange, value }, fieldState: { error } }) => (
                                  <Input
                                    value={value ?? ''}
                                    onChange={(e) => onChange(e.target.value)}
                                    bg={'myGray.50'}
                                    h={10}
                                    py={0}
                                    lineHeight={'normal'}
                                    _placeholder={{ lineHeight: 'normal' }}
                                    placeholder={fieldLabel}
                                    isInvalid={!!error}
                                  />
                                )}
                              />
                            ) : (
                              <Controller
                                control={control}
                                name={inputKey}
                                rules={{
                                  required:
                                    item.required &&
                                    secretInputTypeToInputType(item.inputType) !==
                                      InputTypeEnum.switch
                                      ? true
                                      : false,
                                  validate:
                                    item.required &&
                                    secretInputTypeToInputType(item.inputType) ===
                                      InputTypeEnum.switch
                                      ? (value) =>
                                          value !== undefined && value !== null && value !== ''
                                      : undefined
                                }}
                                render={({ field: { onChange, value }, fieldState: { error } }) => {
                                  return (
                                    <InputRender
                                      inputType={secretInputTypeToInputType(item.inputType)}
                                      value={item.inputType === 'switch' ? value === 'true' : value}
                                      onChange={(nextValue) =>
                                        onChange(formatManualInputValue(nextValue))
                                      }
                                      placeholder={fieldLabel}
                                      bg={'myGray.50'}
                                      list={item.list}
                                      isInvalid={!!error}
                                    />
                                  );
                                }}
                              />
                            )}
                          </Box>
                        );
                      })}
                    </>
                  ) : null
              }
            ]}
            value={configType}
            onChange={changeConfigType}
          />
        </Box>
      </>
    </Box>
  );
};

const SecretInputModal = ({
  onClose,
  onSubmit,
  ...props
}: SecretInputFormProps & {
  onClose: () => void;
  onSubmit: (data: ToolParamsFormType) => void;
}) => {
  const { t } = useTranslation();
  const formId = React.useId();

  return (
    <MyModal
      isOpen
      title={t('workflow:tool_active_config')}
      onClose={onClose}
      size={'md'}
      isCentered
      footer={
        <>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button type={'submit'} form={formId} variant={'primary'}>
            {t('common:Confirm')}
          </Button>
        </>
      }
    >
      <SecretInputForm {...props} formId={formId} onSubmit={onSubmit} />
    </MyModal>
  );
};

export default SecretInputModal;
