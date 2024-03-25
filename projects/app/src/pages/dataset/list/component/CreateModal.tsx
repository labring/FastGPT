import React, { useCallback, useState } from 'react';
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
import MyTooltip from '@/components/MyTooltip';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { postCreateDataset } from '@/web/core/dataset/api';
import type { CreateDatasetParams } from '@/global/core/dataset/api.d';
import { useTranslation } from 'next-i18next';
import MyRadio from '@/components/common/MyRadio';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import MySelect from '@fastgpt/web/components/common/MySelect';
import AIModelSelector from '@/components/Select/AIModelSelector';

const CreateModal = ({ onClose, parentId }: { onClose: () => void; parentId?: string }) => {
  const { t } = useTranslation();
  const [refresh, setRefresh] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const { isPc, feConfigs, vectorModelList, datasetModelList } = useSystemStore();

  const filterNotHiddenVectorModelList = vectorModelList.filter((item) => !item.hidden);

  const { register, setValue, getValues, handleSubmit } = useForm<CreateDatasetParams>({
    defaultValues: {
      parentId,
      type: DatasetTypeEnum.dataset,
      avatar: '/icon/logo.svg',
      name: '',
      intro: '',
      vectorModel: filterNotHiddenVectorModelList[0].model,
      agentModel: datasetModelList[0].model
    }
  });

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
        setRefresh((state) => !state);
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

  return (
    <MyModal
      iconSrc="/imgs/module/db.png"
      title={t('core.dataset.Create dataset')}
      isOpen
      onClose={onClose}
      isCentered={!isPc}
      w={'450px'}
    >
      <ModalBody>
        <>
          <Box mb={1} color={'myGray.800'} fontWeight={'bold'}>
            {t('core.dataset.Dataset Type')}
          </Box>
          <MyRadio
            gridGap={2}
            gridTemplateColumns={'repeat(1,1fr)'}
            list={[
              {
                title: t('core.dataset.Common Dataset'),
                value: DatasetTypeEnum.dataset,
                icon: 'core/dataset/commonDataset',
                desc: t('core.dataset.Common Dataset Desc')
              },
              ...(feConfigs.isPlus
                ? [
                    {
                      title: t('core.dataset.Website Dataset'),
                      value: DatasetTypeEnum.websiteDataset,
                      icon: 'core/dataset/websiteDataset',
                      desc: t('core.dataset.Website Dataset Desc')
                    }
                  ]
                : [])
            ]}
            value={getValues('type')}
            onChange={(e) => {
              setValue('type', e as `${DatasetTypeEnum}`);
              setRefresh(!refresh);
            }}
          />
        </>
        <Box mt={5}>
          <Box color={'myGray.800'} fontWeight={'bold'}>
            {t('common.Set Name')}
          </Box>
          <Flex mt={1} alignItems={'center'}>
            <MyTooltip label={t('common.avatar.Select Avatar')}>
              <Avatar
                flexShrink={0}
                src={getValues('avatar')}
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
            <Flex alignItems={'center'} flex={'0 0 100px'}>
              {t('core.ai.model.Vector Model')}
              <MyTooltip label={t('core.dataset.embedding model tip')}>
                <QuestionOutlineIcon ml={1} />
              </MyTooltip>
            </Flex>
            <Box flex={1}>
              <AIModelSelector
                w={'100%'}
                value={getValues('vectorModel')}
                list={filterNotHiddenVectorModelList.map((item) => ({
                  label: item.name,
                  value: item.model
                }))}
                onchange={(e) => {
                  setValue('vectorModel', e);
                  setRefresh((state) => !state);
                }}
              />
            </Box>
          </Flex>
        )}
        {datasetModelList.length > 1 && (
          <Flex mt={6} alignItems={'center'}>
            <Box flex={'0 0 100px'}>{t('core.ai.model.Dataset Agent Model')}</Box>
            <Box flex={1}>
              <AIModelSelector
                w={'100%'}
                value={getValues('agentModel')}
                list={datasetModelList.map((item) => ({
                  label: item.name,
                  value: item.model
                }))}
                onchange={(e) => {
                  setValue('agentModel', e);
                  setRefresh((state) => !state);
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
