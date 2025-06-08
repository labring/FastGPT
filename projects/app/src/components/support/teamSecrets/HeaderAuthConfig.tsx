import {
  Box,
  Button,
  Flex,
  FormControl,
  IconButton,
  Input,
  ModalBody,
  ModalFooter,
  Switch,
  useDisclosure
} from '@chakra-ui/react';
import { HeaderAuthTypeEnum } from '@fastgpt/global/common/teamSecret/constants';
import type {
  HeaderAuthValueType,
  HeaderAuthConfigType
} from '@fastgpt/global/common/teamSecret/type';
import React, { useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm, type UseFormRegister } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import { i18nT } from '@fastgpt/web/i18n/utils';

const authTypeArray = [
  {
    title: i18nT('common:auth_type.Bearer'),
    value: HeaderAuthTypeEnum.Bearer
  },
  {
    title: i18nT('common:auth_type.Basic'),
    value: HeaderAuthTypeEnum.Basic
  },
  {
    title: i18nT('common:auth_type.Custom'),
    value: HeaderAuthTypeEnum.Custom
  }
];

export const formatAuthData = ({
  data,
  appId,
  nodeId
}: {
  data: HeaderAuthConfigType;
  appId?: string;
  nodeId?: string;
}) => {
  if (!data?.enableAuth) return {};

  const prefix = appId && nodeId ? `${appId}-${nodeId}-` : '';

  const processEntries = (entries: Array<{ key: string; value: any }>) =>
    entries.reduce(
      (result, { key, value }) =>
        key
          ? {
              ...result,
              [key]: {
                value: value?.value || '',
                secretId: prefix + (value?.secretId || '')
              }
            }
          : result,
      {}
    );

  const authEntries =
    data.authType === HeaderAuthTypeEnum.Custom && Array.isArray(data.customHeaders)
      ? data.customHeaders
      : data.authType &&
          (data.authType === HeaderAuthTypeEnum.Bearer ? data.BearerValue : data.BasicValue)
        ? [
            {
              key: data.authType,
              value:
                data.authType === HeaderAuthTypeEnum.Bearer ? data.BearerValue : data.BasicValue
            }
          ]
        : [];

  return processEntries(authEntries);
};
export const parseAuthData = ({
  data,
  appId,
  nodeId
}: {
  data: Record<string, { value: string; secretId: string }>;
  appId?: string;
  nodeId?: string;
}): HeaderAuthConfigType => {
  if (!data || Object.keys(data).length === 0) {
    return { enableAuth: false, authType: HeaderAuthTypeEnum.Bearer };
  }

  const prefix = appId && nodeId ? `${appId}-${nodeId}-` : '';

  const removePrefix = (secretId: string) => {
    return secretId?.startsWith(prefix) ? secretId.substring(prefix.length) : secretId;
  };

  const entries = Object.entries(data);

  if (entries.length === 1) {
    const [key, value] = entries[0];

    if (key === HeaderAuthTypeEnum.Bearer) {
      return {
        enableAuth: true,
        authType: HeaderAuthTypeEnum.Bearer,
        BearerValue: {
          secretId: removePrefix(value.secretId),
          value: value.value
        }
      };
    }

    if (key === HeaderAuthTypeEnum.Basic) {
      return {
        enableAuth: true,
        authType: HeaderAuthTypeEnum.Basic,
        BasicValue: {
          secretId: removePrefix(value.secretId),
          value: value.value
        }
      };
    }
  }

  return {
    enableAuth: true,
    authType: HeaderAuthTypeEnum.Custom,
    customHeaders: entries.map(([key, value]) => ({
      key,
      value: {
        secretId: removePrefix(value.secretId),
        value: value.value
      }
    }))
  };
};

const getShowInput = ({
  authValue,
  editingIndex,
  index
}: {
  authValue?: HeaderAuthValueType;
  editingIndex: number | null;
  index: number;
}) => {
  const hasAuthId = !!authValue?.secretId;
  const hasAuthValue = !!authValue?.value;
  const isEditing = editingIndex === index;

  return !hasAuthId || hasAuthValue || isEditing;
};

const AuthValueDisplay = ({
  showInput,
  fieldName,
  index = 0,
  onEdit,
  register
}: {
  showInput: boolean;
  fieldName: `customHeaders.${number}.value.value` | 'BearerValue.value' | 'BasicValue.value';
  index?: number;
  onEdit: (index: number | null) => void;
  register: UseFormRegister<HeaderAuthConfigType>;
}) => {
  const { t } = useTranslation();

  return (
    <Flex>
      {showInput ? (
        <FormControl flex={1}>
          <Input
            placeholder={'Value'}
            bg={'myGray.50'}
            h={8}
            {...register(fieldName, {
              required: true
            })}
            onFocus={() => onEdit(index)}
            onBlur={() => onEdit(null)}
          />
        </FormControl>
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

const HeaderAuthConfig = ({
  headerAuthConfig,
  onSave
}: {
  headerAuthConfig: HeaderAuthConfigType;
  onSave: (data: HeaderAuthConfigType) => void;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  console.log(headerAuthConfig);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const { control, register, watch, handleSubmit, reset } = useForm<HeaderAuthConfigType>({
    defaultValues: {
      enableAuth: headerAuthConfig?.enableAuth || false,
      authType: headerAuthConfig?.authType || HeaderAuthTypeEnum.Bearer,
      BearerValue: headerAuthConfig?.BearerValue,
      BasicValue: headerAuthConfig?.BasicValue,
      customHeaders: headerAuthConfig?.customHeaders
    }
  });

  const {
    fields: customHeaders,
    append: appendHeader,
    remove: removeHeader
  } = useFieldArray({
    control,
    name: 'customHeaders'
  });

  const enableAuth = watch('enableAuth');
  const authType = watch('authType');
  const BearerValue = watch('BearerValue');
  const BasicValue = watch('BasicValue');

  useEffect(() => {
    if (authType === HeaderAuthTypeEnum.Custom && customHeaders.length === 0) {
      appendHeader({ key: '', value: { secretId: '', value: '' } });
    }
  }, [authType, customHeaders.length, appendHeader]);

  const onSubmit = async (data: HeaderAuthConfigType) => {
    if (!headerAuthConfig) return;
    const baseData = {
      enableAuth: data.enableAuth,
      authType: data.authType
    };

    const submitData = (() => {
      if (data.authType === HeaderAuthTypeEnum.Bearer) {
        return {
          ...baseData,
          BearerValue: { secretId: HeaderAuthTypeEnum.Bearer, value: data.BearerValue?.value || '' }
        };
      }

      if (data.authType === HeaderAuthTypeEnum.Basic) {
        return {
          ...baseData,
          BasicValue: { secretId: HeaderAuthTypeEnum.Basic, value: data.BasicValue?.value || '' }
        };
      }

      if (data.authType === HeaderAuthTypeEnum.Custom) {
        return {
          ...baseData,
          customHeaders: data.customHeaders?.map((item) => ({
            key: item.key,
            value: { secretId: item.key, value: item.value?.value }
          }))
        };
      }

      return null;
    })();

    console.log(submitData, 'submitData');

    if (submitData) {
      onSave(submitData);
    }

    onClose();
  };

  return (
    <>
      <Button
        variant={'whiteBase'}
        leftIcon={<MyIcon name={'common/setting'} w={4} />}
        onClick={onOpen}
      >
        {t('common:auth_config')}
      </Button>

      {isOpen && (
        <MyModal
          isOpen={isOpen}
          onClose={onClose}
          iconSrc={'common/setting'}
          iconColor={'primary.600'}
          title={t('common:auth_config')}
          w={480}
        >
          <ModalBody px={9} pt={6}>
            <FormControl
              display={'flex'}
              alignItems={'center'}
              gap={6}
              color={'myGray.900'}
              fontWeight={'medium'}
              fontSize={'14px'}
              mb={6}
            >
              {t('common:enable_auth')}
              <Switch size={'sm'} {...register('enableAuth')} />
            </FormControl>

            {enableAuth && (
              <>
                <FormControl mb={2}>
                  <Box fontSize={'14px'} fontWeight={'medium'} color={'myGray.900'} mb={2}>
                    {t('common:auth_type')}
                  </Box>
                  <Controller
                    name="authType"
                    control={control}
                    render={({ field: { onChange, value } }) => (
                      <LeftRadio
                        list={authTypeArray}
                        value={value}
                        onChange={onChange}
                        py={'4.5px'}
                        fontWeight={'medium'}
                        templateColumns={'repeat(3, 1fr)'}
                        gridGap={2}
                        defaultBg={'white'}
                        activeBg={'white'}
                        activeBorderColor={'myGray.200'}
                        hoverBorderColor={'myGray.200'}
                        activeShadow={'none'}
                        dotGap={2}
                      />
                    )}
                  />
                </FormControl>

                {authType === HeaderAuthTypeEnum.Bearer ? (
                  <AuthValueDisplay
                    key={'BearerValue'}
                    showInput={getShowInput({
                      authValue: BearerValue,
                      editingIndex,
                      index: 0
                    })}
                    fieldName="BearerValue.value"
                    onEdit={setEditingIndex}
                    register={register}
                  />
                ) : authType === HeaderAuthTypeEnum.Basic ? (
                  <AuthValueDisplay
                    key={'BasicValue'}
                    showInput={getShowInput({
                      authValue: BasicValue,
                      editingIndex,
                      index: 0
                    })}
                    fieldName="BasicValue.value"
                    onEdit={setEditingIndex}
                    register={register}
                  />
                ) : (
                  <Box>
                    <Flex
                      mb={2}
                      gap={2}
                      color={'myGray.500'}
                      fontWeight={'medium'}
                      fontSize={'14px'}
                    >
                      <Box w={1 / 3}>key</Box>
                      <Box w={2 / 3}>value</Box>
                    </Flex>

                    {customHeaders.map((item, index) => {
                      const headerValue = watch(`customHeaders.${index}.value`);

                      return (
                        <Flex key={item.id} mb={2} align="center">
                          <Input
                            w={1 / 3}
                            h={8}
                            bg="myGray.50"
                            placeholder="key"
                            {...register(`customHeaders.${index}.key`, {
                              required: true
                            })}
                          />
                          <Box w={2 / 3} ml={2}>
                            <AuthValueDisplay
                              showInput={getShowInput({
                                authValue: headerValue,
                                editingIndex,
                                index
                              })}
                              fieldName={`customHeaders.${index}.value.value`}
                              index={index}
                              onEdit={setEditingIndex}
                              register={register}
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
                              onClick={() => removeHeader(index)}
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
                      onClick={() => appendHeader({ key: '', value: { secretId: '', value: '' } })}
                    >
                      {t('common:add_new')}
                    </Button>
                  </Box>
                )}
              </>
            )}
          </ModalBody>
          <ModalFooter px={9} pb={6}>
            <Button onClick={handleSubmit(onSubmit)}>{t('common:Save')}</Button>
          </ModalFooter>
        </MyModal>
      )}
    </>
  );
};

export default React.memo(HeaderAuthConfig);
