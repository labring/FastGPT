import React, { useEffect } from 'react';
import { ImportDataComponentProps } from '@/web/core/dataset/type.d';

import dynamic from 'next/dynamic';
import { useImportStore } from '../Provider';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { Box, Button, Flex, Input, Textarea } from '@chakra-ui/react';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import Loading from '@/components/Loading';

const DataProcess = dynamic(() => import('../commonProgress/DataProcess'), {
  loading: () => <Loading fixed={false} />
});
const Upload = dynamic(() => import('../commonProgress/Upload'));

const CustomTet = ({ activeStep, goToNext }: ImportDataComponentProps) => {
  return (
    <>
      {activeStep === 0 && <CustomTextInput goToNext={goToNext} />}
      {activeStep === 1 && <DataProcess showPreviewChunks goToNext={goToNext} />}
      {activeStep === 2 && <Upload showPreviewChunks />}
    </>
  );
};

export default React.memo(CustomTet);

const CustomTextInput = ({ goToNext }: { goToNext: () => void }) => {
  const { t } = useTranslation();
  const { sources, setSources } = useImportStore();
  const { register, reset, handleSubmit } = useForm({
    defaultValues: {
      name: '',
      value: ''
    }
  });

  useEffect(() => {
    const source = sources[0];
    if (source) {
      reset({
        name: source.sourceName,
        value: source.rawText
      });
    }
  }, []);

  return (
    <Box maxW={['100%', '800px']}>
      <Box display={['block', 'flex']} alignItems={'center'}>
        <Box flex={'0 0 120px'} fontSize={'sm'}>
          {t('core.dataset.collection.Collection name')}
        </Box>
        <Input
          flex={'1 0 0'}
          maxW={['100%', '350px']}
          {...register('name', {
            required: true
          })}
          placeholder={t('core.dataset.collection.Collection name')}
          bg={'myGray.50'}
        />
      </Box>
      <Box display={['block', 'flex']} alignItems={'flex-start'} mt={5}>
        <Box flex={'0 0 120px'} fontSize={'sm'}>
          {t('core.dataset.collection.Collection raw text')}
        </Box>
        <Textarea
          flex={'1 0 0'}
          w={'100%'}
          rows={15}
          placeholder={t('core.dataset.collection.Collection raw text')}
          {...register('value', {
            required: true
          })}
          bg={'myGray.50'}
        />
      </Box>
      <Flex mt={5} justifyContent={'flex-end'}>
        <Button
          onClick={handleSubmit((data) => {
            const fileId = getNanoid(32);

            setSources([
              {
                id: fileId,
                rawText: data.value,
                chunks: [],
                chunkChars: 0,
                sourceName: data.name,
                icon: 'file/fill/manual'
              }
            ]);
            goToNext();
          })}
        >
          {t('common.Next Step')}
        </Button>
      </Flex>
    </Box>
  );
};
