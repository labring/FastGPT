import React, { useMemo } from 'react';
import { Box, Flex, Button, Textarea, ModalFooter, Text } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import {
  putDatasetDataById,
  getDatasetDataItemById,
  postInsertData2Dataset
} from '@/web/core/dataset/api';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MyBox from '@fastgpt/web/components/common/MyBox';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import styles from '../styles.module.scss';
import MyPhotoView from '@fastgpt/web/components/common/Image/PhotoView';

type EditDataType = {
  q: string;
  a?: string;
};

type EditContentModalProps = {
  mode: 'add' | 'edit';
  dataId?: string;
  collectionId?: string;
  defaultValue: { q?: string; a?: string };
  trainingType?: DatasetCollectionDataProcessModeEnum;
  imagePreviewUrl?: string;
  onClose: () => void;
  onSuccess: (data: EditDataType & { chunkIndex?: number }) => void;
};

const EditContentModal = ({
  mode,
  dataId,
  collectionId,
  defaultValue,
  trainingType,
  imagePreviewUrl,
  onClose,
  onSuccess
}: EditContentModalProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { register, handleSubmit, reset } = useForm<EditDataType>({
    defaultValues: defaultValue
  });

  const isFAQ = trainingType === DatasetCollectionDataProcessModeEnum.template;
  const isImageParse = trainingType === DatasetCollectionDataProcessModeEnum.imageParse;

  // Fetch current data detail to get indexes (edit mode only)
  const { data: currentData } = useRequest(
    async () => {
      if (mode !== 'edit' || !dataId) return undefined;
      return await getDatasetDataItemById(dataId);
    },
    {
      manual: false,
      refreshDeps: [dataId, mode]
    }
  );

  // Update data (edit mode)
  const { runAsync: onUpdateData, loading: isUpdating } = useRequest(
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

  // Insert data (add mode)
  const { runAsync: onInsertData, loading: isInserting } = useRequest(
    async (e: EditDataType) => {
      const res = (await postInsertData2Dataset({
        collectionId: collectionId!,
        q: e.q,
        a: isFAQ ? e.a : ''
      })) as unknown as { chunkIndex: number };
      return { ...e, chunkIndex: res.chunkIndex };
    },
    {
      onSuccess(data) {
        toast({
          title: t('dataset:add_success_toast', { index: data.chunkIndex }),
          status: 'success'
        });
        reset();
        onSuccess(data);
        onClose();
      },
      onError(err) {
        toast({ title: getErrText(err), status: 'error' });
      }
    }
  );

  const isLoading = isUpdating || isInserting;

  const modalTitle = useMemo(() => {
    if (mode === 'add') {
      return isFAQ ? t('dataset:add_faq_modal_title') : t('dataset:add_chunk_modal_title');
    }
    return isFAQ ? t('dataset:edit_faq') : t('dataset:edit_chunk');
  }, [mode, isFAQ, t]);

  const onSubmit = mode === 'add' ? onInsertData : onUpdateData;

  return (
    <MyModal
      isOpen={true}
      isCentered
      w={isImageParse ? ['20rem', '70rem'] : ['20rem', '50rem']}
      onClose={onClose}
      closeOnOverlayClick={false}
      maxW={isImageParse ? '1000px' : '800px'}
      h={'650px'}
      title={modalTitle}
    >
      <MyBox display={'flex'} flexDir={'column'} h={'100%'} py={4}>
        {isImageParse ? (
          /* imageParse: left image preview, right description textarea */
          <Flex flex={'1 0 0'} h={0} px={7} gap={4}>
            {/* Left: image preview */}
            <Flex flexDir={'column'} flex={'0 0 auto'} w={'45%'}>
              <FormLabel mb={1}>{t('file:image')}</FormLabel>
              <Box
                flex={'1 0 0'}
                h={0}
                border={'1.5px solid'}
                borderColor={'myGray.200'}
                borderRadius={'md'}
                overflow={'hidden'}
              >
                {imagePreviewUrl ? (
                  <MyPhotoView
                    src={imagePreviewUrl}
                    alt="image"
                    w={'100%'}
                    h={'100%'}
                    objectFit={'contain'}
                  />
                ) : (
                  <Flex
                    alignItems={'center'}
                    justifyContent={'center'}
                    h={'100%'}
                    color={'myGray.400'}
                    fontSize={'sm'}
                  >
                    {t('file:Loading_image failed')}
                  </Flex>
                )}
              </Box>
            </Flex>

            {/* Right: description textarea */}
            <Flex flexDir={'column'} flex={'1 0 0'}>
              <FormLabel mb={1}>
                {t('file:image_description')}
                <Text
                  as="span"
                  display={'inline'}
                  color={'myGray.500'}
                  fontSize={'12px'}
                  fontWeight={400}
                  ml={2}
                >
                  {t('dataset:markdown_tip')}
                </Text>
              </FormLabel>
              <Textarea
                resize={'none'}
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
                {...register('q', { required: true })}
              />
            </Flex>
          </Flex>
        ) : (
          <Flex flex={'1 0 0'} h={['auto', '0']} flexDir={'column'} px={7}>
            {/* Question/Content Input */}
            <Flex flexDir={'column'} flex={'1 0 0'} h={0}>
              <FormLabel required={isFAQ || undefined} mb={1}>
                {isFAQ ? (
                  t('dataset:question')
                ) : (
                  <Text as="span" color={'myGray.500'} fontSize={'12px'} fontWeight={400}>
                    {t('dataset:markdown_tip')}
                  </Text>
                )}
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
              <Flex flexDir={'column'} flex={'4 0 0'} mt={5}>
                <FormLabel required mb={1}>
                  {t('dataset:answer')}
                  <Text as="span" color={'myGray.500'} fontSize={'12px'} fontWeight={400} ml={2}>
                    {t('dataset:markdown_tip')}
                  </Text>
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
        )}

        <ModalFooter py={0} pt={4}>
          <Button variant={'whiteBase'} mr={3} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button isLoading={isLoading} onClick={handleSubmit(onSubmit)}>
            {t('common:Confirm')}
          </Button>
        </ModalFooter>
      </MyBox>
    </MyModal>
  );
};

export default React.memo(EditContentModal);
