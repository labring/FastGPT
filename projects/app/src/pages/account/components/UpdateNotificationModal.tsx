import React, { useCallback } from 'react';
import { ModalBody, Box, Flex, Input, ModalFooter, Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { updateNotificationMethod } from '@/web/support/user/api';
import Icon from '@fastgpt/web/components/common/Icon';
import { useSendCode } from '@/web/support/user/hooks/useSendCode';
import { useUserStore } from '@/web/support/user/useUserStore';

type FormType = {
  account: string;
  verifyCode: string;
};

const UpdateNotificationModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { initUserInfo } = useUserStore();
  const { register, handleSubmit, trigger, getValues } = useForm<FormType>({
    defaultValues: {
      account: '',
      verifyCode: ''
    }
  });

  const { mutate: onSubmit, isLoading } = useRequest({
    mutationFn: (data: FormType) => {
      return updateNotificationMethod(data);
    },
    onSuccess() {
      initUserInfo();
      onClose();
    },
    successToast: t('common:user.Update password successful'),
    errorToast: t('common:user.Update password failed')
  });

  const { sendCodeText, sendCode, codeCountDown } = useSendCode();

  const onclickSendCode = useCallback(async () => {
    const check = await trigger('account');
    if (!check) return;
    sendCode({
      username: getValues('account'),
      type: 'bindNotification'
    });
  }, [getValues, sendCode, trigger]);

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="common/settingLight"
      title={t('common:user.Notification Receive')}
    >
      <ModalBody>
        <Flex flexDirection="column">
          <Flex
            alignItems="center"
            mx="4"
            px="6"
            py="3"
            color="blue.600"
            bgColor="blue.50"
            fontWeight="500"
            fontSize="11px"
            borderRadius="6px"
            justifyItems="center"
          >
            <Icon name="common/info" mr="2" w="14px" />
            <Box>
              请绑定通知接收账号，以确保您能正常使用找回密码的功能，并能及时接收套餐过期提醒。
            </Box>
          </Flex>
          <Flex mt="4" alignItems="center">
            <Box flex={'0 0 70px'}>账号</Box>
            <Input
              flex={1}
              {...register('account', { required: true })}
              placeholder="电话/邮箱"
            ></Input>
          </Flex>
          <Flex mt="4" alignItems="center">
            <Box flex={'0 0 70px'}>验证码</Box>
            <Input
              flex={1}
              {...register('verifyCode', { required: true })}
              placeholder="验证码"
            ></Input>
            <Box
              position={'absolute'}
              right={10}
              zIndex={1}
              fontSize={'sm'}
              {...(codeCountDown > 0
                ? {
                    color: 'myGray.500'
                  }
                : {
                    color: 'primary.700',
                    cursor: 'pointer',
                    onClick: onclickSendCode
                  })}
            >
              {sendCodeText}
            </Box>
          </Flex>
        </Flex>
      </ModalBody>
      <ModalFooter>
        <Button mr={3} variant={'whiteBase'} onClick={onClose}>
          取消
        </Button>
        <Button isLoading={isLoading} onClick={handleSubmit((data) => onSubmit(data))}>
          确认
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default UpdateNotificationModal;
