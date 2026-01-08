import React, { useMemo } from 'react';
import { Box, Flex, Button, Textarea, ModalFooter } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { putDatasetDataById, getDatasetDataItemById } from '@/web/core/dataset/api';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyBox from '@fastgpt/web/components/common/MyBox';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import styles from '../styles.module.scss';

type EditDataType = {
  q: string;
  a?: string;
};

const EditContentModal = ({
  dataId,
  defaultValue,
  trainingType,
  onClose,
  onSuccess
}: {
  dataId: string;
  defaultValue: { q?: string; a?: string };
  trainingType?: DatasetCollectionDataProcessModeEnum;
  onClose: () => void;
  onSuccess: (data: EditDataType) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { register, handleSubmit } = useForm<EditDataType>({
    defaultValues: defaultValue
  });

  const isFAQ = trainingType === DatasetCollectionDataProcessModeEnum.template;

  // Fetch current data detail to get indexes
  const { data: currentData, runAsync: fetchCurrentData } = useRequest2(
    async () => {
      return await getDatasetDataItemById(dataId);
    },
    {
      manual: false,
      refreshDeps: [dataId]
    }
  );

  // Update data
  const { runAsync: onUpdateData, loading: isUpdating } = useRequest2(
    async (e: EditDataType) => {
      if (!currentData) {
        throw new Error(t('common:error.unKnow'));
      }

      const updateData: any = {
        dataId,
        q: e.q,
        a: isFAQ ? e.a : '',
        // Keep existing indexes
        indexes: currentData.indexes || []
      };

      await putDatasetDataById(updateData);

      return {
        dataId,
        ...e
      };
    },
    {
      successToast: t('common:dataset.data.Update Success Tip'),
      onError(err) {
        toast({
          title: getErrText(err),
          status: 'error'
        });
      },
      onSuccess(data) {
        onSuccess(data);
        onClose();
      }
    }
  );

  const modalTitle = useMemo(
    () => (isFAQ ? t('dataset:edit_faq') : t('dataset:edit_chunk')),
    [isFAQ, t]
  );

  return (
    <MyModal
      isOpen={true}
      isCentered
      w={['20rem', '50rem']}
      onClose={onClose}
      closeOnOverlayClick={false}
      maxW={'800px'}
      h={'650px'}
      title={modalTitle}
      iconSrc="modal/edit"
    >
      <MyBox display={'flex'} flexDir={'column'} h={'100%'} py={4}>
        <Flex flex={'1 0 0'} h={['auto', '0']} flexDir={'column'} px={7}>
          {/* Question/Content Input */}
          <Flex flexDir={'column'} flex={'1 0 0'} h={0}>
            <FormLabel required={isFAQ ? true : undefined} mb={1}>
              {isFAQ ? t('dataset:question') : ''}
            </FormLabel>
            <Textarea
              resize={'vertical'}
              className={styles.scrollbar}
              flex={'1 0 0'}
              tabIndex={1}
              _focus={{
                borderColor: 'primary.500',
                boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
                bg: 'white'
              }}
              borderRadius={'md'}
              borderColor={'myGray.200'}
              {...register('q', {
                required: true
              })}
            />
          </Flex>

          {/* Answer Input - Only for FAQ */}
          {isFAQ && (
            <Flex flexDir={'column'} flex={'1 0 0'} mt={3}>
              <FormLabel required mb={1}>
                {t('dataset:answer')}
              </FormLabel>
              <Textarea
                resize={'vertical'}
                className={styles.scrollbar}
                flex={'1 0 0'}
                tabIndex={2}
                borderRadius={'md'}
                border={'1.5px solid '}
                borderColor={'myGray.200'}
                _focus={{
                  borderColor: 'primary.500',
                  boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
                  bg: 'white'
                }}
                {...register('a', { required: isFAQ })}
              />
            </Flex>
          )}
        </Flex>

        <ModalFooter py={0} pt={4}>
          <Button variant={'whiteBase'} mr={3} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button isLoading={isUpdating} onClick={handleSubmit(onUpdateData)}>
            {t('common:Confirm')}
          </Button>
        </ModalFooter>
      </MyBox>
    </MyModal>
  );
};

export default React.memo(EditContentModal);
