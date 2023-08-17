import React from 'react';
import { ModalBody, Box, Flex, Input, ModalFooter, Button } from '@chakra-ui/react';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useRequest } from '@/hooks/useRequest';
import { UserType } from '@/types/user';
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
const OpenAIAccountModal = ({
  defaultData,
  onSuccess,
  onClose
}: {
  defaultData: UserType['openaiAccount'];
  onSuccess: (e: UserType['openaiAccount']) => Promise<any>;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { register, handleSubmit } = useForm({
    defaultValues: defaultData
  });

  const { mutate: onSubmit, isLoading } = useRequest({
    mutationFn: async (data: UserType['openaiAccount']) => onSuccess(data),
    onSuccess(res) {
      onClose();
    },
    errorToast: t('user.Set OpenAI Account Failed')
  });

  return (
    <MyModal isOpen onClose={onClose} title={t('user.OpenAI Account Setting')}>
      <ModalBody>
        <Box fontSize={'sm'} color={'myGray.500'}>
          {t('如果你填写了该内容，在线上平台使用 OpenAI Chat')}
          {t('模型不会计费（不包含知识库训练、索引生成、分享窗口和 API 调用')}
        </Box>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={'0 0 65px'}>API Key:</Box>
          <Input flex={1} {...register('key')}></Input>
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={'0 0 65px'}>BaseUrl:</Box>
          <Input
            flex={1}
            {...register('baseUrl')}
            placeholder={t('中转地址，未自动补全 "v1"')}
          ></Input>
        </Flex>
      </ModalBody>
      <ModalFooter>
        <Button mr={3} variant={'base'} onClick={onClose}>
          {t('取消')}
        </Button>
        <Button isLoading={isLoading} onClick={handleSubmit((data) => onSubmit(data))}>
          {t('确认')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default OpenAIAccountModal;
