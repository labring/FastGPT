import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { Box, Flex, Button, IconButton, Input, Textarea } from '@chakra-ui/react';
import { DeleteIcon } from '@chakra-ui/icons';
import { delDatasetById } from '@/web/core/dataset/api';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { useForm } from 'react-hook-form';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import type { DatasetItemType } from '@fastgpt/global/core/dataset/type.d';
import Avatar from '@/components/Avatar';
import MyTooltip from '@/components/MyTooltip';
import { useTranslation } from 'next-i18next';
import PermissionRadio from '@/components/support/permission/Radio';
import MySelect from '@/components/Select';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest } from '@/web/common/hooks/useRequest';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';

const Info = ({ datasetId }: { datasetId: string }) => {
  const { t } = useTranslation();
  const { datasetDetail, loadDatasets, updateDataset } = useDatasetStore();
  const { getValues, setValue, register, handleSubmit } = useForm<DatasetItemType>({
    defaultValues: datasetDetail
  });
  const { datasetModelList, vectorModelList } = useSystemStore();

  const router = useRouter();

  const [refresh, setRefresh] = useState(false);

  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('core.dataset.Delete Confirm'),
    type: 'delete'
  });

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  /* 点击删除 */
  const { mutate: onclickDelete, isLoading: isDeleting } = useRequest({
    mutationFn: () => {
      return delDatasetById(datasetId);
    },
    onSuccess() {
      router.replace(`/dataset/list`);
    },
    successToast: t('common.Delete Success'),
    errorToast: t('common.Delete Failed')
  });

  const { mutate: onclickSave, isLoading: isSaving } = useRequest({
    mutationFn: (data: DatasetItemType) => {
      return updateDataset({
        id: datasetId,
        ...data
      });
    },
    onSuccess() {
      loadDatasets();
    },
    successToast: t('common.Update Success'),
    errorToast: t('common.Update Failed')
  });

  const { mutate: onSelectFile, isLoading: isSelecting } = useRequest({
    mutationFn: (e: File[]) => {
      const file = e[0];
      if (!file) return Promise.resolve(null);
      return compressImgFileAndUpload({
        type: MongoImageTypeEnum.datasetAvatar,
        file,
        maxW: 300,
        maxH: 300
      });
    },
    onSuccess(src: string | null) {
      if (src) {
        setValue('avatar', src);
        setRefresh((state) => !state);
      }
    },
    errorToast: t('common.avatar.Select Failed')
  });

  const btnLoading = useMemo(() => isDeleting || isSaving, [isDeleting, isSaving]);

  return (
    <Box py={5} px={[5, 10]}>
      <Flex mt={5} w={'100%'} alignItems={'center'}>
        <Box flex={['0 0 90px', '0 0 160px']} w={0}>
          {t('core.dataset.Dataset ID')}
        </Box>
        <Box flex={1}>{datasetDetail._id}</Box>
      </Flex>

      <Flex mt={5} w={'100%'} alignItems={'center'}>
        <Box flex={['0 0 90px', '0 0 160px']} w={0}>
          {t('core.dataset.Avatar')}
        </Box>
        <Box flex={[1, '0 0 300px']}>
          <MyTooltip label={t('common.avatar.Select Avatar')}>
            <Avatar
              m={'auto'}
              src={getValues('avatar')}
              w={['32px', '40px']}
              h={['32px', '40px']}
              cursor={'pointer'}
              onClick={onOpenSelectFile}
            />
          </MyTooltip>
        </Box>
      </Flex>
      <Flex mt={8} w={'100%'} alignItems={'center'}>
        <Box flex={['0 0 90px', '0 0 160px']} w={0}>
          {t('core.dataset.Name')}
        </Box>
        <Input flex={[1, '0 0 300px']} maxLength={30} {...register('name')} />
      </Flex>
      <Flex mt={8} w={'100%'} alignItems={'center'}>
        <Box flex={['0 0 90px', '0 0 160px']} w={0}>
          {t('core.ai.model.Vector Model')}
        </Box>
        <Box flex={[1, '0 0 300px']}>{getValues('vectorModel').name}</Box>
      </Flex>
      <Flex mt={8} w={'100%'} alignItems={'center'}>
        <Box flex={['0 0 90px', '0 0 160px']} w={0}>
          {t('core.Max Token')}
        </Box>
        <Box flex={[1, '0 0 300px']}>{getValues('vectorModel').maxToken}</Box>
      </Flex>
      <Flex mt={6} alignItems={'center'}>
        <Box flex={['0 0 90px', '0 0 160px']} w={0}>
          {t('core.ai.model.Dataset Agent Model')}
        </Box>
        <Box flex={[1, '0 0 300px']}>
          <MySelect
            w={'100%'}
            value={getValues('agentModel').model}
            list={datasetModelList.map((item) => ({
              label: item.name,
              value: item.model
            }))}
            onchange={(e) => {
              const agentModel = datasetModelList.find((item) => item.model === e);
              if (!agentModel) return;
              setValue('agentModel', agentModel);
              setRefresh((state) => !state);
            }}
          />
        </Box>
      </Flex>

      <Flex mt={8} alignItems={'center'} w={'100%'}>
        <Box flex={['0 0 90px', '0 0 160px']}>{t('common.Intro')}</Box>
        <Textarea flex={[1, '0 0 300px']} {...register('intro')} placeholder={t('common.Intro')} />
      </Flex>
      {datasetDetail.isOwner && (
        <Flex mt={5} alignItems={'center'} w={'100%'} flexWrap={'wrap'}>
          <Box flex={['0 0 90px', '0 0 160px']} w={0}>
            {t('user.Permission')}
          </Box>
          <Box>
            <PermissionRadio
              value={getValues('permission')}
              onChange={(e) => {
                setValue('permission', e);
                setRefresh(!refresh);
              }}
            />
          </Box>
        </Flex>
      )}

      <Flex mt={5} w={'100%'} alignItems={'flex-end'}>
        <Box flex={['0 0 90px', '0 0 160px']} w={0}></Box>
        <Button
          isLoading={btnLoading}
          mr={4}
          w={'100px'}
          onClick={handleSubmit((data) => onclickSave(data))}
        >
          {t('common.Save')}
        </Button>
        {datasetDetail.isOwner && (
          <IconButton
            isLoading={btnLoading}
            icon={<DeleteIcon />}
            aria-label={''}
            variant={'whiteDanger'}
            size={'smSquare'}
            onClick={openConfirm(onclickDelete)}
          />
        )}
      </Flex>
      <File onSelect={onSelectFile} />
      <ConfirmModal />
    </Box>
  );
};

export default React.memo(Info);
