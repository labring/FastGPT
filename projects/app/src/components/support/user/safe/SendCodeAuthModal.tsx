import { getCaptchaPic } from '@/web/support/user/api';
import { useSendCode } from '@/web/support/user/hooks/useSendCode';
import { Box, Button, Input, Image, ModalBody, ModalFooter } from '@chakra-ui/react';
import { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

const SendCodeAuthModal = ({
  username,
  type,
  onClose
}: {
  username: string;
  type: UserAuthTypeEnum;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [captchaInput, setCaptchaInput] = useState('');
  const { codeSending, sendCode } = useSendCode();
  const {
    data,
    loading,
    runAsync: getCaptcha
  } = useRequest2(() => getCaptchaPic(username), { manual: false });
  return (
    <MyModal isOpen={true} isLoading={loading}>
      <ModalBody pt={8}>
        <Image
          borderRadius={'md'}
          w={'100%'}
          h={'200px'}
          _hover={{ cursor: 'pointer' }}
          mb={8}
          onClick={getCaptcha}
          src={data?.captchaImage}
          alt="captcha"
        />
        <Input
          placeholder={t('common:support.user.captcha_placeholder')}
          value={captchaInput}
          onChange={(e) => setCaptchaInput(e.target.value)}
        />
      </ModalBody>
      <ModalFooter gap={2}>
        <Button isLoading={codeSending} variant={'whiteBase'} onClick={onClose}>
          {t('common:common.Cancel')}
        </Button>
        <Button
          isLoading={codeSending}
          onClick={async () => {
            await sendCode({ username, type, captcha: captchaInput });
            onClose();
          }}
        >
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default SendCodeAuthModal;
