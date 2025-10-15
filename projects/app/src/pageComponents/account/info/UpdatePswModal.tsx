import React from 'react';
import {
  ModalBody,
  Box,
  Flex,
  Input,
  ModalFooter,
  Button,
  UnorderedList,
  ListItem
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { updatePasswordByOld } from '@/web/support/user/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { checkPasswordRule } from '@fastgpt/global/common/string/password';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

type FormType = {
  oldPsw: string;
  newPsw: string;
  confirmPsw: string;
};

const UpdatePswModal = ({ onClose }: { onClose: () => void }) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  // 根据语言设置不同的标签宽度
  const labelWidth = i18n.language === 'en' ? '120px' : '70px';

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors }
  } = useForm<FormType>({
    defaultValues: {
      oldPsw: '',
      newPsw: '',
      confirmPsw: ''
    }
  });

  const { runAsync: onSubmit, loading: isLoading } = useRequest2(updatePasswordByOld, {
    onSuccess() {
      onClose();
    },
    successToast: t('account_info:password_update_success'),
    errorToast: t('account_info:password_update_error')
  });
  const onSubmitErr = (err: Record<string, any>) => {
    const val = Object.values(err)[0];
    if (!val) return;
    if (val.message) {
      toast({
        status: 'warning',
        title: val.message,
        duration: 3000,
        isClosable: true
      });
    }
  };
  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="/imgs/modal/password.svg"
      width={'500px'}
      title={t('account_info:update_password')}
    >
      <ModalBody>
        <Flex alignItems={'center'}>
          <Box flex={`0 0 ${labelWidth}`} mr={3} fontSize={'sm'} minWidth="70px">
            {t('account_info:old_password') + ':'}
          </Box>
          <Input flex={1} type={'password'} {...register('oldPsw', { required: true })}></Input>
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={`0 0 ${labelWidth}`} mr={3} fontSize={'sm'} minWidth="70px">
            {t('account_info:new_password') + ':'}
          </Box>
          <MyTooltip
            shouldWrapChildren={false}
            label={
              <UnorderedList>
                <ListItem>{t('account_info:password_min_length')}</ListItem>
                <ListItem>{t('account_info:password_requirement')}</ListItem>
              </UnorderedList>
            }
          >
            <Input
              flex={1}
              isInvalid={!!errors.newPsw}
              type={'password'}
              {...register('newPsw', {
                required: true,
                validate: (val) => {
                  if (!checkPasswordRule(val)) {
                    return t('login:password_tip');
                  }
                  return true;
                }
              })}
            ></Input>
          </MyTooltip>
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={`0 0 ${labelWidth}`} mr={3} fontSize={'sm'} minWidth="70px">
            {t('account_info:confirm_password') + ':'}
          </Box>
          <Input
            flex={1}
            type={'password'}
            {...register('confirmPsw', {
              required: true,
              validate: (val) => (getValues('newPsw') === val ? true : t('user:password.not_match'))
            })}
          ></Input>
        </Flex>
      </ModalBody>
      <ModalFooter>
        <Button mr={3} variant={'whiteBase'} onClick={onClose}>
          {t('account_info:cancel')}
        </Button>
        <Button isLoading={isLoading} onClick={handleSubmit((data) => onSubmit(data))}>
          {t('account_info:confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default UpdatePswModal;
