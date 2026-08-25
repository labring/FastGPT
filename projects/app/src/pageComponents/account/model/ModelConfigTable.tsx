import {
  Box,
  Flex,
  HStack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Switch,
  ModalBody,
  ModalFooter,
  Button,
  useDisclosure
} from '@chakra-ui/react';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React, { useCallback, useMemo, useState } from 'react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { modelTypeList, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import dynamic from 'next/dynamic';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import {
  deleteSystemModel,
  getModelCollaborators,
  getModelConfigJson,
  getSystemDefault,
  getModelDetail,
  getModelListPage,
  getTestModel,
  putSystemModel,
  putUpdateWithJson,
  updateModelCollaborators
} from '@/web/core/ai/config';
import MyBox from '@fastgpt/web/components/common/MyBox';
import type { SystemModelItemType } from '@fastgpt/global/core/ai/model/type';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import { AddModelButton } from './AddModelBox';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import PriceTiersLabel from '@/components/core/ai/PriceTiersLabel';
import TestModeBetaTag from '@/components/core/ai/TestModeBetaTag';
import ModelCapabilityTags from '@/components/core/ai/ModelCapabilityTags';
import ChannelCountPopover from '@/components/core/ai/ChannelCountPopover';
import { useConfirmInput } from '@/components/core/ai/ConfirmInput';
import { findDefaultModelScenes } from './defaultModelUtils';
import SystemDefaultModelPanel from './SystemDefaultModelPanel';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { ModelPermission } from '@fastgpt/global/support/permission/model/controller';
import type { UpdateClbPermissionProps } from '@fastgpt/global/support/permission/collaborator';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { getCollaboratorId } from '@fastgpt/global/support/permission/utils';
import { LazyCollaboratorProvider } from '@/components/support/permission/MemberManager/context';
import type { ListModelsBody, ModelListItem } from '@fastgpt/global/openapi/core/ai/model/api';
import {
  filterAddedModelProviders,
  getModelPriceDisplayValue
} from '@/components/core/ai/ModelTable/utils';

const MyModal = dynamic(() => import('@fastgpt/web/components/common/MyModal'));
const ModelEditModal = dynamic(() => import('./AddModelBox').then((mod) => mod.ModelEditModal));

const ModelTable = ({ Tab }: { Tab: React.ReactNode }) => {
  const { t, i18n } = useClientTranslation('config_model');
  const { userInfo } = useUserStore();
  const { feConfigs, getModelProviders, getModelProvider } = useSystemStore();
  const { openConfirm, ConfirmModal } = useConfirm();
  const { openConfirmInput, ConfirmInputModal } = useConfirmInput();

  const isRoot = userInfo?.username === 'root';
  const hasModelCreatePer =
    isRoot || userInfo?.permission?.hasModelCreatePer || userInfo?.permission?.isOwner;

  // Root can narrow the list by ownership; the default keeps the complete model inventory visible.
  const [modelScope, setModelScope] = useState<'all' | 'system' | 'team'>('all');
  const isSystem = modelScope === 'all' ? undefined : modelScope === 'system';
  const modelScopeList = useMemo<{ label: string; value: 'all' | 'system' | 'team' }[]>(
    () => [
      { label: t('common:All'), value: 'all' },
      { label: t('config_model:model.system_models'), value: 'system' },
      { label: t('config_model:model.team_models'), value: 'team' }
    ],
    [t]
  );

  const [provider, setProvider] = useState<string | ''>('');
  const [availableProviderIds, setAvailableProviderIds] = useState<string[]>([]);
  const providerList = useMemo<{ label: React.ReactNode; value: string | '' }[]>(() => {
    const availableProviderSet = new Set(availableProviderIds);
    return [
      { label: t('common:All'), value: '' },
      ...filterAddedModelProviders(getModelProviders(i18n.language), availableProviderSet).map(
        (item) => ({
          label: (
            <HStack>
              <Avatar src={item.avatar} w={'1rem'} />
              <Box>{item.name}</Box>
            </HStack>
          ),
          value: item.id
        })
      )
    ];
  }, [availableProviderIds, getModelProviders, i18n.language, t]);
  const selectedProvider = availableProviderIds.includes(provider) ? provider : '';

  const [modelType, setModelType] = useState<ModelTypeEnum | ''>('');
  const selectModelTypeList = useMemo<{ label: string; value: ModelTypeEnum | '' }[]>(
    () => [
      { label: t('common:All'), value: '' },
      ...modelTypeList.map((item) => ({ label: t(item.label), value: item.value }))
    ],
    [t]
  );

  const [search, setSearch] = useState('');
  const [showActive, setShowActive] = useState(false);
  const [activeTotal, setActiveTotal] = useState(0);

  // Pagination and filters are evaluated by the list endpoint.
  const {
    data: modelList = [],
    Pagination,
    isLoading: loadingModels,
    refresh: refreshSystemModelList
  } = usePagination<ListModelsBody, ModelListItem>(
    async (params) => {
      const res = await getModelListPage({
        ...params,
        provider: selectedProvider || undefined,
        type: modelType || undefined,
        search: search || undefined,
        isActive: showActive ? 'active' : undefined,
        isSystem
      });
      setActiveTotal(res.activeTotal ?? 0);
      setAvailableProviderIds(res.providers);
      return res;
    },
    {
      defaultPageSize: 20,
      refreshDeps: [selectedProvider, modelType, search, showActive, isSystem, isRoot]
    }
  );
  const refreshModels = useCallback(() => {
    refreshSystemModelList();
  }, [refreshSystemModelList]);

  const modelListFormat = useMemo(() => {
    const renderSinglePriceLabel = ({
      item,
      unitLabel,
      showInput = false
    }: {
      item: ModelListItem;
      unitLabel: string;
      showInput?: boolean;
    }) => {
      const price = getModelPriceDisplayValue({
        isSystem: item.isSystem,
        price: item.charsPointsPrice
      });
      if (price === '-') return price;

      return (
        <Flex color={'myGray.700'}>
          {showInput ? `${t('common:Input')}: ` : ''}
          <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
            {price}
          </Box>
          {unitLabel}
        </Flex>
      );
    };

    const formatLLMModelList = modelList
      .filter((item) => item.type === ModelTypeEnum.llm)
      .map((item) => ({
        ...item,
        typeLabel: t('common:model.type.chat'),
        priceLabel: item.isSystem ? (
          <PriceTiersLabel
            config={item}
            unitLabel={`${t('common:support.wallet.subscription.point')} / 1K Tokens`}
          />
        ) : (
          '-'
        ),
        tagColor: 'blue'
      }));
    const formatVectorModelList = modelList
      .filter((item) => item.type === ModelTypeEnum.embedding)
      .map((item) => ({
        ...item,
        typeLabel: t('common:model.type.embedding'),
        priceLabel: renderSinglePriceLabel({
          item,
          showInput: true,
          unitLabel: ` ${t('common:support.wallet.subscription.point')} / 1K Tokens`
        }),
        tagColor: 'yellow'
      }));
    const formatAudioSpeechModelList = modelList
      .filter((item) => item.type === ModelTypeEnum.tts)
      .map((item) => ({
        ...item,
        typeLabel: t('common:model.type.tts'),
        priceLabel: renderSinglePriceLabel({
          item,
          unitLabel: ` ${t('common:support.wallet.subscription.point')} / 1K ${t('common:unit.character')}`
        }),
        tagColor: 'green'
      }));
    const formatWhisperModel = modelList
      .filter((item) => item.type === ModelTypeEnum.stt)
      .map((item) => ({
        ...item,
        typeLabel: t('common:model.type.stt'),
        priceLabel: renderSinglePriceLabel({
          item,
          unitLabel: ` ${t('common:support.wallet.subscription.point')} / 60${t('common:unit.seconds')}`
        }),
        tagColor: 'purple'
      }));
    const formatRerankModelList = modelList
      .filter((item) => item.type === ModelTypeEnum.rerank)
      .map((item) => ({
        ...item,
        typeLabel: t('common:model.type.reRank'),
        priceLabel: renderSinglePriceLabel({
          item,
          showInput: true,
          unitLabel: ` ${t('common:support.wallet.subscription.point')} / 1K Tokens`
        }),
        tagColor: 'red'
      }));

    const list = (() => {
      if (modelType === ModelTypeEnum.llm) return formatLLMModelList;
      if (modelType === ModelTypeEnum.embedding) return formatVectorModelList;
      if (modelType === ModelTypeEnum.tts) return formatAudioSpeechModelList;
      if (modelType === ModelTypeEnum.stt) return formatWhisperModel;
      if (modelType === ModelTypeEnum.rerank) return formatRerankModelList;

      return [
        ...formatLLMModelList,
        ...formatVectorModelList,
        ...formatAudioSpeechModelList,
        ...formatWhisperModel,
        ...formatRerankModelList
      ];
    })();

    // Provider meta for display; order kept from the backend response (design §7.1)
    return list.map((item) => {
      const provider = getModelProvider(item.provider, i18n.language);
      return {
        ...item,
        avatar: provider.avatar,
        providerId: provider.id,
        providerName: t(provider.name as any),
        order: provider.order,
        // Rebuild a real ModelPermission instance from the serialized snapshot
        // (design §13.2): only role/isOwner are needed by the constructor.
        permission: new ModelPermission({
          role: item.permission.role,
          isOwner: item.permission.isOwner
        })
      };
    });
  }, [modelList, t, modelType, getModelProvider, i18n.language]);

  const { runAsync: onTestModel, loading: testingModel } = useRequest(getTestModel, {
    manual: true,
    successToast: t('common:Success')
  });
  const { runAsync: updateModel, loading: updatingModel } = useRequest(putSystemModel, {
    onSuccess: refreshModels
  });

  const { runAsync: deleteModel } = useRequest(deleteSystemModel, {
    onSuccess: refreshModels
  });

  const [editModelData, setEditModelData] = useState<SystemModelItemType>();
  const { runAsync: onEditModel, loading: loadingData } = useRequest(
    (modelId: string) => getModelDetail({ id: modelId }),
    {
      onSuccess: (data: SystemModelItemType) => {
        setEditModelData(data);
      }
    }
  );

  // Omit an ID for creation because ModelEditModal uses it to select the update path.
  const onCreateModel = (type: ModelTypeEnum) => {
    const modelData = {
      model: '',
      name: '',
      charsPointsPrice: undefined,
      inputPrice: undefined,
      outputPrice: undefined,
      priceTiers: undefined,

      isSystem: false,
      isActive: true,

      type,
      ...(type === ModelTypeEnum.llm
        ? {
            vision: false,
            audio: false,
            video: false
          }
        : {})
    } as SystemModelItemType;

    setEditModelData(modelData);
  };

  const {
    isOpen: isOpenJsonConfig,
    onOpen: onOpenJsonConfig,
    onClose: onCloseJsonConfig
  } = useDisclosure();
  const {
    onOpen: onOpenDefaultModel,
    onClose: onCloseDefaultModel,
    isOpen: isOpenDefaultModel
  } = useDisclosure();

  const onUpdateModelCollaborators = useCallback(
    async (modelId: string, modelName: string, props: UpdateClbPermissionProps) => {
      const { clbs: currentClbs } = await getModelCollaborators(modelId);
      const removedClbs = currentClbs.filter(
        (clb) =>
          !props.collaborators.some((item) => getCollaboratorId(item) === getCollaboratorId(clb))
      );

      if (removedClbs.length > 0) {
        await new Promise<void>((resolve) => {
          openConfirmInput({
            title: t('config_model:collaborator.remove_title'),
            message: t('config_model:collaborator.remove_warn'),
            confirmPlaceholder: t('config_model:collaborator.remove_placeholder', {
              modelName
            }),
            confirmValue: modelName,
            onConfirm: () => resolve()
          });
        });
      }

      await updateModelCollaborators({
        modelIds: [modelId],
        collaborators: props.collaborators
      });
    },
    [openConfirmInput, t]
  );

  const isLoading = loadingModels || loadingData || updatingModel || testingModel;

  // §11.2: deactivating/deleting a model that is set as a system default needs
  // a warning first (the effective default will fall back / reset).
  const checkDefaultModelScenes = useCallback(
    (modelId: string, proceed: () => void) => {
      getSystemDefault().then((defaults) => {
        const scenes = findDefaultModelScenes(defaults, modelId);
        if (scenes.length === 0) {
          proceed();
          return;
        }

        openConfirm({
          title: t('common:Warning'),
          customContent: t('config_model:default_model_used_warning', {
            scenes: scenes.map((key) => t(`config_model:${key}`)).join('、')
          }),
          onConfirm: proceed
        })();
      });
    },
    [openConfirm, t]
  );

  return (
    <>
      <Flex
        px={[3, 6]}
        flexDirection={['column', 'row']}
        alignItems={['stretch', 'center']}
        gap={2}
      >
        <Box w={['100%', 'auto']}>{Tab}</Box>
        <Flex ml={[0, 'auto']} alignItems={'center'} justifyContent={'flex-end'} gap={2}>
          {isRoot && (
            <>
              <Button variant={'whiteBase'} onClick={onOpenDefaultModel}>
                {t('config_model:model.default_model')}
              </Button>
              <Button variant={'whiteBase'} onClick={onOpenJsonConfig}>
                {t('config_model:model.json_config')}
              </Button>
            </>
          )}
          <AddModelButton onCreate={onCreateModel} disabled={!hasModelCreatePer} />
        </Flex>
      </Flex>
      <MyBox flex={'1 0 0'} isLoading={isLoading}>
        <Flex flexDirection={'column'} h={'100%'}>
          <Flex px={[3, 6]}>
            <HStack flexShrink={0} mr={6}>
              <Box fontSize={'sm'} color={'myGray.900'}>
                {t('config_model:model.scope')}
              </Box>
              <MySelect
                w={'150px'}
                bg={'myGray.50'}
                value={modelScope}
                onChange={setModelScope}
                list={modelScopeList}
              />
            </HStack>
            <HStack flexShrink={0}>
              <Box fontSize={'sm'} color={'myGray.900'}>
                {t('common:model.provider')}
              </Box>
              <MySelect
                w={'200px'}
                bg={'myGray.50'}
                value={selectedProvider}
                onChange={setProvider}
                list={providerList}
              />
            </HStack>
            <HStack flexShrink={0} ml={6}>
              <Box fontSize={'sm'} color={'myGray.900'}>
                {t('common:model.model_type')}
              </Box>
              <MySelect
                w={'150px'}
                bg={'myGray.50'}
                value={modelType}
                onChange={setModelType}
                list={selectModelTypeList}
              />
            </HStack>
            <Box flex={1} />
            <Box flex={'0 0 250px'}>
              <SearchInput
                bg={'myGray.50'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  isSystem
                    ? t('common:model.search_name_placeholder')
                    : t('config_model:model.search_creator_placeholder')
                }
              />
            </Box>
          </Flex>
          <TableContainer mt={5} px={[3, 6]} flex={'1 0 0'} h={0} overflowY={'auto'}>
            <Table>
              <Thead>
                <Tr color={'myGray.600'}>
                  <Th fontSize={'xs'}>{t('common:model.name')}</Th>
                  <Th fontSize={'xs'}>{t('config_model:model.model_id')}</Th>
                  <Th fontSize={'xs'}>{t('common:model.model_type')}</Th>
                  {feConfigs?.isPlus && <Th fontSize={'xs'}>{t('common:model.billing')}</Th>}
                  <Th fontSize={'xs'}>{t('common:model.provider')}</Th>
                  <Th fontSize={'xs'}>
                    <Box
                      cursor={'pointer'}
                      onClick={() => setShowActive(!showActive)}
                      color={showActive ? 'primary.600' : 'myGray.600'}
                    >
                      {t('config_model:model.active')}({activeTotal})
                    </Box>
                  </Th>
                  <Th fontSize={'xs'}>{t('config_model:model.channel_count')}</Th>
                  {isSystem !== true && (
                    <Th fontSize={'xs'}>{t('config_model:channel_creator')}</Th>
                  )}
                  <Th fontSize={'xs'}>{t('config_model:model.action')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {modelListFormat.map((item) => (
                  <Tr key={item.id} _hover={{ bg: 'myGray.50' }}>
                    <Td fontSize={'sm'}>
                      <HStack>
                        <Avatar src={item.avatar} w={'1.2rem'} borderRadius={'50%'} />
                        <Flex alignItems={'center'} gap={1} minW={0}>
                          <CopyBox
                            value={item.name || item.model}
                            color={'myGray.900'}
                            fontWeight={'500'}
                          >
                            {item.name || item.model}
                          </CopyBox>
                          {item.isSystem && (
                            <MyTag colorSchema={'green'}>
                              {t('config_model:model.system_models')}
                            </MyTag>
                          )}
                          {item.testMode && <TestModeBetaTag />}
                        </Flex>
                      </HStack>
                      <ModelCapabilityTags
                        mt={2}
                        contextToken={item.contextToken}
                        showVision={!!item.vision}
                        showVideo={!!item.video}
                        showAudio={!!item.audio}
                        showReasoning={!!item.reasoning}
                      />
                    </Td>
                    <Td fontSize={'sm'}>
                      <CopyBox value={item.model} color={'myGray.700'}>
                        {item.model}
                      </CopyBox>
                    </Td>
                    <Td>
                      <MyTag colorSchema={item.tagColor as any}>{item.typeLabel}</MyTag>
                    </Td>
                    {feConfigs?.isPlus && <Td fontSize={'sm'}>{item.priceLabel}</Td>}
                    <Td fontSize={'sm'} color={'myGray.700'}>
                      {item.providerName}
                    </Td>
                    <Td fontSize={'sm'}>
                      <Switch
                        size={'sm'}
                        isChecked={item.isActive}
                        // Read-only collaborators cannot change model status.
                        isDisabled={!item.permission.hasWritePer}
                        onChange={(e) => {
                          const nextActive = e.target.checked;
                          if (nextActive) {
                            updateModel({ id: item.id, isActive: true });
                          } else {
                            // §11.2: warn first if referenced by system defaults, then
                            // require the model name as a second confirmation (design §12 / F2-S3-TC02)
                            checkDefaultModelScenes(item.id, () =>
                              openConfirmInput({
                                title: t('config_model:model.disable_model'),
                                message: t('config_model:model.disable_model_warn'),
                                confirmPlaceholder: t(
                                  'config_model:model.disable_model_placeholder'
                                ),
                                confirmValue: item.name || item.model,
                                onConfirm: () => updateModel({ id: item.id, isActive: false })
                              })
                            );
                          }
                        }}
                        colorScheme={'myBlue'}
                      />
                    </Td>
                    <Td fontSize={'sm'}>
                      <ChannelCountPopover count={item.channelCount ?? 0} modelId={item.id} />
                    </Td>
                    {isSystem !== true && (
                      <Td fontSize={'sm'} color={'myGray.700'}>
                        {item.sourceMember?.name || '-'}
                      </Td>
                    )}
                    <Td>
                      <HStack>
                        {/* Each action uses the permission level required by design §10.1. */}
                        <MyIconButton
                          icon={'core/chat/sendLight'}
                          tip={t('config_model:model.test_model')}
                          isDisabled={!item.permission.hasReadPer}
                          onClick={() => onTestModel({ id: item.id })}
                        />
                        <MyIconButton
                          icon={'common/settingLight'}
                          tip={t('config_model:model.edit_model')}
                          isDisabled={!item.permission.hasWritePer}
                          onClick={() => onEditModel(item.id)}
                        />
                        {feConfigs?.isPlus &&
                          item.isSystem === false &&
                          item.permission.isOwner && (
                            <LazyCollaboratorProvider
                              selectedHint={t('config_model:model_permission_config_hint')}
                              defaultRole={ReadRoleVal}
                              onGetCollaboratorList={() => getModelCollaborators(item.id)}
                              onUpdateCollaborators={(props) =>
                                onUpdateModelCollaborators(item.id, item.name || item.model, props)
                              }
                              permission={item.permission}
                            >
                              {({ onOpenManageModal }) => (
                                <MyIconButton
                                  icon={'modal/changePer'}
                                  tip={t('config_model:collaborator.title', {
                                    modelName: item.name || item.model
                                  })}
                                  onClick={onOpenManageModal}
                                />
                              )}
                            </LazyCollaboratorProvider>
                          )}
                        {/* F2-S3: root must be able to delete system models too —
                            the ManagePer check (owner/root) already gates authorization */}
                        <MyIconButton
                          icon={'delete'}
                          hoverColor={'red.500'}
                          tip={t('config_model:model.delete_model')}
                          isDisabled={!item.permission.hasManagePer}
                          onClick={() =>
                            checkDefaultModelScenes(item.id, () =>
                              openConfirmInput({
                                title: t('config_model:model.delete_model'),
                                message: `${
                                  (item.channelCount ?? 0) > 0
                                    ? `${t('config_model:model.delete_model_channel_ref', {
                                        count: item.channelCount
                                      })}\n`
                                    : ''
                                }${t('config_model:model.delete_model_warn')}`,
                                confirmPlaceholder: t(
                                  'config_model:model.delete_model_placeholder'
                                ),
                                confirmValue: item.name || item.model,
                                onConfirm: async () => {
                                  await deleteModel({ id: item.id });
                                }
                              })
                            )
                          }
                        />
                      </HStack>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
          <Flex justifyContent={'center'} mt={3}>
            {Pagination()}
          </Flex>
        </Flex>
      </MyBox>

      {!!editModelData && (
        <ModelEditModal
          modelData={editModelData}
          onSuccess={refreshModels}
          onClose={() => setEditModelData(undefined)}
        />
      )}
      {isOpenJsonConfig && (
        <JsonConfigModal onClose={onCloseJsonConfig} onSuccess={refreshModels} />
      )}
      {isOpenDefaultModel && (
        <SystemDefaultModelPanel onClose={onCloseDefaultModel} onSuccess={refreshModels} />
      )}
      <ConfirmModal />
      <ConfirmInputModal />
    </>
  );
};

const JsonConfigModal = ({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const { t } = useClientTranslation('config_model');

  const [data, setData] = useState<string>('');
  const { loading } = useRequest(getModelConfigJson, {
    manual: false,
    onSuccess(res) {
      setData(res);
    }
  });

  const { runAsync } = useRequest(putUpdateWithJson, {
    onSuccess: () => {
      onSuccess();
      onClose();
    }
  });

  return (
    <MyModal
      isOpen
      isLoading={loading}
      onClose={onClose}
      iconSrc="modal/edit"
      title={t('config_model:model.json_config')}
      w={'100%'}
      h={'100%'}
    >
      <ModalBody display={'flex'} flexDirection={'column'}>
        <Box fontSize={'sm'} color={'myGray.500'}>
          {t('config_model:model.json_config_tip')}
        </Box>
        <Box mt={2} flex={1} w={'100%'} overflow={'hidden'}>
          <JsonEditor value={data} onChange={setData} resize h={'100%'} />
        </Box>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={4} onClick={onClose}>
          {t('common:Cancel')}
        </Button>

        <PopoverConfirm
          Trigger={<Button>{t('common:Confirm')}</Button>}
          type="info"
          content={t('config_model:model.json_config_confirm')}
          onConfirm={() => runAsync({ config: data })}
        />
      </ModalFooter>
    </MyModal>
  );
};

export default ModelTable;
