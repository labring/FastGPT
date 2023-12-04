import React, { useCallback, useState } from 'react';
import { Box, Flex, Button, ModalFooter, ModalBody, Input } from '@chakra-ui/react';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useForm } from 'react-hook-form';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@/web/common/hooks/useToast';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest } from '@/web/common/hooks/useRequest';
import Avatar from '@/components/Avatar';
import MyTooltip from '@/components/MyTooltip';
import MyModal from '@/components/MyModal';
import { postCreateDataset } from '@/web/core/dataset/api';
import type { CreateDatasetParams } from '@/global/core/dataset/api.d';
import MySelect from '@/components/Select';
import { vectorModelList, qaModelList } from '@/web/common/system/staticData';
import { useTranslation } from 'next-i18next';
import MyRadio from '@/components/common/MyRadio';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { feConfigs } from '@/web/common/system/staticData';

const CreateModal = ({ onClose, parentId }: { onClose: () => void; parentId?: string }) => {
  const { t } = useTranslation();
  const [refresh, setRefresh] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const { isPc } = useSystemStore();
  const { register, setValue, getValues, handleSubmit } = useForm<CreateDatasetParams>({
    defaultValues: {
      parentId,
      type: DatasetTypeEnum.dataset,
      avatar: '/icon/logo.svg',
      name: '',
      intro: '',
      vectorModel: vectorModelList[0].model,
      agentModel: qaModelList[0].model
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
          file,
          maxW: 300,
          maxH: 300
        });
        setValue('avatar', src);
        setRefresh((state) => !state);
      } catch (err: any) {
        toast({
          title: getErrText(err, '头像选择异常'),
          status: 'warning'
        });
      }
    },
    [setValue, toast]
  );

  /* create a new kb and router to it */
  const { mutate: onclickCreate, isLoading: creating } = useRequest({
    mutationFn: async (data: CreateDatasetParams) => {
      const id = await postCreateDataset(data);
      return id;
    },
    successToast: '创建成功',
    errorToast: '创建知识库出现意外',
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
            取个名字
          </Box>
          <Flex mt={1} alignItems={'center'}>
            <MyTooltip label={'点击设置头像'}>
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
                required: '知识库名称不能为空~'
              })}
            />
          </Flex>
        </Box>
        <Flex mt={6} alignItems={'center'}>
          <Box flex={'0 0 100px'}>索引模型</Box>
          <Box flex={1}>
            <MySelect
              w={'100%'}
              value={getValues('vectorModel')}
              list={vectorModelList.map((item) => ({
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
        <Flex mt={6} alignItems={'center'}>
          <Box flex={'0 0 100px'}>{t('dataset.Agent Model')}</Box>
          <Box flex={1}>
            <MySelect
              w={'100%'}
              value={getValues('agentModel')}
              list={qaModelList.map((item) => ({
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
      </ModalBody>

      <ModalFooter>
        <Button variant={'base'} mr={3} onClick={onClose}>
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
