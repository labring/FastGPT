import React from 'react';
import { ModalFooter, ModalBody, Button, Flex, Box } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal/index';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useForm } from 'react-hook-form';
import { useToast } from '@fastgpt/web/hooks/useToast';
import ApiDatasetForm from '@/pageComponents/dataset/ApiDatasetForm';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { getDocPath } from '@/web/common/system/doc';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { ApiDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';
import { DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';

export type EditAPIDatasetInfoFormType = {
  id: string;
  apiDatasetServer?: ApiDatasetServerType;
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

  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const type = datasetDetail.type;

  const form = useForm<EditAPIDatasetInfoFormType>({
    defaultValues: defaultForm
  });

  const { runAsync: onSave, loading } = useRequest2(
    (data: EditAPIDatasetInfoFormType) => onEdit(data),
    {
      onSuccess: (res) => {
        toast({
          title: t('common:update_success'),
          status: 'success'
        });
        onClose();
      }
    }
  );

  return (
    <MyModal isOpen onClose={onClose} w={'450px'} iconSrc="modal/edit" title={title}>
      <ModalBody>
        {DatasetTypeMap[type]?.courseUrl && (
          <Flex alignItems={'center'} justifyContent={'space-between'}>
            <Box color={'myGray.900'} fontSize={'sm'} fontWeight={500}>
              {t('dataset:apidataset_configuration')}
            </Box>
            <Flex
              alignItems={'center'}
              justifyContent={'flex-end'}
              color={'primary.600'}
              fontSize={'sm'}
              cursor={'pointer'}
              onClick={() => window.open(getDocPath(DatasetTypeMap[type].courseUrl!), '_blank')}
            >
              <MyIcon name={'book'} w={4} mr={0.5} />
              {t('common:Instructions')}
            </Flex>
          </Flex>
        )}
        {/* @ts-ignore */}
        <ApiDatasetForm datasetId={datasetDetail._id} type={type} form={form} />
      </ModalBody>
      <ModalFooter>
        <Button isLoading={loading} onClick={form.handleSubmit(onSave)} px={6}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default EditAPIDatasetInfoModal;
