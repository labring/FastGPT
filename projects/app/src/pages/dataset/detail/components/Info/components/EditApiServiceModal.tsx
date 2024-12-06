import React from 'react';
import { ModalFooter, ModalBody, Input, Button, Flex } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal/index';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useForm } from 'react-hook-form';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { APIFileServer } from '@fastgpt/global/core/dataset/apiDataset';

export type EditAPIDatasetInfoFormType = {
  id: string;
  apiServer?: APIFileServer;
};

const EditAPIDatasetInfoModal = ({
  onClose,
  onEdit,
  title,
  ...defaultForm
}: EditAPIDatasetInfoFormType & {
  title: string;
  onClose: () => void;
  onEdit: (data: EditAPIDatasetInfoFormType) => any;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { register, handleSubmit } = useForm<EditAPIDatasetInfoFormType>({
    defaultValues: defaultForm
  });

  const { runAsync: onSave, loading } = useRequest2(
    (data: EditAPIDatasetInfoFormType) => onEdit(data),
    {
      onSuccess: (res) => {
        toast({
          title: t('common:common.Update Success'),
          status: 'success'
        });
        onClose();
      }
    }
  );

  return (
    <MyModal isOpen onClose={onClose} w={'450px'} iconSrc="modal/edit" title={title}>
      <ModalBody>
        <Flex>
          <Flex
            alignItems={'center'}
            flex={['', '0 0 110px']}
            color={'myGray.900'}
            fontWeight={500}
            fontSize={'sm'}
          >
            {t('dataset:api_url')}
          </Flex>
          <Input
            bg={'myWhite.600'}
            placeholder={t('dataset:api_url')}
            maxLength={200}
            {...register('apiServer.baseUrl', { required: true })}
          />
        </Flex>
        <Flex mt={6}>
          <Flex
            alignItems={'center'}
            flex={['', '0 0 110px']}
            color={'myGray.900'}
            fontWeight={500}
            fontSize={'sm'}
          >
            Authorization
          </Flex>
          <Input
            bg={'myWhite.600'}
            placeholder={t('dataset:request_headers')}
            maxLength={200}
            {...register('apiServer.authorization')}
          />
        </Flex>
      </ModalBody>
      <ModalFooter>
        <Button isLoading={loading} onClick={handleSubmit(onSave)} px={6}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default EditAPIDatasetInfoModal;
