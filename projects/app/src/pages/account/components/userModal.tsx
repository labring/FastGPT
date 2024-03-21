import { useTranslation } from 'next-i18next';
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormErrorMessage,
  Input,
  ModalBody,
  ModalFooter,
  Radio,
  RadioGroup,
  Stack,
  useTheme
} from '@chakra-ui/react';
import React, { useCallback, useState } from 'react';
import MyModal from '@/components/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { postCreateUser, putUpdateUser } from '@/web/support/user/manage/api';
import { UserManageType } from '@fastgpt/global/support/user/manage/api';
import { useForm, Controller } from 'react-hook-form';

import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { useRequest } from '@/web/common/hooks/useRequest';

const UserModal = ({
  onClose,
  onSuccess,
  userData
}: {
  onClose: () => void;
  onSuccess: () => void;
  userData: UserManageType | undefined;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { isPc } = useSystemStore();
  const { toast } = useToast();
  const [requesting, setRequesting] = useState(false);
  const {
    register,
    setValue,
    getValues,
    handleSubmit,
    formState: { errors },
    control
  } = useForm<UserManageType>({
    defaultValues: userData?._id ? userData : { status: UserStatusEnum.active }
  });
  const onclickCreate = useCallback(
    async ({ username, password, inviterId, status }: UserManageType) => {
      setRequesting(true);
      try {
        await postCreateUser({
          username,
          password,
          inviterId,
          status
        });
        onClose();
        onSuccess();
        toast({
          title: '创建',
          status: 'success'
        });
      } catch (error: any) {
        toast({
          title: error.message || '创建异常',
          status: 'error'
        });
      }
      setRequesting(false);
    },
    [onSuccess, toast]
  );

  const { mutate: onclickUpdate, isLoading: updating } = useRequest({
    mutationFn: async (data: UserManageType) => {
      if (!data._id) return Promise.resolve('');
      return putUpdateUser(data);
    },
    onSuccess() {
      onSuccess();
      onClose();
    },
    successToast: t('common.Update Success'),
    errorToast: t('common.Update Failed')
  });

  return (
    <MyModal
      iconSrc="/imgs/module/ai.svg"
      title={userData?._id ? t('common.Edit') : t('common.Add')}
      isOpen
      onClose={onClose}
      isCentered={!isPc}
    >
      <ModalBody>
        <Flex flexDirection={'column'} h={'100%'}>
          <Box mt={'42px'}>
            <FormControl isInvalid={!!errors.username}>
              <Input
                bg={!!userData?._id ? 'myGray' : 'myGray.50'}
                placeholder={'邮箱/手机号/用户名'}
                disabled={!!userData?._id}
                {...register('username', {
                  pattern: {
                    value: /(^[A-Za-z0-9_\\.\-@]{4,20}$)/,
                    message: '用户名格式错误'
                  }
                })}
              ></Input>
              <FormErrorMessage>{errors.username && errors.username.message}</FormErrorMessage>
            </FormControl>
            <FormControl mt={6} isInvalid={!!errors.password}>
              <Input
                bg={'myGray.50'}
                type={'password'}
                placeholder={'密码'}
                {...register('password', {
                  maxLength: {
                    value: 20,
                    message: '密码最多 20 位'
                  },
                  minLength: {
                    value: 4,
                    message: '密码最少 4 位最多 20 位'
                  }
                })}
              ></Input>
              <FormErrorMessage>{errors.password && errors.password.message}</FormErrorMessage>
            </FormControl>
            <FormControl mt={6} isInvalid={!!errors.password2}>
              <Input
                bg={'myGray.50'}
                type={'password'}
                placeholder="确认密码"
                {...register('password2', {
                  validate: (val) => (getValues('password') === val ? true : '两次密码不一致')
                })}
              ></Input>
              <FormErrorMessage>{errors.password2 && errors.password2.message}</FormErrorMessage>
            </FormControl>
            <FormControl mt={6}>
              <Controller
                name="status"
                control={control}
                render={({ field: { onChange, value } }) => (
                  <RadioGroup onChange={onChange} value={value}>
                    <Stack direction="row">
                      {Object.keys(UserStatusEnum).map((item) => {
                        return (
                          <Radio key={item} value={item}>
                            {t('user.' + item)}
                          </Radio>
                        );
                      })}
                    </Stack>
                  </RadioGroup>
                )}
              />
            </FormControl>
          </Box>
        </Flex>
      </ModalBody>
      <ModalFooter>
        {!!userData?._id ? (
          <>
            <Box flex={1} />
            <Button variant={'whiteBase'} mr={3} onClick={onClose}>
              {t('common.Close')}
            </Button>
            <Button isLoading={updating} onClick={handleSubmit((data) => onclickUpdate(data))}>
              {t('common.Confirm Update')}
            </Button>
          </>
        ) : (
          <Button
            w={'100%'}
            isLoading={requesting}
            onClick={handleSubmit((data) => onclickCreate(data))}
          >
            {t('common.Confirm Create')}
          </Button>
        )}
      </ModalFooter>
    </MyModal>
  );
};

export default UserModal;
