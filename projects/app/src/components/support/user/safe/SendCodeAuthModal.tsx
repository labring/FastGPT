import { getCaptchaPic, type UserVerificationPurpose } from '@/web/support/user/api';
import { Button, FormControl, Input, ModalBody, ModalFooter, Skeleton } from '@chakra-ui/react';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useMemoizedFn } from 'ahooks';
import { useEffect } from 'react';
import { VerificationTtlSeconds } from '@fastgpt/global/support/user/account/verification/type';

const SendCodeAuthModal = ({
  username,
  purpose,
  onClose,
  onSending,
  onSendCode
}: {
  username: string;
  purpose: UserVerificationPurpose;
  onClose: () => void;

  onSending: boolean;
  onSendCode: (e: { username: string; captcha: string }) => Promise<void>;
}) => {
  const { t } = useTranslation();

  const { register, handleSubmit } = useForm({
    defaultValues: {
      code: ''
    }
  });

  const {
    data,
    loading,
    run: getCaptcha
  } = useRequest(() => getCaptchaPic(username, purpose), { manual: false });

  const refreshCaptcha = useMemoizedFn(() => {
    getCaptcha();
  });

  useEffect(() => {
    if (!data?.captchaImage) return;

    const timer = window.setInterval(refreshCaptcha, VerificationTtlSeconds.medium * 1000);

    return () => window.clearInterval(timer);
  }, [data?.captchaImage, refreshCaptcha]);

  const onSubmit = async ({ code }: { code: string }) => {
    try {
      await onSendCode({ username, captcha: code });
      onClose();
    } catch {
      // 发送方负责展示具体错误；保留弹窗和验证码，允许用户直接重试。
    }
  };

  const handleEnterKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.nativeEvent.isComposing || e.keyCode === 229 || e.key.toLowerCase() !== 'enter') return;
    handleSubmit(onSubmit)();
  };

  return (
    <MyModal isOpen={true}>
      <ModalBody pt={8}>
        <Skeleton
          minH="200px"
          isLoaded={!loading}
          fadeDuration={1}
          display={'flex'}
          justifyContent={'center'}
          my={1}
        >
          <MyImage
            borderRadius={'md'}
            w={'100%'}
            h={'200px'}
            _hover={{ cursor: 'pointer' }}
            mb={8}
            onClick={refreshCaptcha}
            src={data?.captchaImage}
            alt=""
          />
        </Skeleton>

        <FormControl isInvalid={false}>
          <Input
            placeholder={t('common:support.user.captcha_placeholder')}
            {...register('code')}
            onKeyDown={handleEnterKeyDown}
          />
        </FormControl>
      </ModalBody>
      <ModalFooter gap={2}>
        <Button isLoading={onSending} variant={'whiteBase'} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button isLoading={onSending} onClick={handleSubmit(onSubmit)}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default SendCodeAuthModal;
