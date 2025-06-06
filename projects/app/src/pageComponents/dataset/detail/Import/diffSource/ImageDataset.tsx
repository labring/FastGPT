import React, { useState } from 'react';
import { Box, Button, Flex, Input, Image } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { TabEnum } from '../../NavBar';
import { createImageDatasetCollection } from '@/web/core/dataset/image/api';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useForm } from 'react-hook-form';
import FileSelector, { type SelectFileItemType } from '../components/FileSelector';
import type { ImportSourceItemType } from '@/web/core/dataset/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { DatasetImportContext } from '../Context';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';

const fileType = '.jpg, .jpeg, .png';

const ImageDataset = () => {
  return <SelectFile />;
};

export default React.memo(ImageDataset);

const SelectFile = React.memo(function SelectFile() {
  const { t } = useTranslation();
  const router = useRouter();

  const parentId = useContextSelector(DatasetImportContext, (v) => v.parentId);
  const datasetId = useContextSelector(DatasetPageContext, (v) => v.datasetId);

  const [selectFiles, setSelectFiles] = useState<ImportSourceItemType[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);

  const { register, handleSubmit } = useForm({
    defaultValues: {
      name: ''
    }
  });

  const onSelectFiles = (files: SelectFileItemType[]) => {
    setSelectFiles((pre) => {
      const formatFiles = Array.from(files).map<ImportSourceItemType>((item) => {
        const previewUrl = URL.createObjectURL(item.file);

        return {
          id: getNanoid(),
          createStatus: 'waiting',
          file: item.file,
          sourceName: item.file.name,
          icon: previewUrl
        };
      });

      return [...pre, ...formatFiles];
    });
  };
  const onRemoveFile = (index: number) => {
    setSelectFiles((prev) => {
      return prev.filter((_, i) => i !== index);
    });
  };

  const { runAsync: onCreate, loading: creating } = useRequest2(
    async ({ name: collectionName }: { name: string }) => {
      return await createImageDatasetCollection({
        parentId,
        datasetId,
        collectionName,
        files: selectFiles.map((item) => item.file!).filter(Boolean),
        onUploadProgress: setUploadProgress
      });
    },
    {
      manual: true,
      successToast: t('common:create_success'),
      onSuccess() {
        router.replace({
          query: {
            datasetId: router.query.datasetId,
            currentTab: TabEnum.collectionCard
          }
        });
      }
    }
  );

  return (
    <Flex flexDirection={'column'} maxW={'850px'} mx={'auto'} mt={7}>
      <Flex alignItems="center" width="100%">
        <FormLabel required width={['100px', '140px']}>
          {t('dataset:collection_name')}
        </FormLabel>

        <Input
          flex="0 0 400px"
          bg="myGray.50"
          placeholder={t('dataset:collection_name')}
          {...register('name', { required: true })}
        />
      </Flex>

      <Flex mt={7} alignItems="flex-start" width="100%">
        <FormLabel required width={['100px', '140px']}>
          {t('common:core.dataset.collection.Collection raw text')}
        </FormLabel>

        <Box flex={'1 0 0'}>
          <Box>
            <FileSelector
              fileType={fileType}
              selectFiles={selectFiles}
              onSelectFiles={onSelectFiles}
            />
          </Box>
          {selectFiles.length > 0 && (
            <Flex flexWrap={'wrap'} gap={4} mt={3} width="100%">
              {selectFiles.map((file, index) => (
                <Box
                  key={index}
                  w="100px"
                  h={'100px'}
                  position={'relative'}
                  _hover={{
                    '.close-icon': { display: 'block' }
                  }}
                  bg={'myGray.50'}
                  borderRadius={'md'}
                  border={'base'}
                  borderStyle={'dashed'}
                  p={1}
                >
                  <MyImage
                    src={file.icon}
                    w="100%"
                    h={'100%'}
                    objectFit={'contain'}
                    alt={file.sourceName}
                  />
                  <MyIcon
                    name={'closeSolid'}
                    w={'1rem'}
                    h={'1rem'}
                    color={'myGray.700'}
                    cursor={'pointer'}
                    _hover={{ color: 'red.500' }}
                    position={'absolute'}
                    rounded={'full'}
                    bg={'white'}
                    right={'-8px'}
                    top={'-2px'}
                    onClick={() => onRemoveFile(index)}
                    className="close-icon"
                    display={['', 'none']}
                    zIndex={10}
                  />
                </Box>
              ))}
            </Flex>
          )}
        </Box>
      </Flex>

      <Flex width="100%" justifyContent="flex-end" mt="9">
        <Button isDisabled={selectFiles.length === 0 || creating} onClick={handleSubmit(onCreate)}>
          {creating ? (
            uploadProgress >= 100 ? (
              <Box>{t('dataset:images_creating')}</Box>
            ) : (
              <Box>{t('dataset:uploading_progress', { num: uploadProgress })}</Box>
            )
          ) : selectFiles.length > 0 ? (
            <>
              <Box>
                {t('dataset:confirm_import_images', {
                  num: selectFiles.length
                })}
              </Box>
            </>
          ) : (
            <Box>{t('common:comfirn_create')}</Box>
          )}
        </Button>
      </Flex>
    </Flex>
  );
});
