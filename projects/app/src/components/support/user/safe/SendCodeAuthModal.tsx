import { getCaptchaPic } from '@/web/support/user/api';
import { Box, Button, Input, Image, ModalBody, ModalFooter } from '@chakra-ui/react';
import { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

const SendCodeAuthModal = ({
  username,
  sendCode,
  type,
  onClose
}: {
  username: string;
  sendCode: (params_0: {
    username: string;
    type: `${UserAuthTypeEnum}`;
    captcha: string;
  }) => Promise<void>;
  type: UserAuthTypeEnum;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [ans, setAns] = useState('');

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
          w={'400px'}
          h={'200px'}
          _hover={{ cursor: 'pointer' }}
          mb={8}
          onClick={getCaptcha}
          src={data?.captchaImage}
        />
        <Input
          placeholder={t('common:support.user.captcha_placeholder')}
          value={ans}
          onChange={(e) => setAns(e.target.value)}
        />
      </ModalBody>
      <ModalFooter gap={2}>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common:common.Cancel')}
        </Button>
        <Button
          onClick={async () => {
            await sendCode({ username, type, captcha: ans });
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
