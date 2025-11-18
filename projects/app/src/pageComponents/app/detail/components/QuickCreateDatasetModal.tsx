import React, { useState, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import {
  Box,
  Flex,
  ModalBody,
  ModalFooter,
  Button,
  FormControl,
  Input,
  Progress
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import Avatar from '@fastgpt/web/components/common/Avatar';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { postCreateDatasetWithFiles, getDatasetById } from '@/web/core/dataset/api';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import { uploadFile2DB } from '@/web/common/file/controller';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getWebDefaultEmbeddingModel, getWebDefaultLLMModel } from '@/web/common/system/utils';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { ImportSourceItemType } from '@/web/core/dataset/type';
import FileSelector, {
  type SelectFileItemType
} from '@/pageComponents/dataset/detail/Import/components/FileSelector';
import { useRouter } from 'next/router';

const QuickCreateDatasetModal = ({
  onClose,
  onSuccess,
  parentId
}: {
  onClose: () => void;
  onSuccess: (dataset: SelectedDatasetType) => void;
  parentId: string;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { defaultModels, embeddingModelList, datasetModelList } = useSystemStore();

  const defaultVectorModel =
    defaultModels.embedding?.model || getWebDefaultEmbeddingModel(embeddingModelList)?.model;
  const defaultAgentModel =
    defaultModels.datasetTextLLM?.model || getWebDefaultLLMModel(datasetModelList)?.model;
  const defaultVLLM = defaultModels.datasetImageLLM?.model;

  const [selectFiles, setSelectFiles] = useState<ImportSourceItemType[]>([]);

  const successFiles = useMemo(
    () => selectFiles.filter((item) => item.dbFileId && !item.errorMsg),
    [selectFiles]
  );

  const { register, handleSubmit, watch, setValue } = useForm({
    defaultValues: {
      parentId,
      name: '',
      avatar: 'core/dataset/commonDatasetColor'
    }
  });

  const avatar = watch('avatar');

  const { Component: AvatarUploader, handleFileSelectorOpen: handleAvatarSelectorOpen } =
    useUploadAvatar(getUploadAvatarPresignedUrl, {
      onSuccess: (avatarUrl: string) => {
        setValue('avatar', avatarUrl);
      }
    });

  const { runAsync: handleSelectFiles, loading: uploading } = useRequest2(
    async (files: SelectFileItemType[]) => {
      await Promise.all(
        files.map(async ({ fileId, file }) => {
          try {
            const { fileId: uploadFileId } = await uploadFile2DB({
              file,
              bucketName: BucketNameEnum.dataset,
              data: { datasetId: '' },
              percentListen: (percent) => {
                setSelectFiles((state) =>
                  state.map((item) =>
                    item.id === fileId
                      ? {
                          ...item,
                          uploadedFileRate: item.uploadedFileRate
                            ? Math.max(percent, item.uploadedFileRate)
                            : percent
                        }
                      : item
                  )
                );
              }
            });

            setSelectFiles((state) =>
              state.map((item) =>
                item.id === fileId
                  ? {
                      ...item,
                      dbFileId: uploadFileId,
                      isUploading: false,
                      uploadedFileRate: 100
                    }
                  : item
              )
            );
          } catch (error) {
            setSelectFiles((state) =>
              state.map((item) =>
                item.id === fileId
                  ? {
                      ...item,
                      isUploading: false,
                      errorMsg: getErrText(error)
                    }
                  : item
              )
            );
          }
        })
      );
    },
    {
      manual: true,
      onBefore([files]) {
        setSelectFiles((state) => [
          ...state,
          ...files.map<ImportSourceItemType>((selectFile) => {
            const { fileId, file } = selectFile;

            return {
              id: fileId,
              createStatus: 'waiting',
              file,
              sourceName: file.name,
              sourceSize: formatFileSize(file.size),
              icon: getFileIcon(file.name),
              isUploading: true,
              uploadedFileRate: 0
            };
          })
        ]);
      }
    }
  );

  const { runAsync: onCreate, loading: isCreating } = useRequest2(
    async (data) => {
      return await postCreateDatasetWithFiles({
        datasetParams: {
          name: data.name.trim(),
          avatar: data.avatar,
          parentId,
          vectorModel: defaultVectorModel,
          agentModel: defaultAgentModel,
          vlmModel: defaultVLLM
        },
        files: selectFiles
          .filter((item) => item.dbFileId && !item.errorMsg)
          .map((item) => ({
            fileId: item.dbFileId!,
            name: item.sourceName
          }))
      });
    },
    {
      manual: true,
      successToast: t('app:dataset_create_success'),
      errorToast: t('app:dataset_create_failed'),
      onSuccess: (result) => {
        onSuccess(result);
        onClose();
        setSelectFiles([]);
      }
    }
  );

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      title={t('app:Create_dataset')}
      minW={'800px'}
      ml={'20px'}
    >
      <ModalBody py={6} minH={'500px'}>
        <Box mb={6}>
          <FormLabel mb={2}>{t('common:input_name')}</FormLabel>
          <Flex alignItems={'center'}>
            <MyTooltip label={t('common:set_avatar')}>
              <Box w={9} h={9} mr={4}>
                <Avatar
                  src={avatar}
                  w={'full'}
                  h={'full'}
                  borderRadius={'8px'}
                  cursor={'pointer'}
                  onClick={handleAvatarSelectorOpen}
                />
              </Box>
            </MyTooltip>
            <FormControl flex={1}>
              <Input
                {...register('name', { required: true })}
                placeholder={t('common:dataset.dataset_name')}
                h={8}
                autoFocus
              />
            </FormControl>
          </Flex>
        </Box>

        <Box>
          <FileSelector
            fileType={'.txt, .docx, .csv, .xlsx, .pdf, .md, .html, .htm, .pptx, .doc, .xls, .ppt'}
            selectFiles={selectFiles}
            onSelectFiles={handleSelectFiles}
          />

          {selectFiles.length > 0 && (
            <Flex mt={6} flexDirection={'column'} gap={1.5}>
              {selectFiles.map((item) => (
                <Flex
                  key={item.id}
                  px={3}
                  py={1.5}
                  h={9}
                  alignItems={'center'}
                  borderRadius={'8px'}
                  boxShadow={
                    '0 1px 2px 0 rgba(19, 51, 107, 0.05), 0 0 1px 0 rgba(19, 51, 107, 0.08)'
                  }
                  gap={2}
                >
                  <MyIcon name={item.icon as any} w={5} />
                  <Flex
                    alignItems={'center'}
                    w={2 / 5}
                    whiteSpace={'nowrap'}
                    overflow={'hidden'}
                    textOverflow={'ellipsis'}
                    fontSize={'14px'}
                    color={'myGray.900'}
                    mr={4}
                    flexShrink={0}
                  >
                    {item.sourceName}
                  </Flex>
                  <Flex w={2 / 5} pl={2} flexShrink={0}>
                    {item.errorMsg ? (
                      <MyTooltip label={item.errorMsg}>
                        <Flex alignItems={'center'} color={'red.500'}>
                          <Box mr={1} fontSize={'sm'}>
                            {t('common:Error')}
                          </Box>
                          <MyIcon name={'help'} w={4} />
                        </Flex>
                      </MyTooltip>
                    ) : !!item.uploadedFileRate ? (
                      <Flex alignItems={'center'} fontSize={'xs'} w={'full'}>
                        <Progress
                          value={item.uploadedFileRate}
                          h={'4px'}
                          w={'100%'}
                          maxW={'210px'}
                          size="sm"
                          borderRadius={'20px'}
                          colorScheme={item.uploadedFileRate === 100 ? 'green' : 'blue'}
                          bg="myGray.200"
                          hasStripe
                          isAnimated
                          mr={4}
                        />
                        {`${item.uploadedFileRate}%`}
                      </Flex>
                    ) : null}
                  </Flex>
                  <Flex w={1 / 5} justifyContent={'end'}>
                    {!item.isUploading && (
                      <Flex alignItems={'center'} justifyContent={'center'} w={6} h={6}>
                        <MyIcon
                          name={'delete'}
                          w={4}
                          cursor={'pointer'}
                          _hover={{ color: 'red.500' }}
                          onClick={() =>
                            setSelectFiles((prev) =>
                              prev.filter((prevItem) => prevItem.id !== item.id)
                            )
                          }
                        />
                      </Flex>
                    )}
                  </Flex>
                </Flex>
              ))}
            </Flex>
          )}
        </Box>
      </ModalBody>

      <ModalFooter justifyContent={'space-between'} fontSize={'14px'}>
        <Flex fontWeight={'medium'}>
          <Box color={'myGray.500'}>{t('app:dataset.create_dataset_tips')}</Box>
          <Box
            px={1}
            cursor={'pointer'}
            color={'primary.600'}
            onClick={() => {
              router.push('/dataset/list');
            }}
          >
            {t('common:core.dataset.Dataset')}
          </Box>
        </Flex>
        <Flex gap={3}>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button
            isLoading={isCreating}
            isDisabled={successFiles.length === 0 || uploading}
            onClick={handleSubmit(onCreate)}
          >
            {t('common:Create')}
          </Button>
        </Flex>
      </ModalFooter>

      <AvatarUploader />
    </MyModal>
  );
};

export default QuickCreateDatasetModal;
