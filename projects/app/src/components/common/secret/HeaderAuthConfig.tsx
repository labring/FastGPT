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
import { headerAuthTypeArray, HeaderAuthTypeEnum } from '@fastgpt/global/common/secret/constants';
import type {
  SecretValueType,
  StoreSecretValueType,
  HeaderAuthConfigType
} from '@fastgpt/global/common/secret/type';
import React, { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm, type UseFormRegister } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';

const getShowInput = ({
  authValue,
  editingIndex,
  index
}: {
  authValue?: SecretValueType;
  editingIndex: number | null;
  index: number;
}) => {
  const hasAuthId = !!authValue?.secretId;
  const hasAuthValue = !!authValue?.value;
  const isEditing = editingIndex === index;

  return !hasAuthId || hasAuthValue || isEditing;
};

const formatAuthData = ({
  data,
  prefix = ''
}: {
  data: HeaderAuthConfigType;
  prefix?: string;
}): StoreSecretValueType => {
  if (!data?.enableAuth) return {};

  // 判断认证类型
  const hasCustomHeaders = Array.isArray(data.customHeaders) && data.customHeaders.length > 0;
  const hasBearer = !!data.BearerValue?.secretId || !!data.BearerValue?.value;
  const hasBasic = !!data.BasicValue?.secretId || !!data.BasicValue?.value;

  // 根据字段值判断使用哪种认证类型
  if (hasCustomHeaders && data.customHeaders) {
    // 使用自定义头部认证
    return Object.fromEntries(
      data.customHeaders
        .filter(({ key }) => key)
        .map(({ key, value }) => [
          key,
          {
            value: value?.value || '',
            secretId: prefix + (value?.secretId || '')
          }
        ])
    );
  } else if (hasBearer) {
    // 使用Bearer认证
    return {
      Bearer: {
        value: data.BearerValue?.value || '',
        secretId: prefix + (data.BearerValue?.secretId || '')
      }
    };
  } else if (hasBasic) {
    // 使用Basic认证
    return {
      Basic: {
        value: data.BasicValue?.value || '',
        secretId: prefix + (data.BasicValue?.secretId || '')
      }
    };
  }

  return {};
};

const parseAuthData = ({
  data,
  prefix = ''
}: {
  data: Record<string, { value: string; secretId: string }>;
  prefix?: string;
}): HeaderAuthConfigType => {
  if (!data || Object.keys(data).length === 0) {
    return { enableAuth: false };
  }

  const removePrefix = (secretId: string) => {
    return secretId?.startsWith(prefix) ? secretId.substring(prefix.length) : secretId;
  };

  const entries = Object.entries(data);

  if (entries.length === 1) {
    const [key, value] = entries[0];

    if (key === HeaderAuthTypeEnum.Bearer || key === HeaderAuthTypeEnum.Basic) {
      return {
        enableAuth: true,
        [key === HeaderAuthTypeEnum.Bearer ? 'BearerValue' : 'BasicValue']: {
          secretId: removePrefix(value.secretId),
          value: value.value
        }
      };
    }
  }

  return {
    enableAuth: true,
    customHeaders: entries.map(([key, value]) => ({
      key,
      value: {
        secretId: removePrefix(value.secretId),
        value: value.value
      }
    }))
  };
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

const getDefaultAuthType = (config: HeaderAuthConfigType): HeaderAuthTypeEnum => {
  if (config.BearerValue?.secretId) {
    return HeaderAuthTypeEnum.Bearer;
  } else if (config.BasicValue?.secretId) {
    return HeaderAuthTypeEnum.Basic;
  } else if (config.customHeaders?.length) {
    return HeaderAuthTypeEnum.Custom;
  }
  return HeaderAuthTypeEnum.Bearer;
};

const HeaderAuthConfig = ({
  storeHeaderAuthConfig,
  onSave,
  size = 'md',
  variant = 'whiteBase',
  prefix = ''
}: {
  storeHeaderAuthConfig: StoreSecretValueType;
  onSave: (data: StoreSecretValueType) => void;
  size?: string;
  variant?: string;
  prefix?: string;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const headerAuthConfig = useMemo(() => {
    return parseAuthData({ data: storeHeaderAuthConfig, prefix });
  }, [prefix, storeHeaderAuthConfig]);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [currentAuthType, setCurrentAuthType] = useState<HeaderAuthTypeEnum>(
    getDefaultAuthType(headerAuthConfig)
  );

  const defaultHeaderAuthConfig: HeaderAuthConfigType = {
    enableAuth: headerAuthConfig?.enableAuth || false,
    BearerValue: headerAuthConfig?.BearerValue || { secretId: '', value: '' },
    BasicValue: headerAuthConfig?.BasicValue || { secretId: '', value: '' },
    customHeaders: headerAuthConfig?.customHeaders || []
  };

  const { control, register, watch, handleSubmit, reset } = useForm<HeaderAuthConfigType>({
    defaultValues: defaultHeaderAuthConfig
  });

  const handleOpen = () => {
    reset(defaultHeaderAuthConfig);
    setCurrentAuthType(getDefaultAuthType(headerAuthConfig));

    onOpen();
  };

  const {
    fields: customHeaders,
    append: appendHeader,
    remove: removeHeader
  } = useFieldArray({
    control,
    name: 'customHeaders'
  });

  const enableAuth = watch('enableAuth');
  const BearerValue = watch('BearerValue');
  const BasicValue = watch('BasicValue');

  useEffect(() => {
    if (currentAuthType === HeaderAuthTypeEnum.Custom && customHeaders.length === 0) {
      appendHeader({ key: '', value: { secretId: '', value: '' } });
    }
  }, [currentAuthType, customHeaders.length, appendHeader]);

  const onSubmit = async (data: HeaderAuthConfigType) => {
    if (!headerAuthConfig) return;

    const submitData: HeaderAuthConfigType = {
      enableAuth: data.enableAuth
    };

    if (currentAuthType === HeaderAuthTypeEnum.Bearer) {
      submitData.BearerValue = {
        secretId: 'Bearer',
        value: data.BearerValue?.value || ''
      };
    } else if (currentAuthType === HeaderAuthTypeEnum.Basic) {
      submitData.BasicValue = {
        secretId: 'Basic',
        value: data.BasicValue?.value || ''
      };
    } else if (currentAuthType === HeaderAuthTypeEnum.Custom) {
      submitData.customHeaders = data.customHeaders?.map((item) => ({
        key: item.key,
        value: { secretId: item.key, value: item.value?.value }
      }));
    }

    const storeData = formatAuthData({ data: submitData, prefix });
    onSave(storeData);
    onClose();
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        leftIcon={<MyIcon name={'common/setting'} w={4} />}
        onClick={handleOpen}
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
                  <LeftRadio
                    list={headerAuthTypeArray}
                    value={currentAuthType}
                    onChange={setCurrentAuthType}
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
                </FormControl>

                {currentAuthType === HeaderAuthTypeEnum.Bearer ||
                currentAuthType === HeaderAuthTypeEnum.Basic ? (
                  <AuthValueDisplay
                    key={currentAuthType}
                    showInput={getShowInput({
                      authValue:
                        currentAuthType === HeaderAuthTypeEnum.Bearer ? BearerValue : BasicValue,
                      editingIndex,
                      index: 0
                    })}
                    fieldName={`${currentAuthType}Value.value` as any}
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
