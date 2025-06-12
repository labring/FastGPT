import type { ButtonProps } from '@chakra-ui/react';
import {
  Box,
  Button,
  Flex,
  FormControl,
  IconButton,
  Input,
  ModalBody,
  ModalFooter,
  Slider,
  useDisclosure
} from '@chakra-ui/react';
import { HeaderSecretTypeEnum } from '@fastgpt/global/common/secret/constants';
import type { SecretValueType, StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import React, { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm, type UseFormRegister } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MySelect from '@fastgpt/web/components/common/MySelect';

type HeaderSecretConfigType = {
  Bearer?: SecretValueType;
  Basic?: SecretValueType;
  customs?: {
    key: string;
    value: SecretValueType;
  }[];
};

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
  fieldName,
  index = 0,
  onEdit,
  register
}: {
  showInput: boolean;
  fieldName: string;
  index?: number;
  onEdit: (index?: number) => void;
  register: UseFormRegister<HeaderSecretConfigType>;
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
            maxLength={200}
            {...register(fieldName as any, {
              required: true
            })}
            onFocus={() => onEdit(index)}
            onBlur={() => onEdit(undefined)}
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

const getSecretType = (config: HeaderSecretConfigType): HeaderSecretTypeEnum => {
  if (config.Bearer) {
    return HeaderSecretTypeEnum.Bearer;
  } else if (config.Basic) {
    return HeaderSecretTypeEnum.Basic;
  } else if (config.customs && config.customs.length > 0) {
    return HeaderSecretTypeEnum.Custom;
  }
  return HeaderSecretTypeEnum.None;
};

const HeaderAuthConfig = ({
  storeHeaderSecretConfig,
  onUpdate,
  buttonProps
}: {
  storeHeaderSecretConfig?: StoreSecretValueType;
  onUpdate: (data: StoreSecretValueType) => void;
  buttonProps?: ButtonProps;
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

  const { isOpen, onOpen, onClose } = useDisclosure();

  const headerSecretValue: HeaderSecretConfigType = useMemo(() => {
    if (!storeHeaderSecretConfig || Object.keys(storeHeaderSecretConfig).length === 0) {
      return {};
    }

    const entries = Object.entries(storeHeaderSecretConfig);
    const [key, value] = entries[0];

    if (
      entries.length === 1 &&
      (key === HeaderSecretTypeEnum.Bearer || key === HeaderSecretTypeEnum.Basic)
    ) {
      return {
        [key]: {
          secret: value.secret,
          value: value.value
        }
      };
    }

    return {
      customs: entries.map(([key, value]) => ({
        key,
        value: {
          secret: value.secret,
          value: value.value
        }
      }))
    };
  }, [storeHeaderSecretConfig]);

  const [currentAuthType, setCurrentAuthType] = useState<HeaderSecretTypeEnum>(
    getSecretType(headerSecretValue)
  );

  const [editingIndex, setEditingIndex] = useState<number>();
  const { control, register, watch, handleSubmit, reset } = useForm<HeaderSecretConfigType>({
    defaultValues: {
      Basic: headerSecretValue?.Basic || { secret: '', value: '' },
      Bearer: headerSecretValue?.Bearer || { secret: '', value: '' },
      customs: headerSecretValue?.customs || []
    }
  });
  const {
    fields: customHeaders,
    append: appendHeader,
    remove: removeHeader
  } = useFieldArray({
    control,
    name: 'customs'
  });
  const BearerValue = watch('Bearer');
  const BasicValue = watch('Basic');

  // Add default custom
  useEffect(() => {
    if (currentAuthType === HeaderSecretTypeEnum.Custom && customHeaders.length === 0) {
      appendHeader({ key: '', value: { secret: '', value: '' } });
    }
  }, [currentAuthType, customHeaders.length, appendHeader]);

  const onSubmit = async (data: HeaderSecretConfigType) => {
    if (!headerSecretValue) return;

    const storeData: StoreSecretValueType = {};

    if (currentAuthType === HeaderSecretTypeEnum.Bearer) {
      storeData.Bearer = {
        value: data.Bearer?.value || '',
        secret: data.Bearer?.secret || ''
      };
    } else if (currentAuthType === HeaderSecretTypeEnum.Basic) {
      storeData.Basic = {
        value: data.Basic?.value || '',
        secret: data.Basic?.secret || ''
      };
    } else if (currentAuthType === HeaderSecretTypeEnum.Custom) {
      data.customs?.forEach((item) => {
        storeData[item.key] = item.value;
      });
    }

    onUpdate(storeData);
    onClose();
  };

  return (
    <>
      <Button
        variant={'grayGhost'}
        borderRadius={'md'}
        {...buttonProps}
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
          <ModalBody px={9}>
            <FormControl mb={2}>
              <Box fontSize={'14px'} fontWeight={'medium'} color={'myGray.900'} mb={2}>
                {t('common:auth_type')}
              </Box>
              <MySelect
                bg={'myGray.50'}
                value={currentAuthType}
                onChange={setCurrentAuthType}
                list={headerSecretList}
              />
            </FormControl>

            {currentAuthType !== HeaderSecretTypeEnum.None && (
              <Flex mb={2} gap={2} color={'myGray.900'} fontWeight={'medium'} fontSize={'14px'}>
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
                    fieldName={`${currentAuthType}.value` as any}
                    onEdit={setEditingIndex}
                    register={register}
                  />
                ) : (
                  <Box>
                    {customHeaders.map((item, index) => {
                      const headerValue = watch(`customs.${index}.value`);

                      return (
                        <Flex key={item.id} mb={2} align="center">
                          <Input
                            w={1 / 3}
                            h={8}
                            bg="myGray.50"
                            placeholder="key"
                            maxLength={20}
                            {...register(`customs.${index}.key`, {
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
                              fieldName={`customs.${index}.value.value`}
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
          <ModalFooter px={9} display={'flex'} flexDirection={'column'}>
            <Flex justifyContent={'end'} w={'full'}>
              <Button onClick={handleSubmit(onSubmit)}>{t('common:Save')}</Button>
            </Flex>
          </ModalFooter>
          <Box
            borderTop={'sm'}
            color={'myGray.500'}
            bg={'myGray.50'}
            fontSize={'xs'}
            textAlign={'center'}
            py={2}
            borderBottomRadius={'md'}
          >
            {t('common:secret_tips')}
          </Box>
        </MyModal>
      )}
    </>
  );
};

export default React.memo(HeaderAuthConfig);
