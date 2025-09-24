import type { ButtonProps } from '@chakra-ui/react';
import { Box, Button, Flex, ModalBody, ModalFooter, useDisclosure } from '@chakra-ui/react';
import { HeaderSecretTypeEnum } from '@fastgpt/global/common/secret/constants';
import type { SecretValueType, StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import React, { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import HeaderAuthForm, { getSecretType } from './HeaderAuthForm';

export type HeaderSecretConfigType = {
  Bearer?: SecretValueType;
  Basic?: SecretValueType;
  customs?: {
    key: string;
    value: SecretValueType;
  }[];
};

export const storeHeader2HeaderValue = (
  storeHeaderSecretConfig?: StoreSecretValueType
): HeaderSecretConfigType => {
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
};
export const headerValue2StoreHeader = (data: HeaderSecretConfigType): StoreSecretValueType => {
  const storeData: StoreSecretValueType = {};
  const currentAuthType = getSecretType(data);

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

  return storeData;
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

  const { isOpen, onOpen, onClose } = useDisclosure();

  const headerSecretValue: HeaderSecretConfigType = useMemo(() => {
    return storeHeader2HeaderValue(storeHeaderSecretConfig);
  }, [storeHeaderSecretConfig]);

  const { handleSubmit, reset, getValues } = useForm<HeaderSecretConfigType>({
    defaultValues: {
      Basic: headerSecretValue?.Basic || { secret: '', value: '' },
      Bearer: headerSecretValue?.Bearer || { secret: '', value: '' },
      customs: headerSecretValue?.customs || []
    }
  });
  const currentValue = getValues();

  const onSubmit = async (data: HeaderSecretConfigType) => {
    if (!headerSecretValue) return;

    const storeData = headerValue2StoreHeader(data);
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
            <HeaderAuthForm headerSecretValue={currentValue} onChange={(data) => reset(data)} />
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
