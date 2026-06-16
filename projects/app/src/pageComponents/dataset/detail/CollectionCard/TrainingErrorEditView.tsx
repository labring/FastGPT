import { Box, Button, Flex } from '@chakra-ui/react';
import type { GetTrainingDataDetailResponse } from '@fastgpt/global/openapi/core/dataset/training/api';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useTranslation } from 'next-i18next';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import MyImage from '@/components/MyImage';
import { useForm } from 'react-hook-form';

const TrainingErrorEditView = ({
  loading,
  editChunk,
  onCancel,
  onSave
}: {
  loading: boolean;
  editChunk: GetTrainingDataDetailResponse;
  onCancel: () => void;
  onSave: (data: { q: string; a?: string; chunkIndex?: number }) => void;
}) => {
  const { t } = useTranslation();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      q: editChunk?.q || '',
      a: editChunk?.a || ''
    }
  });

  return (
    <Flex flexDirection={'column'} gap={4}>
      {editChunk?.imagePreviewUrl && (
        <Box>
          <FormLabel>{t('file:image')}</FormLabel>
          <Box w={'100%'} h={'200px'} border={'base'} borderRadius={'md'}>
            <MyImage src={editChunk.imagePreviewUrl} alt="image" w={'100%'} h={'100%'} />
          </Box>
        </Box>
      )}

      <Box>
        {(editChunk?.a || editChunk?.imagePreviewUrl) && (
          <FormLabel>
            {editChunk?.a
              ? t('common:dataset_data_input_chunk_content')
              : t('common:dataset_data_input_q')}
          </FormLabel>
        )}
        <MyTextarea
          {...register('q', { required: true })}
          minH={editChunk?.a || editChunk?.imagePreviewUrl ? 200 : 400}
        />
      </Box>

      {editChunk?.a && (
        <Box>
          <Box>{t('common:dataset_data_input_a')}</Box>
          <MyTextarea {...register('a')} minH={200} />
        </Box>
      )}
      <Flex justifyContent={'flex-end'} gap={4}>
        <Button variant={'outline'} onClick={onCancel}>
          {t('common:Cancel')}
        </Button>
        <Button isLoading={loading} variant={'primary'} onClick={handleSubmit(onSave)}>
          {t('common:Confirm')}
        </Button>
      </Flex>
    </Flex>
  );
};

export default TrainingErrorEditView;
