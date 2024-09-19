import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Flex, Input } from '@chakra-ui/react';
import { delDatasetById } from '@/web/core/dataset/api';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useForm } from 'react-hook-form';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import type { DatasetItemType } from '@fastgpt/global/core/dataset/type.d';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest, useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { postRebuildEmbedding } from '@/web/core/dataset/api';
import type { VectorModelItemType } from '@fastgpt/global/core/ai/model.d';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import MyDivider from '@fastgpt/web/components/common/MyDivider/index';
import { DatasetTypeEnum, DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import DefaultPermissionList from '@/components/support/permission/DefaultPerList';
import MyIcon from '@fastgpt/web/components/common/Icon';
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
import DatasetTypeTag from '@/components/core/dataset/DatasetTypeTag';
import dynamic from 'next/dynamic';
import { EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';
const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));

const Info = ({ datasetId }: { datasetId: string }) => {
  const router = useRouter();
  const [openBaseConfig, setOpenBaseConfig] = useState(true);
  const [openPermissionConfig, setOpenPermissionConfig] = useState(true);
  const { t } = useTranslation();
  const { datasetDetail, loadDatasetDetail, updateDataset, rebuildingCount, trainingCount } =
    useContextSelector(DatasetPageContext, (v) => v);
  const [editedDataset, setEditedDataset] = useState<EditResourceInfoFormType>();
  const refetchDatasetTraining = useContextSelector(
    DatasetPageContext,
    (v) => v.refetchDatasetTraining
  );
  const { setValue, register, handleSubmit, watch, reset } = useForm<DatasetItemType>({
    defaultValues: datasetDetail
  });

  const vectorModel = watch('vectorModel');
  const agentModel = watch('agentModel');
  const defaultPermission = watch('defaultPermission');

  const { datasetModelList, vectorModelList } = useSystemStore();
  const { openConfirm: onOpenConfirmDel, ConfirmModal: ConfirmDelModal } = useConfirm({
    content: t('common:core.dataset.Delete Confirm'),
    type: 'delete'
  });
  const { openConfirm: onOpenConfirmRebuild, ConfirmModal: ConfirmRebuildModal } = useConfirm({
    title: t('common:common.confirm.Common Tip'),
    content: t('dataset:confirm_to_rebuild_embedding_tip'),
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

  const { runAsync: onSave, loading: isSaving } = useRequest2(
    (data: DatasetItemType) => {
      return updateDataset({
        id: datasetId,
        agentModel: data.agentModel,
        externalReadUrl: data.externalReadUrl,
        defaultPermission: data.defaultPermission
      });
    },
    {
      successToast: t('common:common.Update Success'),
      errorToast: t('common:common.Update Failed')
    }
  );

  const { runAsync: onSelectFile, loading: isSelecting } = useRequest2(
    (e: File[]) => {
      const file = e[0];
      if (!file) return Promise.resolve(null);
      return compressImgFileAndUpload({
        type: MongoImageTypeEnum.datasetAvatar,
        file,
        maxW: 300,
        maxH: 300
      });
    },
    {
      onSuccess(src: string | null) {
        if (src) {
          setValue('avatar', src);
        }
      },
      errorToast: t('common:common.avatar.Select Failed')
    }
  );

  const { runAsync: onRebuilding, loading: isRebuilding } = useRequest2(
    (vectorModel: VectorModelItemType) => {
      return postRebuildEmbedding({
        datasetId,
        vectorModel: vectorModel.model
      });
    },
    {
      onSuccess() {
        refetchDatasetTraining();
        loadDatasetDetail(datasetId);
      },
      successToast: t('dataset:rebuild_embedding_start_tip'),
      errorToast: t('common:common.Update Failed')
    }
  );

  const { runAsync: onEditBaseInfo } = useRequest2(updateDataset, {
    onSuccess() {
      setEditedDataset(undefined);
    },
    successToast: t('common:common.Update Success'),
    errorToast: t('common:common.Update Failed')
  });

  useEffect(() => {
    reset(datasetDetail);
  }, [datasetDetail._id]);

  return (
    <Box w={'100%'} h={'100%'} p={6}>
      <Box>
        <Flex mb={2} alignItems={'center'}>
          <Avatar src={datasetDetail.avatar} w={'20px'} h={'20px'} borderRadius={'xs'} />
          <Box ml={1.5}>
            <Box fontWeight={'bold'} color={'myGray.900'}>
              {datasetDetail.name}
            </Box>
          </Box>
          <MyIcon
            pl={1.5}
            name={'edit'}
            _hover={{ color: 'primary.600' }}
            w={'0.875rem'}
            cursor={'pointer'}
            onClick={() =>
              setEditedDataset({
                id: datasetDetail._id,
                name: datasetDetail.name,
                avatar: datasetDetail.avatar,
                intro: datasetDetail.intro
              })
            }
          />
        </Flex>
        {DatasetTypeMap[datasetDetail.type] && (
          <Flex alignItems={'center'} justifyContent={'space-between'}>
            <DatasetTypeTag type={datasetDetail.type} />
          </Flex>
        )}
        <Box
          flex={1}
          className={'textEllipsis3'}
          pt={3}
          wordBreak={'break-all'}
          fontSize={'xs'}
          color={'myGray.500'}
        >
          {datasetDetail.intro || t('common:core.dataset.Intro Placeholder')}
        </Box>
      </Box>

      <MyDivider my={4} h={'2px'} maxW={'500px'} />

      <Box overflow={'hidden'} h={openBaseConfig ? 'auto' : '24px'}>
        <Flex justify={'space-between'} alignItems={'center'} fontSize={'mini'} h={'24px'}>
          <Box fontWeight={'500'} color={'myGray.900'} userSelect={'none'}>
            {t('common:common.base_config')}
          </Box>
          <MyIcon
            w={'16px'}
            _hover={{ color: 'primary.500', cursor: 'pointer' }}
            color={'myGray.500'}
            name={openBaseConfig ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
            onClick={(e) => {
              e.preventDefault();
              setOpenBaseConfig(!openBaseConfig);
            }}
          />
        </Flex>
        <Flex mt={3} w={'100%'} flexDir={'column'} userSelect={'none'}>
          <FormLabel fontSize={'mini'} fontWeight={'500'}>
            {t('common:core.dataset.Dataset ID')}
          </FormLabel>
          <Box fontSize={'mini'}>{datasetDetail._id}</Box>
        </Flex>

        <Box mt={5} w={'100%'}>
          <FormLabel fontSize={'mini'} fontWeight={'500'}>
            {t('common:core.ai.model.Vector Model')}
          </FormLabel>
          <Box pt={2} flex={[1, '0 0 320px']}>
            <AIModelSelector
              w={'100%'}
              value={vectorModel.model}
              fontSize={'mini'}
              disableTip={
                rebuildingCount > 0 || trainingCount > 0
                  ? t(
                      'dataset:the_knowledge_base_has_indexes_that_are_being_trained_or_being_rebuilt'
                    )
                  : undefined
              }
              list={vectorModelList.map((item) => ({
                label: item.name,
                value: item.model
              }))}
              onchange={(e) => {
                const vectorModel = vectorModelList.find((item) => item.model === e);
                if (!vectorModel) return;
                return onOpenConfirmRebuild(() => {
                  return onRebuilding(vectorModel).then(() => {
                    setValue('vectorModel', vectorModel);
                  });
                })();
              }}
            />
          </Box>
        </Box>

        <Flex mt={2} w={'100%'} alignItems={'center'}>
          <FormLabel flex={['0 0 90px', '0 0 160px']} fontSize={'mini'} w={0} fontWeight={'500'}>
            {t('common:core.Max Token')}
          </FormLabel>
          <Box flex={[1, '0 0 320px']} fontSize={'mini'}>
            {vectorModel.maxToken}
          </Box>
        </Flex>

        <Box pt={5}>
          <FormLabel fontSize={'mini'} fontWeight={'500'}>
            {t('common:core.ai.model.Dataset Agent Model')}
          </FormLabel>
          <Box pt={2}>
            <AIModelSelector
              w={'100%'}
              value={agentModel.model}
              list={datasetModelList.map((item) => ({
                label: item.name,
                value: item.model
              }))}
              fontSize={'mini'}
              onchange={(e) => {
                const agentModel = datasetModelList.find((item) => item.model === e);
                if (!agentModel) return;
                setValue('agentModel', agentModel);
                return handleSubmit((data) => onSave({ ...data, agentModel: agentModel }))();
              }}
            />
          </Box>
        </Box>

        {/* <MyDivider my={4} h={'2px'} maxW={'500px'} /> */}

        {datasetDetail.type === DatasetTypeEnum.externalFile && (
          <>
            <Box w={'100%'} alignItems={'center'} pt={4}>
              <FormLabel display={'flex'} pb={2} fontSize={'mini'} fontWeight={'500'}>
                <Box>{t('dataset:external_read_url')}</Box>
                <QuestionTip label={t('dataset:external_read_url_tip')} />
              </FormLabel>
              <Input
                fontSize={'mini'}
                flex={[1, '0 0 320px']}
                placeholder="https://test.com/read?fileId={{fileId}}"
                {...register('externalReadUrl')}
                onBlur={handleSubmit((data) => onSave(data))}
              />
            </Box>
          </>
        )}
      </Box>

      {datasetDetail.permission.hasManagePer && (
        <>
          <MyDivider my={4} h={'2px'} maxW={'500px'} />
          <Box overflow={'hidden'} h={openPermissionConfig ? 'auto' : '24px'}>
            <Flex justify={'space-between'} alignItems={'center'} fontSize={'mini'} h={'24px'}>
              <Box fontWeight={'500'} color={'myGray.900'} userSelect={'none'}>
                {t('common:permission.Permission config')}
              </Box>
              <MyIcon
                w={'16px'}
                _hover={{ color: 'primary.500', cursor: 'pointer' }}
                color={'myGray.500'}
                name={openPermissionConfig ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
                onClick={() => setOpenPermissionConfig(!openPermissionConfig)}
              />
            </Flex>

            <Box mt={3}>
              <FormLabel fontWeight={'500'} fontSize={'mini'} pb={3} userSelect={'none'}>
                {t('common:permission.Default permission')}
              </FormLabel>
              <DefaultPermissionList
                fontSize={'mini'}
                per={defaultPermission}
                defaultPer={DatasetDefaultPermissionVal}
                onChange={(v) => {
                  setValue('defaultPermission', v);
                  return handleSubmit((data) => onSave({ ...data, defaultPermission: v }))();
                }}
              />
            </Box>

            <Box py={4}>
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
          </Box>
        </>
      )}

      <File onSelect={onSelectFile} />
      <ConfirmDelModal />
      <ConfirmRebuildModal countDown={10} />
      {editedDataset && (
        <EditResourceModal
          {...editedDataset}
          title={t('common:dataset.Edit Info')}
          onClose={() => setEditedDataset(undefined)}
          onEdit={(data) =>
            onEditBaseInfo({
              id: editedDataset.id,
              name: data.name,
              intro: data.intro,
              avatar: data.avatar
            })
          }
        />
      )}
    </Box>
  );
};

export default React.memo(Info);
