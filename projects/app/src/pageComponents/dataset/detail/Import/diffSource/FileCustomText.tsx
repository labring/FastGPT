import React, { useCallback, useEffect } from 'react';

import dynamic from 'next/dynamic';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { Box, Button, Flex, Input, Textarea } from '@chakra-ui/react';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';

const DataProcess = dynamic(() => import('../commonProgress/DataProcess'), {
  loading: () => <Loading fixed={false} />
});
const Upload = dynamic(() => import('../commonProgress/Upload'));
const PreviewData = dynamic(() => import('../commonProgress/PreviewData'));

const CustomTet = () => {
  const activeStep = useContextSelector(DatasetImportContext, (v) => v.activeStep);
  return (
    <>
      {activeStep === 0 && <CustomTextInput />}
      {activeStep === 1 && <DataProcess />}
      {activeStep === 2 && <PreviewData />}
      {activeStep === 3 && <Upload />}
    </>
  );
};

export default React.memo(CustomTet);

const CustomTextInput = () => {
  const { t } = useTranslation();
  const { sources, goToNext, setSources } = useContextSelector(DatasetImportContext, (v) => v);
  const { register, reset, handleSubmit } = useForm({
    defaultValues: {
      name: '',
      value: ''
    }
  });

  const onSubmit = useCallback(
    (data: { name: string; value: string }) => {
      const fileId = getNanoid(32);

      setSources([
        {
          id: fileId,
          createStatus: 'waiting',
          rawText: data.value,
          sourceName: data.name,
          icon: 'file/fill/txt'
        }
      ]);
      goToNext();
    },
    [goToNext, setSources]
  );

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
          {t('dataset:collection_name')}
        </Box>
        <Input
          flex={'1 0 0'}
          maxW={['100%', '350px']}
          {...register('name', {
            required: true
          })}
          placeholder={t('dataset:collection_name')}
          bg={'myGray.50'}
        />
      </Box>
      <Box display={['block', 'flex']} alignItems={'flex-start'} mt={5}>
        <Box flex={'0 0 120px'} fontSize={'sm'}>
          {t('common:core.dataset.collection.Collection raw text')}
        </Box>
        <Textarea
          flex={'1 0 0'}
          w={'100%'}
          rows={15}
          placeholder={t('common:core.dataset.collection.Collection raw text')}
          {...register('value', {
            required: true
          })}
          bg={'myGray.50'}
        />
      </Box>
      <Flex mt={5} justifyContent={'flex-end'}>
        <Button onClick={handleSubmit((data) => onSubmit(data))}>{t('common:next_step')}</Button>
      </Flex>
    </Box>
  );
};
