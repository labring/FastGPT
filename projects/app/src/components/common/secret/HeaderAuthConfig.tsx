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
  secretValue,
  editingIndex,
  index
}: {
  secretValue?: SecretValueType;
  editingIndex: number | null;
  index: number;
}) => {
  const hasSecret = !!secretValue?.secret;
  const hasValue = !!secretValue?.value;
  const isEditing = editingIndex === index;

  return !hasSecret || hasValue || isEditing;
};

const formatAuthData = ({ data }: { data: HeaderAuthConfigType }): StoreSecretValueType => {
  if (!data?.enableAuth) return {};

  const hasCustomHeaders = Array.isArray(data.customHeaders) && data.customHeaders.length > 0;
  const hasBearer = !!data.BearerValue?.secret || !!data.BearerValue?.value;
  const hasBasic = !!data.BasicValue?.secret || !!data.BasicValue?.value;

  if (hasCustomHeaders && data.customHeaders) {
    return Object.fromEntries(
      data.customHeaders
        .filter(({ key }) => key)
        .map(({ key, value }) => [
          key,
          {
            value: value?.value || '',
            secret: value?.secret || ''
          }
        ])
    );
  } else if (hasBearer) {
    return {
      Bearer: {
        value: data.BearerValue?.value || '',
        secret: data.BearerValue?.secret || ''
      }
    };
  } else if (hasBasic) {
    return {
      Basic: {
        value: data.BasicValue?.value || '',
        secret: data.BasicValue?.secret || ''
      }
    };
  }

  return {};
};

const parseAuthData = ({
  data
}: {
  data: Record<string, SecretValueType>;
}): HeaderAuthConfigType => {
  if (!data || Object.keys(data).length === 0) {
    return { enableAuth: false };
  }

  const entries = Object.entries(data);

  if (entries.length === 1) {
    const [key, value] = entries[0];

    if (key === HeaderAuthTypeEnum.Bearer || key === HeaderAuthTypeEnum.Basic) {
      return {
        enableAuth: true,
        [key === HeaderAuthTypeEnum.Bearer ? 'BearerValue' : 'BasicValue']: {
          secret: value.secret,
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
        secret: value.secret,
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
  if (config.BearerValue) {
    return HeaderAuthTypeEnum.Bearer;
  } else if (config.BasicValue) {
    return HeaderAuthTypeEnum.Basic;
  } else if (config.customHeaders) {
    return HeaderAuthTypeEnum.Custom;
  }
  return HeaderAuthTypeEnum.Bearer;
};

const HeaderAuthConfig = ({
  storeHeaderAuthConfig,
  onSave,
  size = 'md',
  variant = 'whiteBase'
}: {
  storeHeaderAuthConfig: StoreSecretValueType;
  onSave: (data: StoreSecretValueType) => void;
  size?: string;
  variant?: string;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const headerAuthConfig = useMemo(() => {
    return parseAuthData({ data: storeHeaderAuthConfig });
  }, [storeHeaderAuthConfig]);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [currentAuthType, setCurrentAuthType] = useState<HeaderAuthTypeEnum>(
    getDefaultAuthType(headerAuthConfig)
  );

  const defaultHeaderAuthConfig: HeaderAuthConfigType = {
    enableAuth: headerAuthConfig?.enableAuth || false,
    BearerValue: headerAuthConfig?.BearerValue || { secret: '', value: '' },
    BasicValue: headerAuthConfig?.BasicValue || { secret: '', value: '' },
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
      appendHeader({ key: '', value: { secret: '', value: '' } });
    }
  }, [currentAuthType, customHeaders.length, appendHeader]);

  const onSubmit = async (data: HeaderAuthConfigType) => {
    if (!headerAuthConfig) return;

    const submitData: HeaderAuthConfigType = {
      enableAuth: data.enableAuth
    };

    if (currentAuthType === HeaderAuthTypeEnum.Bearer) {
      submitData.BearerValue = {
        value: data.BearerValue?.value || '',
        secret: data.BearerValue?.secret || ''
      };
    } else if (currentAuthType === HeaderAuthTypeEnum.Basic) {
      submitData.BasicValue = {
        value: data.BasicValue?.value || '',
        secret: data.BasicValue?.secret || ''
      };
    } else if (currentAuthType === HeaderAuthTypeEnum.Custom) {
      submitData.customHeaders = data.customHeaders?.map((item) => ({
        key: item.key,
        value: { secret: item.value.secret, value: item.value.value }
      }));
    }

    const storeData = formatAuthData({ data: submitData });
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
                      secretValue:
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
                                secretValue: headerValue,
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
                      onClick={() => appendHeader({ key: '', value: { secret: '', value: '' } })}
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
