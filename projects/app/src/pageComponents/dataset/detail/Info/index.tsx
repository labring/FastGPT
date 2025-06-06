import React, { useEffect, useMemo, useState } from 'react';
import { Box, Flex, Switch, Input } from '@chakra-ui/react';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useForm } from 'react-hook-form';
import type { DatasetItemType } from '@fastgpt/global/core/dataset/type.d';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { postRebuildEmbedding } from '@/web/core/dataset/api';
import type { EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.d';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import MyDivider from '@fastgpt/web/components/common/MyDivider/index';
import { DatasetTypeEnum, DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { DatasetPermissionList } from '@fastgpt/global/support/permission/dataset/constant';
import MemberManager from '../../MemberManager';
import {
  getCollaboratorList,
  postUpdateDatasetCollaborators,
  deleteDatasetCollaborators
} from '@/web/core/dataset/api/collaborator';
import DatasetTypeTag from '@/components/core/dataset/DatasetTypeTag';
import dynamic from 'next/dynamic';
import type { EditAPIDatasetInfoFormType } from './components/EditApiServiceModal';
import { type EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));
const EditAPIDatasetInfoModal = dynamic(() => import('./components/EditApiServiceModal'));

const Info = ({ datasetId }: { datasetId: string }) => {
  const { t } = useTranslation();
  const { datasetDetail, loadDatasetDetail, updateDataset, rebuildingCount, trainingCount } =
    useContextSelector(DatasetPageContext, (v) => v);
  const { feConfigs, datasetModelList, embeddingModelList, getVlmModelList } = useSystemStore();

  const [editedDataset, setEditedDataset] = useState<EditResourceInfoFormType>();
  const [editedAPIDataset, setEditedAPIDataset] = useState<EditAPIDatasetInfoFormType>();
  const refetchDatasetTraining = useContextSelector(
    DatasetPageContext,
    (v) => v.refetchDatasetTraining
  );
  const { setValue, register, handleSubmit, watch, reset } = useForm<DatasetItemType>({
    defaultValues: datasetDetail
  });

  const vectorModel = watch('vectorModel');
  const agentModel = watch('agentModel');

  const vllmModelList = useMemo(() => getVlmModelList(), [getVlmModelList]);
  const vlmModel = watch('vlmModel');

  const { openConfirm: onOpenConfirmRebuild, ConfirmModal: ConfirmRebuildModal } = useConfirm({
    title: t('common:action_confirm'),
    content: t('dataset:confirm_to_rebuild_embedding_tip'),
    type: 'delete'
  });
  const { openConfirm: onOpenConfirmSyncSchedule, ConfirmModal: ConfirmSyncScheduleModal } =
    useConfirm({
      title: t('common:action_confirm')
    });

  const { runAsync: onSave } = useRequest2(
    (data: DatasetItemType) => {
      return updateDataset({
        id: datasetId,
        agentModel: data.agentModel?.model,
        vlmModel: data.vlmModel?.model,
        externalReadUrl: data.externalReadUrl
      });
    },
    {
      successToast: t('common:update_success'),
      errorToast: t('common:update_failed')
    }
  );

  const { runAsync: onRebuilding } = useRequest2(
    (vectorModel: EmbeddingModelItemType) => {
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
      errorToast: t('common:update_failed')
    }
  );

  const { runAsync: onEditBaseInfo } = useRequest2(updateDataset, {
    onSuccess() {
      setEditedDataset(undefined);
    },
    successToast: t('common:update_success'),
    errorToast: t('common:update_failed')
  });

  useEffect(() => {
    reset(datasetDetail);
  }, [datasetDetail, datasetDetail._id, reset]);

  const isTraining = rebuildingCount > 0 || trainingCount > 0;

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

      <Box>
        <Flex w={'100%'} flexDir={'column'}>
          <FormLabel fontSize={'mini'} fontWeight={'500'}>
            {t('common:core.dataset.Dataset ID')}
          </FormLabel>
          <Box fontSize={'mini'}>{datasetDetail._id}</Box>
        </Flex>

        <Box mt={5} w={'100%'}>
          <Flex alignItems={'center'}>
            <FormLabel fontWeight={'500'} flex={'1 0 0'} fontSize={'mini'}>
              {t('common:core.ai.model.Vector Model')}
            </FormLabel>
            <MyTooltip label={t('dataset:vector_model_max_tokens_tip')}>
              <Box fontSize={'mini'}>
                {t('dataset:chunk_max_tokens')}: {vectorModel.maxToken}
              </Box>
            </MyTooltip>
          </Flex>
          <Box pt={2}>
            <AIModelSelector
              w={'100%'}
              value={vectorModel.model}
              fontSize={'mini'}
              disableTip={
                isTraining
                  ? t(
                      'dataset:the_knowledge_base_has_indexes_that_are_being_trained_or_being_rebuilt'
                    )
                  : undefined
              }
              list={embeddingModelList.map((item) => ({
                label: item.name,
                value: item.model
              }))}
              onChange={(e) => {
                const vectorModel = embeddingModelList.find((item) => item.model === e);
                if (!vectorModel) return;
                return onOpenConfirmRebuild(async () => {
                  await onRebuilding(vectorModel);
                  setValue('vectorModel', vectorModel);
                })();
              }}
            />
          </Box>
        </Box>

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
              onChange={(e) => {
                const agentModel = datasetModelList.find((item) => item.model === e);
                if (!agentModel) return;
                setValue('agentModel', agentModel);
                return handleSubmit((data) => onSave({ ...data, agentModel: agentModel }))();
              }}
            />
          </Box>
        </Box>

        <Box pt={5}>
          <FormLabel fontSize={'mini'} fontWeight={'500'}>
            {t('dataset:vllm_model')}
          </FormLabel>
          <Box pt={2}>
            <AIModelSelector
              w={'100%'}
              value={vlmModel?.model}
              list={vllmModelList.map((item) => ({
                label: item.name,
                value: item.model
              }))}
              fontSize={'mini'}
              onChange={(e) => {
                const vlmModel = vllmModelList.find((item) => item.model === e);
                if (!vlmModel) return;
                setValue('vlmModel', vlmModel);
                return handleSubmit((data) => onSave({ ...data, vlmModel }))();
              }}
            />
          </Box>
        </Box>

        {feConfigs?.isPlus && (
          <Flex alignItems={'center'} pt={5}>
            <FormLabel fontSize={'mini'} fontWeight={'500'}>
              {t('dataset:sync_schedule')}
            </FormLabel>
            <QuestionTip ml={1} label={t('dataset:sync_schedule_tip')} />
            <Box flex={1} />
            <Switch
              isChecked={!!datasetDetail.autoSync}
              onChange={(e) => {
                e.preventDefault();
                const autoSync = e.target.checked;
                const text = autoSync ? t('dataset:open_auto_sync') : t('dataset:close_auto_sync');

                onOpenConfirmSyncSchedule(
                  async () => {
                    return updateDataset({
                      id: datasetId,
                      autoSync
                    });
                  },
                  undefined,
                  text
                )();
              }}
            />
          </Flex>
        )}

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

        {datasetDetail.type === DatasetTypeEnum.apiDataset && (
          <>
            <Box w={'100%'} alignItems={'center'} pt={4}>
              <Flex justifyContent={'space-between'} mb={1}>
                <FormLabel fontSize={'mini'} fontWeight={'500'}>
                  {t('dataset:api_url')}
                </FormLabel>
                <MyIcon
                  name={'edit'}
                  w={'14px'}
                  _hover={{ color: 'primary.600' }}
                  cursor={'pointer'}
                  onClick={() =>
                    setEditedAPIDataset({
                      id: datasetDetail._id,
                      apiDatasetServer: datasetDetail.apiDatasetServer
                    })
                  }
                />
              </Flex>
              <Box fontSize={'mini'}>{datasetDetail.apiDatasetServer?.apiServer?.baseUrl}</Box>
            </Box>
          </>
        )}

        {datasetDetail.type === DatasetTypeEnum.yuque && (
          <>
            <Box w={'100%'} alignItems={'center'} pt={4}>
              <Flex justifyContent={'space-between'} mb={1}>
                <FormLabel fontSize={'mini'} fontWeight={'500'}>
                  {t('dataset:yuque_dataset_config')}
                </FormLabel>
                <MyIcon
                  name={'edit'}
                  w={'14px'}
                  _hover={{ color: 'primary.600' }}
                  cursor={'pointer'}
                  onClick={() =>
                    setEditedAPIDataset({
                      id: datasetDetail._id,
                      apiDatasetServer: datasetDetail.apiDatasetServer
                    })
                  }
                />
              </Flex>
              <Box fontSize={'mini'}>{datasetDetail.apiDatasetServer?.yuqueServer?.userId}</Box>
            </Box>
          </>
        )}

        {datasetDetail.type === DatasetTypeEnum.feishu && (
          <>
            <Box w={'100%'} alignItems={'center'} pt={4}>
              <Flex justifyContent={'space-between'} mb={1}>
                <FormLabel fontSize={'mini'} fontWeight={'500'}>
                  {t('dataset:feishu_dataset_config')}
                </FormLabel>
                <MyIcon
                  name={'edit'}
                  w={'14px'}
                  _hover={{ color: 'primary.600' }}
                  cursor={'pointer'}
                  onClick={() =>
                    setEditedAPIDataset({
                      id: datasetDetail._id,
                      apiDatasetServer: datasetDetail.apiDatasetServer
                    })
                  }
                />
              </Flex>
              <Box fontSize={'mini'}>
                {datasetDetail.apiDatasetServer?.feishuServer?.folderToken}
              </Box>
            </Box>
          </>
        )}
      </Box>

      {datasetDetail.permission.hasManagePer && (
        <>
          <MyDivider my={4} h={'2px'} maxW={'500px'} />
          <Box>
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
                onDelOneCollaborator: async ({ groupId, tmbId, orgId }) => {
                  if (tmbId) {
                    return deleteDatasetCollaborators({
                      datasetId,
                      tmbId
                    });
                  } else if (groupId) {
                    return deleteDatasetCollaborators({
                      datasetId,
                      groupId
                    });
                  } else if (orgId) {
                    return deleteDatasetCollaborators({
                      datasetId,
                      orgId
                    });
                  }
                }
              }}
            />
          </Box>
        </>
      )}

      <ConfirmRebuildModal countDown={10} />
      <ConfirmSyncScheduleModal />
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
      {editedAPIDataset && (
        <EditAPIDatasetInfoModal
          {...editedAPIDataset}
          title={t('dataset:edit_dataset_config')}
          onClose={() => setEditedAPIDataset(undefined)}
          onEdit={(data) =>
            updateDataset({
              id: datasetId,
              apiDatasetServer: data.apiDatasetServer
            })
          }
        />
      )}
    </Box>
  );
};

export default React.memo(Info);
