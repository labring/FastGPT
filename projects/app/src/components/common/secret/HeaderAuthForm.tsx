import type { SecretValueType } from '@fastgpt/global/common/secret/type';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, IconButton, Input } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { HeaderSecretConfigType } from './HeaderAuthConfig';
import { HeaderSecretTypeEnum } from '@fastgpt/global/common/secret/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';

const getShowInput = ({
  secretValue,
  editingIndex,
  index
}: {
  secretValue?: SecretValueType;
  editingIndex?: number;
  index: number;
}) => {
  const hasSecret = !!secretValue?.secret;
  const hasValue = !!secretValue?.value;
  const isEditing = editingIndex === index;

  return !hasSecret || hasValue || isEditing;
};

const AuthValueDisplay = ({
  showInput,
  index = 0,
  onEdit,
  value,
  onChange,
  bg
}: {
  showInput: boolean;
  index?: number;
  onEdit: (index?: number) => void;
  value: string;
  onChange: (value: string) => void;
  bg: string;
}) => {
  const { t } = useTranslation();

  return (
    <Flex>
      {showInput ? (
        <Input
          placeholder={'Value'}
          bg={bg}
          h={8}
          maxLength={200}
          onFocus={() => onEdit(index)}
          onBlur={() => onEdit(undefined)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Flex
          flex={1}
          borderRadius={'6px'}
          border={'0.5px solid'}
          borderColor={'primary.200'}
          bg={'primary.50'}
          h={8}
          px={3}
          alignItems={'center'}
          gap={1}
        >
          <MyIcon name="checkCircle" w={'16px'} color={'primary.600'} />
          <Box fontSize={'sm'} fontWeight={'medium'} color={'primary.600'}>
            {t('common:had_auth_value')}
          </Box>
        </Flex>
      )}
      {!showInput && (
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
  if (config.Bearer && (config.Bearer.secret || config.Bearer.value)) {
    return HeaderSecretTypeEnum.Bearer;
  } else if (config.Basic && (config.Basic.secret || config.Basic.value)) {
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
  bg = 'myGray.50'
}: {
  headerSecretValue: HeaderSecretConfigType;
  onChange: (secret: HeaderSecretConfigType) => void;
  fontWeight?: string;
  bg?: string;
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

  return (
    <>
      <Box fontSize={'14px'} fontWeight={fontWeight} color={'myGray.900'} mb={2}>
        {t('common:auth_type')}
      </Box>
      <MySelect
        bg={bg}
        value={currentAuthType}
        onChange={(val) => {
          if (val === HeaderSecretTypeEnum.None) {
            onChange({});
          } else if (val === HeaderSecretTypeEnum.Custom) {
            onChange({
              customs: headerSecretValue.customs || [{ key: '', value: { secret: '', value: '' } }]
            });
          } else {
            onChange({
              [val]: headerSecretValue[val] || { secret: '', value: '' }
            });
          }
        }}
        list={headerSecretList}
      />
      {currentAuthType !== HeaderSecretTypeEnum.None && (
        <Flex my={2} gap={2} color={'myGray.900'} fontWeight={fontWeight} fontSize={'14px'}>
          {currentAuthType === HeaderSecretTypeEnum.Custom && (
            <Box w={1 / 3}>{t('common:key')}</Box>
          )}
          <Box w={2 / 3}>{t('common:value')}</Box>
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
                  ? BearerValue?.value || ''
                  : BasicValue?.value || ''
              }
              onChange={(value) => {
                if (currentAuthType === HeaderSecretTypeEnum.Bearer) {
                  onChange({
                    Bearer: { secret: BearerValue?.secret || '', value }
                  });
                } else if (currentAuthType === HeaderSecretTypeEnum.Basic) {
                  onChange({
                    Basic: { secret: BasicValue?.secret || '', value }
                  });
                }
              }}
              bg={bg}
            />
          ) : (
            <Box>
              {customHeaders?.map((item, index) => {
                return (
                  <Flex key={index} mb={2} align="center">
                    <Input
                      w={1 / 3}
                      h={8}
                      bg={bg}
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
                    <Box w={2 / 3} ml={2}>
                      <AuthValueDisplay
                        showInput={getShowInput({
                          secretValue: item.value,
                          editingIndex,
                          index
                        })}
                        value={item.value.value}
                        onChange={(value) => {
                          onChange({
                            customs: headerSecretValue.customs?.map((header, i) =>
                              i === index ? { ...header, value: { secret: '', value } } : header
                            )
                          });
                        }}
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
                      { key: '', value: { secret: '', value: '' } }
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
