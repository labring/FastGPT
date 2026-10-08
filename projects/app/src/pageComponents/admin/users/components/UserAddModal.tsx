import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { Box, Button, FormControl, Input, useDisclosure } from '@chakra-ui/react';
import React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { addUser } from '@/web/admin/user/api';
import { AddIcon } from '@chakra-ui/icons';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { checkPasswordRule } from '@fastgpt/global/common/string/password';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import {
  SsoPasswordUnavailableTip,
  useAdminPasswordAvailability
} from './useAdminPasswordAvailability';

type TFormData = {
  username: string;
  password: string;
  memberName?: string;
};

export default function UserAddModal(props: { data: any; updateData: any }) {
  const { t } = useClientTranslation('admin');
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { data, updateData } = props;
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors }
  } = useForm({
    defaultValues: data
  });
  // 新增时用户名还未入库，只能按当前输入值实时预判是否落在 SSO 命名空间；
  // 用 useWatch 而非 watch()，避开 react-hooks/incompatible-library 的缓存告警。
  const watchedUsername = useWatch({ control, name: 'username' });
  const passwordAvailable = useAdminPasswordAvailability([watchedUsername]);

  const { runAsync: onSubmit, loading: isLoading } = useRequest(
    (formData: TFormData) => {
      return addUser({
        ...formData,
        // 策略命中时密码框未渲染，formData.password 为 undefined；hashStr 会把 undefined
        // 变成字符串，因此必须归一成空串，交由服务端 assertUserPasswordAvailable 报错。
        password: formData.password ? hashStr(formData.password) : '',
        memberName: formData.memberName?.trim() || undefined
      });
    },
    {
      onSuccess() {
        updateData();
        onClose();
      },
      successToast: '添加成功'
    }
  );

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
    <>
      <Button
        variant="primary"
        h="36px"
        leftIcon={<AddIcon boxSize={2} />}
        onClick={() => {
          onOpen();
          reset(data);
        }}
      >
        {t('admin:add_user')}
      </Button>

      <MyModal
        isOpen={isOpen}
        onClose={onClose}
        title={t('admin:add_user')}
        maxW={['90vw', '700px']}
        footer={
          <>
            <Button variant="whiteBase" onClick={onClose}>
              {t('admin:close')}
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit(onSubmit, onSubmitErr)}
              isLoading={isLoading}
            >
              {t('admin:ok')}
            </Button>
          </>
        }
      >
        <FormControl>
          <FormLabel fontWeight="bold" required>
            {t('admin:username')}
          </FormLabel>
          <Input
            {...register('username', {
              required: 'This is required'
            })}
            id="username"
            variant="outline"
            placeholder={t('admin:user_unique_identifier')}
          />
        </FormControl>
        <FormControl mt={4}>
          <FormLabel fontWeight="bold" required={passwordAvailable}>
            {t('admin:password')}
            {passwordAvailable && errors && !!errors?.password && (
              <Box as="span" ml={2} fontSize="12px" color="red.500">
                {t('admin:required')}
              </Box>
            )}
          </FormLabel>
          {passwordAvailable ? (
            <Input
              {...register('password', {
                required: 'This is required',
                validate: (val) => {
                  if (!val) return true;
                  if (!checkPasswordRule(val)) {
                    return '密码至少 8 位，且至少包含两种组合：数字、字母或特殊字符';
                  }
                  return true;
                }
              })}
              variant="outline"
              placeholder={t('admin:password_must_be_at_least_8_characters_with_at_least_two_of')}
            />
          ) : (
            <SsoPasswordUnavailableTip />
          )}
        </FormControl>
        <FormControl mt={4}>
          <FormLabel fontWeight="bold">{t('admin:member_name')}</FormLabel>
          <Input
            {...register('memberName')}
            id="memberName"
            variant="outline"
            placeholder={t('admin:member_name_display_only_placeholder')}
          />
        </FormControl>
      </MyModal>
    </>
  );
}
