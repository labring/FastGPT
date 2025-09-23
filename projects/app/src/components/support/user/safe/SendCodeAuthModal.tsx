import { getCaptchaPic } from '@/web/support/user/api';
import { Button, Input, ModalBody, ModalFooter, Skeleton } from '@chakra-ui/react';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';

const SendCodeAuthModal = ({
  username,
  onClose,
  onSending,
  onSendCode
}: {
  username: string;
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
    runAsync: getCaptcha
  } = useRequest2(() => getCaptchaPic(username), { manual: false });

  const onSubmit = async ({ code }: { code: string }) => {
    await onSendCode({ username, captcha: code });
    onClose();
  };

  const onError = (err: any) => {
    console.log(err);
  };

  const handleEnterKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key.toLowerCase() !== 'enter') return;
    handleSubmit(onSubmit, onError)();
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
            onClick={getCaptcha}
            src={data?.captchaImage}
            alt=""
          />
        </Skeleton>

        <Input
          placeholder={t('common:support.user.captcha_placeholder')}
          {...register('code')}
          onKeyDown={handleEnterKeyDown}
        />
      </ModalBody>
      <ModalFooter gap={2}>
        <Button isLoading={onSending} variant={'whiteBase'} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button isLoading={onSending} onClick={handleSubmit(onSubmit, onError)}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default SendCodeAuthModal;
