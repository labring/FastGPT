import React, { useCallback } from 'react';
import { Box, Flex, Button, ModalFooter, ModalBody, Input } from '@chakra-ui/react';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useForm } from 'react-hook-form';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@/components/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { postCreateDataset } from '@/web/core/dataset/api';
import type { CreateDatasetParams } from '@/global/core/dataset/api.d';
import { useTranslation } from 'next-i18next';
import MyRadio from '@/components/common/MyRadio';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useI18n } from '@/web/context/I18n';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { DatasetDefaultPermissionVal } from '@fastgpt/global/support/permission/dataset/constant';

const CreateModal = ({ onClose, parentId }: { onClose: () => void; parentId?: string }) => {
  const { t } = useTranslation();
  const { datasetT } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const { isPc, feConfigs, vectorModelList, datasetModelList } = useSystemStore();

  const filterNotHiddenVectorModelList = vectorModelList.filter((item) => !item.hidden);

  const { register, setValue, handleSubmit, watch } = useForm<CreateDatasetParams>({
    defaultValues: {
      parentId,
      type: DatasetTypeEnum.dataset,
      avatar: '/icon/logo.svg',
      name: '',
      intro: '',
      vectorModel: filterNotHiddenVectorModelList[0].model,
      agentModel: datasetModelList[0].model,
      defaultPermission: DatasetDefaultPermissionVal
    }
  });
  const avatar = watch('avatar');
  const datasetType = watch('type');
  const vectorModel = watch('vectorModel');
  const agentModel = watch('agentModel');

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  const onSelectFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      if (!file) return;
      try {
        const src = await compressImgFileAndUpload({
          type: MongoImageTypeEnum.datasetAvatar,
          file,
          maxW: 300,
          maxH: 300
        });
        setValue('avatar', src);
      } catch (err: any) {
        toast({
          title: getErrText(err, t('common.avatar.Select Failed')),
          status: 'warning'
        });
      }
    },
    [setValue, t, toast]
  );

  /* create a new kb and router to it */
  const { mutate: onclickCreate, isLoading: creating } = useRequest({
    mutationFn: async (data: CreateDatasetParams) => {
      const id = await postCreateDataset(data);
      return id;
    },
    successToast: t('common.Create Success'),
    errorToast: t('common.Create Failed'),
    onSuccess(id) {
      router.push(`/dataset/detail?datasetId=${id}`);
    }
  });

  const onSelectDatasetType = useCallback(
    (e: DatasetTypeEnum) => {
      if (
        !feConfigs?.isPlus &&
        (e === DatasetTypeEnum.websiteDataset || e === DatasetTypeEnum.externalFile)
      ) {
        return toast({
          status: 'warning',
          title: t('common.system.Commercial version function')
        });
      }
      setValue('type', e);
    },
    [feConfigs?.isPlus, setValue, t, toast]
  );

  return (
    <MyModal
      iconSrc="/imgs/workflow/db.png"
      title={t('core.dataset.Create dataset')}
      isOpen
      onClose={onClose}
      isCentered={!isPc}
      w={'450px'}
    >
      <ModalBody py={2}>
        <>
          <Box mb={1} color={'myGray.900'}>
            {t('core.dataset.Dataset Type')}
          </Box>
          <MyRadio
            gridGap={2}
            gridTemplateColumns={'repeat(1,1fr)'}
            list={[
              {
                title: datasetT('Common Dataset'),
                value: DatasetTypeEnum.dataset,
                icon: 'core/dataset/commonDataset',
                desc: datasetT('Common Dataset Desc')
              },
              {
                title: datasetT('Website Dataset'),
                value: DatasetTypeEnum.websiteDataset,
                icon: 'core/dataset/websiteDataset',
                desc: datasetT('Website Dataset Desc')
              },
              {
                title: datasetT('External File'),
                value: DatasetTypeEnum.externalFile,
                icon: 'core/dataset/externalDataset',
                desc: datasetT('External file Dataset Desc')
              }
            ]}
            value={datasetType}
            onChange={onSelectDatasetType}
          />
        </>
        <Box mt={5}>
          <Box color={'myGray.900'}>{t('common.Set Name')}</Box>
          <Flex mt={1} alignItems={'center'}>
            <MyTooltip label={t('common.avatar.Select Avatar')}>
              <Avatar
                flexShrink={0}
                src={avatar}
                w={['28px', '32px']}
                h={['28px', '32px']}
                cursor={'pointer'}
                borderRadius={'md'}
                onClick={onOpenSelectFile}
              />
            </MyTooltip>
            <Input
              ml={3}
              flex={1}
              autoFocus
              bg={'myWhite.600'}
              placeholder={t('common.Name')}
              maxLength={30}
              {...register('name', {
                required: true
              })}
            />
          </Flex>
        </Box>
        {filterNotHiddenVectorModelList.length > 1 && (
          <Flex mt={6} alignItems={'center'}>
            <Flex alignItems={'center'} flex={'0 0 100px'} fontSize={'sm'}>
              {t('core.ai.model.Vector Model')}
              <QuestionTip label={t('core.dataset.embedding model tip')} />
            </Flex>
            <Box flex={1}>
              <AIModelSelector
                w={'100%'}
                value={vectorModel}
                list={filterNotHiddenVectorModelList.map((item) => ({
                  label: item.name,
                  value: item.model
                }))}
                onchange={(e) => {
                  setValue('vectorModel', e);
                }}
              />
            </Box>
          </Flex>
        )}
        {datasetModelList.length > 1 && (
          <Flex mt={6} alignItems={'center'}>
            <Box flex={'0 0 100px'} fontSize={'sm'}>
              {t('core.ai.model.Dataset Agent Model')}
            </Box>
            <Box flex={1}>
              <AIModelSelector
                w={'100%'}
                value={agentModel}
                list={datasetModelList.map((item) => ({
                  label: item.name,
                  value: item.model
                }))}
                onchange={(e) => {
                  setValue('agentModel', e);
                }}
              />
            </Box>
          </Flex>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button isLoading={creating} onClick={handleSubmit((data) => onclickCreate(data))}>
          {t('common.Confirm Create')}
        </Button>
      </ModalFooter>

      <File onSelect={onSelectFile} />
    </MyModal>
  );
};

export default CreateModal;
