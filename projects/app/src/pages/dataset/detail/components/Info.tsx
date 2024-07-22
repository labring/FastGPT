import React from 'react';
import { useRouter } from 'next/router';
import { Box, Flex, Button, IconButton, Input, Textarea, HStack } from '@chakra-ui/react';
import { DeleteIcon } from '@chakra-ui/icons';
import { delDatasetById } from '@/web/core/dataset/api';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useForm } from 'react-hook-form';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import type { DatasetItemType } from '@fastgpt/global/core/dataset/type.d';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { postRebuildEmbedding } from '@/web/core/dataset/api';
import { useI18n } from '@/web/context/I18n';
import type { VectorModelItemType } from '@fastgpt/global/core/ai/model.d';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import MyDivider from '@fastgpt/web/components/common/MyDivider/index';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import DefaultPermissionList from '@/components/support/permission/DefaultPerList';
import {
  DatasetDefaultPermissionVal,
  DatasetPermissionList
} from '@fastgpt/global/support/permission/dataset/constant';
import MemberManager from '../../component/MemberManager';
import {
  getCollaboratorList,
  postUpdateDatasetCollaborators,
  deleteDatasetCollaborators
} from '@/web/core/dataset/api/collaborator';

const Info = ({ datasetId }: { datasetId: string }) => {
  const { t } = useTranslation();
  const { datasetT, commonT } = useI18n();
  const { datasetDetail, loadDatasetDetail, updateDataset, rebuildingCount, trainingCount } =
    useContextSelector(DatasetPageContext, (v) => v);

  const refetchDatasetTraining = useContextSelector(
    DatasetPageContext,
    (v) => v.refetchDatasetTraining
  );

  const { setValue, register, handleSubmit, watch } = useForm<DatasetItemType>({
    defaultValues: datasetDetail
  });

  const avatar = watch('avatar');
  const vectorModel = watch('vectorModel');
  const agentModel = watch('agentModel');
  const defaultPermission = watch('defaultPermission');

  const { datasetModelList, vectorModelList } = useSystemStore();

  const router = useRouter();

  const { openConfirm: onOpenConfirmDel, ConfirmModal: ConfirmDelModal } = useConfirm({
    content: t('common:core.dataset.Delete Confirm'),
    type: 'delete'
  });
  const { openConfirm: onOpenConfirmRebuild, ConfirmModal: ConfirmRebuildModal } = useConfirm({
    title: t('common:common.confirm.Common Tip'),
    content: datasetT('confirm_to_rebuild_embedding_tip'),
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
    successToast: t('common:common.Delete Success'),
    errorToast: t('common:common.Delete Failed')
  });

  const { mutate: onclickSave, isLoading: isSaving } = useRequest({
    mutationFn: (data: DatasetItemType) => {
      return updateDataset({
        id: datasetId,
        ...data
      });
    },
    successToast: t('common:common.Update Success'),
    errorToast: t('common:common.Update Failed')
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
      }
    },
    errorToast: t('common:common.avatar.Select Failed')
  });

  const { mutate: onRebuilding, isLoading: isRebuilding } = useRequest({
    mutationFn: (vectorModel: VectorModelItemType) => {
      return postRebuildEmbedding({
        datasetId,
        vectorModel: vectorModel.model
      });
    },
    onSuccess() {
      refetchDatasetTraining();
      loadDatasetDetail(datasetId);
    },
    successToast: datasetT('rebuild_embedding_start_tip'),
    errorToast: t('common:common.Update Failed')
  });

  const btnLoading = isSelecting || isDeleting || isSaving || isRebuilding;

  return (
    <Box py={5} px={[5, 10]}>
      <Flex mt={5} w={'100%'} alignItems={'center'}>
        <FormLabel flex={['0 0 90px', '0 0 160px']} w={0}>
          {t('common:core.dataset.Dataset ID')}
        </FormLabel>
        <Box flex={1}>{datasetDetail._id}</Box>
      </Flex>
      <Flex mt={8} w={'100%'} alignItems={'center'} flexWrap={'wrap'}>
        <FormLabel flex={['0 0 90px', '0 0 160px']} w={0}>
          {t('common:core.ai.model.Vector Model')}
        </FormLabel>
        <Box flex={[1, '0 0 320px']}>
          <AIModelSelector
            w={'100%'}
            value={vectorModel.model}
            disableTip={
              rebuildingCount > 0 || trainingCount > 0
                ? datasetT('the_knowledge_base_has_indexes_that_are_being_trained_or_being_rebuilt')
                : undefined
            }
            list={vectorModelList.map((item) => ({
              label: item.name,
              value: item.model
            }))}
            onchange={(e) => {
              const vectorModel = vectorModelList.find((item) => item.model === e);
              if (!vectorModel) return;
              onOpenConfirmRebuild(() => {
                setValue('vectorModel', vectorModel);
                onRebuilding(vectorModel);
              })();
            }}
          />
        </Box>
      </Flex>
      <Flex mt={8} w={'100%'} alignItems={'center'}>
        <FormLabel flex={['0 0 90px', '0 0 160px']} w={0}>
          {t('common:core.Max Token')}
        </FormLabel>
        <Box flex={[1, '0 0 320px']}>{vectorModel.maxToken}</Box>
      </Flex>
      <Flex mt={6} alignItems={'center'} flexWrap={'wrap'}>
        <FormLabel flex={['0 0 90px', '0 0 160px']} w={0}>
          {t('common:core.ai.model.Dataset Agent Model')}
        </FormLabel>
        <Box flex={[1, '0 0 320px']}>
          <AIModelSelector
            w={'100%'}
            value={agentModel.model}
            list={datasetModelList.map((item) => ({
              label: item.name,
              value: item.model
            }))}
            onchange={(e) => {
              const agentModel = datasetModelList.find((item) => item.model === e);
              if (!agentModel) return;
              setValue('agentModel', agentModel);
            }}
          />
        </Box>
      </Flex>

      <MyDivider my={6} h={'2px'} maxW={'500px'} />

      {datasetDetail.type === DatasetTypeEnum.externalFile && (
        <>
          <Flex w={'100%'} alignItems={'center'}>
            <FormLabel
              display={'flex'}
              flex={['0 0 90px', '0 0 160px']}
              w={0}
              gap={1}
              alignItems={'center'}
            >
              <Box>{datasetT('external_read_url')}</Box>
              <QuestionTip label={datasetT('external_read_url_tip')} />
            </FormLabel>
            <Input
              flex={[1, '0 0 320px']}
              placeholder="https://test.com/read?fileId={{fileId}}"
              {...register('externalReadUrl')}
            />
          </Flex>
          <MyDivider my={6} h={'2px'} maxW={'500px'} />
        </>
      )}

      <Flex mt={5} w={'100%'} alignItems={'center'}>
        <FormLabel flex={['0 0 90px', '0 0 160px']} w={0}>
          {t('common:core.dataset.Avatar')}
        </FormLabel>
        <Box flex={[1, '0 0 320px']}>
          <MyTooltip label={t('common:common.avatar.Select Avatar')}>
            <Avatar
              m={'auto'}
              src={avatar}
              w={['32px', '40px']}
              h={['32px', '40px']}
              cursor={'pointer'}
              onClick={onOpenSelectFile}
            />
          </MyTooltip>
        </Box>
      </Flex>
      <Flex mt={8} w={'100%'} alignItems={'center'}>
        <FormLabel flex={['0 0 90px', '0 0 160px']} w={0}>
          {t('common:core.dataset.Name')}
        </FormLabel>
        <Input flex={[1, '0 0 320px']} maxLength={30} {...register('name')} />
      </Flex>
      <Flex mt={8} alignItems={'center'} w={'100%'}>
        <FormLabel flex={['0 0 90px', '0 0 160px']}>{t('common:common.Intro')}</FormLabel>
        <Textarea
          flex={[1, '0 0 320px']}
          {...register('intro')}
          placeholder={t('common:common.Intro')}
        />
      </Flex>

      {datasetDetail.permission.hasManagePer && (
        <>
          <MyDivider my={6} h={'2px'} maxW={'500px'} />

          <Flex mt={5} alignItems={'center'} w={'100%'} flexWrap={'wrap'} maxW="500px">
            <FormLabel flex={['0 0 90px', '0 0 160px']} w={0}>
              {commonT('permission.Default permission')}
            </FormLabel>
            <DefaultPermissionList
              w="320px"
              per={defaultPermission}
              defaultPer={DatasetDefaultPermissionVal}
              onChange={(v) => setValue('defaultPermission', v)}
            />
          </Flex>

          <Flex mt={5} alignItems={'center'} w={'100%'} flexWrap={'wrap'} maxW="500px">
            <FormLabel flex={['0 0 90px', '0 0 160px']} w={0}>
              {commonT('permission.Collaborator')}
            </FormLabel>
            <Box flex={1}>
              <MemberManager
                managePer={{
                  permission: datasetDetail.permission,
                  onGetCollaboratorList: () => getCollaboratorList(datasetId),
                  permissionList: DatasetPermissionList,
                  onUpdateCollaborators: (body) =>
                    postUpdateDatasetCollaborators({
                      ...body,
                      datasetId
                    }),
                  onDelOneCollaborator: (tmbId) =>
                    deleteDatasetCollaborators({
                      datasetId,
                      tmbId
                    })
                }}
              />
            </Box>
          </Flex>
        </>
      )}

      <Flex mt={5} w={'100%'} alignItems={'flex-end'}>
        <Box flex={['0 0 90px', '0 0 160px']} w={0}></Box>
        <Button
          isLoading={btnLoading}
          mr={4}
          w={'100px'}
          onClick={handleSubmit((data) => onclickSave(data))}
        >
          {t('common:common.Save')}
        </Button>
        {datasetDetail.permission.isOwner && (
          <IconButton
            isLoading={btnLoading}
            icon={<DeleteIcon />}
            aria-label={''}
            variant={'whiteDanger'}
            size={'smSquare'}
            onClick={onOpenConfirmDel(onclickDelete)}
          />
        )}
      </Flex>

      <File onSelect={onSelectFile} />
      <ConfirmDelModal />
      <ConfirmRebuildModal countDown={10} />
    </Box>
  );
};

export default React.memo(Info);
