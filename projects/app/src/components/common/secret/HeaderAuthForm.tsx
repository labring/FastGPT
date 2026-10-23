import type { ReferenceItemValueType } from '@fastgpt/global/core/workflow/type/io';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, HStack, IconButton, Input, type ButtonProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  getSecretCipherValue,
  getSecretPlainValue,
  getSecretReferenceValue
} from '@fastgpt/global/common/secret/utils';
import type { HeaderSecretConfigType, HeaderSecretValueType } from './HeaderAuthConfig';
import { HeaderSecretTypeEnum } from '@fastgpt/global/common/secret/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
import NodeInputSelect from '@fastgpt/web/components/core/workflow/NodeInputSelect';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

export const getSingleReference = (
  value?: HeaderSecretValueType
): ReferenceItemValueType | undefined => {
  const reference = getSecretReferenceValue(value);
  return Array.isArray(reference) &&
    typeof reference[0] === 'string' &&
    typeof reference[1] === 'string'
    ? (reference as ReferenceItemValueType)
    : undefined;
};

const toSecretReference = (value?: ReferenceItemValueType): [string, string] | undefined =>
  value && typeof value[0] === 'string' && typeof value[1] === 'string'
    ? [value[0], value[1]]
    : undefined;

export const formatReferenceValue = (value?: HeaderSecretValueType) => {
  const reference = getSecretReferenceValue(value);
  if (!reference) return '';
  return Array.isArray(reference[0])
    ? (reference as [string, string?][]).map((item) => item.join(' / ')).join(', ')
    : (reference as [string, string?]).join(' / ');
};

export const getShowInput = ({
  secretValue,
  editingIndex,
  index
}: {
  secretValue?: HeaderSecretValueType;
  editingIndex?: number;
  index: number;
}) => {
  const hasSecret = !!getSecretCipherValue(secretValue);
  const hasValue = !!getSecretPlainValue(secretValue);
  const isEditing = editingIndex === index;

  return (!hasSecret && !hasValue) || isEditing;
};

export type SecretReferenceRenderer = (params: {
  value?: ReferenceItemValueType;
  onChange: (value?: ReferenceItemValueType) => void;
  buttonProps?: ButtonProps;
}) => React.ReactNode;

type ValueMode = 'manual' | 'reference';

export const shouldRenderReferenceSelector = ({
  mode,
  secretValue
}: {
  mode: ValueMode;
  secretValue?: HeaderSecretValueType;
}) => {
  const reference = getSecretReferenceValue(secretValue);
  return mode === 'reference' && !Array.isArray(reference?.[0]);
};

const HeaderModeSelect = ({
  mode,
  onChange
}: {
  mode: ValueMode;
  onChange: (mode: ValueMode) => void;
}) => (
  <Box ml={2} className="nodrag">
    <NodeInputSelect
      renderTypeList={[FlowNodeInputTypeEnum.password, FlowNodeInputTypeEnum.reference]}
      selectedType={
        mode === 'reference' ? FlowNodeInputTypeEnum.reference : FlowNodeInputTypeEnum.password
      }
      onChange={(nextMode) =>
        onChange(nextMode === FlowNodeInputTypeEnum.reference ? 'reference' : 'manual')
      }
    />
  </Box>
);

const CustomHeaderModeSelect = ({
  mode,
  onChange
}: {
  mode: ValueMode;
  onChange: (mode: ValueMode) => void;
}) => {
  const { t } = useTranslation();
  const isReference = mode === 'reference';

  return (
    <Box className="nodrag" flexShrink={0}>
      <MyTooltip
        label={
          isReference
            ? t('workflow:click_to_change_reference')
            : t('workflow:click_to_change_value')
        }
      >
        <HStack
          w={'4rem'}
          h={10}
          border={'1px solid'}
          borderRight={'none'}
          borderColor={'myGray.200'}
          borderLeftRadius={'sm'}
          justifyContent={'center'}
          bg={'white'}
          px={2}
          spacing={2}
          cursor={'pointer'}
          _hover={{
            bg: 'myGray.50'
          }}
          onClick={() => onChange(isReference ? 'manual' : 'reference')}
        >
          <MyIcon
            name={
              isReference ? 'core/workflow/inputType/reference' : 'core/workflow/inputType/password'
            }
            w={4}
            color={'primary.600'}
          />
          <MyIcon name={'common/lineChange'} w={'14px'} color={'myGray.500'} />
        </HStack>
      </MyTooltip>
    </Box>
  );
};

const AuthValueDisplay = ({
  showInput,
  index = 0,
  onEdit,
  value = '',
  onChange,
  onReferenceChange,
  bg,
  secretValue,
  mode = 'manual',
  renderReference,
  modeSelect
}: {
  showInput: boolean;
  index?: number;
  onEdit: (index?: number) => void;
  value?: string;
  onChange: (value: string) => void;
  onReferenceChange?: (value?: ReferenceItemValueType) => void;
  bg: string;
  secretValue?: HeaderSecretValueType;
  mode?: ValueMode;
  renderReference?: SecretReferenceRenderer;
  modeSelect?: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const singleReference = getSingleReference(secretValue);
  const hasModeSelect = !!modeSelect;

  const showEditButton = mode === 'manual' && !showInput;

  return (
    <Flex w={'full'} minW={0} alignItems={'center'}>
      <Flex flex={1} minW={0} alignItems={'center'}>
        {modeSelect}
        <Box flex={1} minW={0} mr={showEditButton ? 1 : 0}>
          {renderReference && shouldRenderReferenceSelector({ mode, secretValue }) ? (
            renderReference({
              value: singleReference,
              onChange: onReferenceChange || (() => undefined),
              buttonProps: hasModeSelect
                ? {
                    borderRadius: 'sm',
                    borderLeftRadius: 'none',
                    borderColor: 'myGray.200',
                    w: '100%'
                  }
                : undefined
            })
          ) : mode === 'reference' ? (
            <Box
              flex={1}
              borderRadius={'6px'}
              borderLeftRadius={hasModeSelect ? 'none' : undefined}
              border={'0.5px solid'}
              borderColor={'primary.200'}
              bg={'primary.50'}
              h={10}
              px={3}
              alignItems={'center'}
              display={'flex'}
              minW={0}
              overflow={'hidden'}
              textOverflow={'ellipsis'}
              whiteSpace={'nowrap'}
            >
              {formatReferenceValue(secretValue) || 'Reference'}
            </Box>
          ) : showInput ? (
            <Input
              placeholder={'Value'}
              bg={bg}
              h={10}
              maxLength={50000}
              minW={0}
              overflow={'hidden'}
              textOverflow={'ellipsis'}
              borderLeftRadius={hasModeSelect ? 'none' : undefined}
              onFocus={() => onEdit(index)}
              onBlur={() => onEdit(undefined)}
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
          ) : (
            <Flex
              flex={1}
              borderRadius={'6px'}
              borderLeftRadius={hasModeSelect ? 'none' : undefined}
              border={'0.5px solid'}
              borderColor={'primary.200'}
              bg={'primary.50'}
              h={10}
              px={3}
              alignItems={'center'}
              gap={1}
              minW={0}
              overflow={'hidden'}
            >
              <MyIcon name="checkCircle" w={'16px'} color={'primary.600'} />
              <Box fontSize={'sm'} fontWeight={'medium'} color={'primary.600'}>
                {t('common:had_auth_value')}
              </Box>
            </Flex>
          )}
        </Box>
      </Flex>
      {showEditButton && (
        <IconButton
          aria-label="Edit header"
          icon={<MyIcon name="edit" w={'16px'} />}
          size="sm"
          variant="ghost"
          color={'myGray.500'}
          _hover={{ color: 'primary.600' }}
          onClick={() => onEdit(index)}
        />
      )}
    </Flex>
  );
};

export const getSecretType = (config: HeaderSecretConfigType): HeaderSecretTypeEnum => {
  if (config.Bearer) {
    return HeaderSecretTypeEnum.Bearer;
  } else if (config.Basic) {
    return HeaderSecretTypeEnum.Basic;
  } else if (config.customs && config.customs.length > 0) {
    return HeaderSecretTypeEnum.Custom;
  }
  return HeaderSecretTypeEnum.None;
};

const HeaderAuthForm = ({
  headerSecretValue,
  onChange,
  fontWeight = 'medium',
  bg = 'myGray.50',
  renderReference
}: {
  headerSecretValue: HeaderSecretConfigType;
  onChange: (secret: HeaderSecretConfigType) => void;
  fontWeight?: string;
  bg?: string;
  renderReference?: SecretReferenceRenderer;
}) => {
  const { t } = useTranslation();
  const headerSecretList = [
    {
      label: t('common:auth_type.None'),
      value: HeaderSecretTypeEnum.None
    },
    {
      label: 'Bearer',
      value: HeaderSecretTypeEnum.Bearer
    },
    {
      label: 'Basic',
      value: HeaderSecretTypeEnum.Basic
    },
    {
      label: t('common:auth_type.Custom'),
      value: HeaderSecretTypeEnum.Custom
    }
  ];
  const currentAuthType = useMemo(() => {
    return getSecretType(headerSecretValue);
  }, [headerSecretValue]);
  const [editingIndex, setEditingIndex] = useState<number>();

  const BearerValue = headerSecretValue.Bearer;
  const BasicValue = headerSecretValue.Basic;
  const customHeaders = headerSecretValue.customs;
  const [valueModes, setValueModes] = useState<Record<string, ValueMode>>({});

  const getValueMode = (key: string, value?: HeaderSecretValueType): ValueMode =>
    valueModes[key] || (getSecretReferenceValue(value) ? 'reference' : 'manual');

  const changeValueMode = (key: string, mode: ValueMode) => {
    setValueModes((prev) => ({ ...prev, [key]: mode }));
  };

  const getManualValue = (value?: HeaderSecretValueType) => {
    return getSecretPlainValue(value) ?? '';
  };

  const simpleAuthValue =
    currentAuthType === HeaderSecretTypeEnum.Bearer ? BearerValue : BasicValue;
  const simpleAuthMode = getValueMode(currentAuthType, simpleAuthValue);
  const changeSimpleAuthMode = (mode: ValueMode) => {
    changeValueMode(currentAuthType, mode);
    if (currentAuthType === HeaderSecretTypeEnum.Bearer) {
      onChange({ Bearer: { value: '' } });
    } else if (currentAuthType === HeaderSecretTypeEnum.Basic) {
      onChange({ Basic: { value: '' } });
    }
  };

  return (
    <>
      <Box fontSize={'14px'} fontWeight={fontWeight} color={'myGray.900'} mb={2}>
        {t('common:auth_type')}
      </Box>
      <MySelect
        h={10}
        bg={bg}
        value={currentAuthType}
        onChange={(val) => {
          if (val === HeaderSecretTypeEnum.None) {
            onChange({});
          } else if (val === HeaderSecretTypeEnum.Custom) {
            onChange({
              customs: headerSecretValue.customs || [{ key: '', value: { value: '' } }]
            });
          } else {
            onChange({
              [val]: headerSecretValue[val] || { value: '' }
            });
          }
        }}
        list={headerSecretList}
      />
      {currentAuthType !== HeaderSecretTypeEnum.None && (
        <Flex
          alignItems={'center'}
          my={2}
          gap={2}
          color={'myGray.900'}
          fontWeight={fontWeight}
          fontSize={'14px'}
        >
          {currentAuthType === HeaderSecretTypeEnum.Custom && (
            <Box lineHeight={1} w={0.3}>
              {t('common:key')}
            </Box>
          )}
          <Box lineHeight={1}>{t('common:value')}</Box>
          {(currentAuthType === HeaderSecretTypeEnum.Bearer ||
            currentAuthType === HeaderSecretTypeEnum.Basic) &&
            renderReference && (
              <HeaderModeSelect mode={simpleAuthMode} onChange={changeSimpleAuthMode} />
            )}
        </Flex>
      )}
      {currentAuthType !== HeaderSecretTypeEnum.None && (
        <>
          {currentAuthType === HeaderSecretTypeEnum.Bearer ||
          currentAuthType === HeaderSecretTypeEnum.Basic ? (
            <AuthValueDisplay
              key={currentAuthType}
              showInput={getShowInput({
                secretValue:
                  currentAuthType === HeaderSecretTypeEnum.Bearer ? BearerValue : BasicValue,
                editingIndex,
                index: 0
              })}
              onEdit={setEditingIndex}
              value={
                currentAuthType === HeaderSecretTypeEnum.Bearer
                  ? getManualValue(BearerValue)
                  : getManualValue(BasicValue)
              }
              onChange={(value) => {
                if (currentAuthType === HeaderSecretTypeEnum.Bearer) {
                  onChange({
                    Bearer: { value }
                  });
                } else if (currentAuthType === HeaderSecretTypeEnum.Basic) {
                  onChange({
                    Basic: { value }
                  });
                }
              }}
              onReferenceChange={(value) => {
                if (currentAuthType === HeaderSecretTypeEnum.Bearer) {
                  const ref = toSecretReference(value);
                  onChange({ Bearer: ref ? { ref } : undefined });
                } else {
                  const ref = toSecretReference(value);
                  onChange({ Basic: ref ? { ref } : undefined });
                }
              }}
              secretValue={
                currentAuthType === HeaderSecretTypeEnum.Bearer ? BearerValue : BasicValue
              }
              mode={getValueMode(
                currentAuthType,
                currentAuthType === HeaderSecretTypeEnum.Bearer ? BearerValue : BasicValue
              )}
              renderReference={renderReference}
              bg={bg}
            />
          ) : (
            <Box>
              {customHeaders?.map((item, index) => {
                return (
                  <Flex key={index} mb={2} align="center" gap={2}>
                    <Flex flex={'3 1 0'} minW={0} alignItems={'center'}>
                      <Input
                        flex={1}
                        minW={0}
                        w={'full'}
                        h={10}
                        bg={bg}
                        overflow={'hidden'}
                        textOverflow={'ellipsis'}
                        placeholder="key"
                        maxLength={64}
                        value={item.key}
                        onChange={(e) => {
                          onChange({
                            customs: headerSecretValue.customs?.map((header, i) =>
                              i === index ? { ...header, key: e.target.value } : header
                            )
                          });
                        }}
                      />
                    </Flex>
                    <Flex flex={'7 1 0'} minW={0} alignItems={'center'}>
                      <Box flex={1} minW={0}>
                        <AuthValueDisplay
                          showInput={getShowInput({
                            secretValue: item.value,
                            editingIndex,
                            index
                          })}
                          value={getManualValue(item.value)}
                          onChange={(value) => {
                            onChange({
                              customs: headerSecretValue.customs?.map((header, i) =>
                                i === index ? { ...header, value: { value } } : header
                              )
                            });
                          }}
                          onReferenceChange={(value) => {
                            const ref = toSecretReference(value);
                            onChange({
                              customs: headerSecretValue.customs?.map((header, i) =>
                                i === index
                                  ? {
                                      ...header,
                                      value: ref ? { ref } : { value: '' }
                                    }
                                  : header
                              )
                            });
                          }}
                          secretValue={item.value}
                          mode={getValueMode(`custom-${index}`, item.value)}
                          renderReference={renderReference}
                          modeSelect={
                            renderReference ? (
                              <CustomHeaderModeSelect
                                mode={getValueMode(`custom-${index}`, item.value)}
                                onChange={(mode) => {
                                  changeValueMode(`custom-${index}`, mode);
                                  onChange({
                                    customs: headerSecretValue.customs?.map((header, i) =>
                                      i === index ? { ...header, value: { value: '' } } : header
                                    )
                                  });
                                }}
                              />
                            ) : undefined
                          }
                          index={index}
                          onEdit={setEditingIndex}
                          bg={bg}
                        />
                      </Box>
                      {customHeaders.length > 1 && (
                        <IconButton
                          aria-label="Remove header"
                          icon={<MyIcon name="delete" w="16px" />}
                          size="sm"
                          variant="ghost"
                          color={'myGray.500'}
                          flexShrink={0}
                          _hover={{ color: 'red.500' }}
                          isDisabled={customHeaders.length <= 1}
                          onClick={() => {
                            onChange({
                              customs: headerSecretValue.customs?.filter((_, i) => i !== index)
                            });
                          }}
                        />
                      )}
                    </Flex>
                  </Flex>
                );
              })}

              <Button
                leftIcon={<MyIcon name="common/addLight" w="16px" />}
                variant="whiteBase"
                minH={8}
                h={8}
                onClick={() => {
                  onChange({
                    customs: [
                      ...(headerSecretValue.customs || []),
                      { key: '', value: { value: '' } }
                    ]
                  });
                }}
              >
                {t('common:add_new')}
              </Button>
            </Box>
          )}
        </>
      )}
    </>
  );
};

export default React.memo(HeaderAuthForm);
