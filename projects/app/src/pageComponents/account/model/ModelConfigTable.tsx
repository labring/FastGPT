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
import { useTranslation } from 'next-i18next';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { modelTypeList, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import dynamic from 'next/dynamic';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  deleteSystemModel,
  getModelConfigJson,
  getSystemModelDetail,
  getSystemModelPageList,
  getTestModel,
  putSystemModel
} from '@/web/core/ai/config';
import MyBox from '@fastgpt/web/components/common/MyBox';
import type {
  GetModelDetailResponse,
  ListModelsBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import { clientInitData } from '@/web/common/system/staticData';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { putUpdateWithJson } from '@/web/core/ai/config';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { AddModelButton, getNewModelFormData } from './AddModelBox';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import PriceTiersLabel from '@/components/core/ai/PriceTiersLabel';
import TestModeBetaTag from '@/components/core/ai/TestModeBetaTag';
import TableHeaderFilter from '@fastgpt/web/components/common/TableHeaderFilter';
import { LazyCollaboratorProvider } from '@/components/support/permission/MemberManager/context';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { getModelCollaborators, updateModelCollaborators } from '@/web/common/system/api';
import type { ModelReference } from '@fastgpt/service/support/permission/model/reference';
import ModelReferenceModal from '@/components/core/ai/ModelTable/ModelReferenceModal';

const MyModal = dynamic(() => import('@fastgpt/web/components/common/MyModal'));
const ModelEditModal = dynamic(() => import('./AddModelBox').then((mod) => mod.ModelEditModal));

const ModelTable = () => {
  const { t, i18n } = useTranslation();
  const { userInfo } = useUserStore();
  const { defaultModels, feConfigs, getModelProviders, getModelProvider } = useSystemStore();
  const { toast } = useToast();

  const isRoot = userInfo?.username === 'root';
  const canCreateModel = isRoot || !!userInfo?.team.permission.hasModelCreatePer;

  // Reference warning dialog state
  const [referenceDialog, setReferenceDialog] = useState<{
    isOpen: boolean;
    references: ModelReference[];
  }>({ isOpen: false, references: [] });

  const [provider, setProvider] = useState<string | ''>('');
  const providerList = useRef<{ label: React.ReactNode; value: string | '' }[]>([
    { label: t('common:model.all_provider'), value: '' },
    ...getModelProviders(i18n.language).map((item) => ({
      label: (
        <HStack>
          <Avatar src={item.avatar} w={'1rem'} />
          <Box>{item.name}</Box>
        </HStack>
      ),
      value: item.id
    }))
  ]);

  const [modelType, setModelType] = useState<ModelTypeEnum | undefined>(undefined);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [activeTotal, setActiveTotal] = useState(0);

  const filterParams = useMemo<ListModelsBody>(
    () => ({
      provider: provider || undefined,
      type: modelType || undefined,
      search: search || undefined,
      isActive: statusFilter || undefined
    }),
    [provider, modelType, search, statusFilter]
  );

  const fetchModels = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (data: any) => {
      const res = await getSystemModelPageList(data);
      if (res.activeTotal !== undefined) {
        setActiveTotal(res.activeTotal);
      }
      return res;
    },
    []
  );

  const {
    data: systemModelList = [],
    refresh,
    isLoading: loadingModels,
    Pagination
  } = usePagination(fetchModels, {
    defaultPageSize: 20,
    params: filterParams,
    refreshDeps: [filterParams]
  });
  const refreshModels = useCallback(async () => {
    clientInitData();
    refresh();
  }, [refresh]);

  const modelList = useMemo(() => {
    const formatList = systemModelList.map((item) => {
      const typeLabel = (() => {
        switch (item.type) {
          case ModelTypeEnum.llm:
            return t('common:model.type.chat');
          case ModelTypeEnum.embedding:
            return t('common:model.type.embedding');
          case ModelTypeEnum.tts:
            return t('common:model.type.tts');
          case ModelTypeEnum.stt:
            return t('common:model.type.stt');
          case ModelTypeEnum.rerank:
            return t('common:model.type.reRank');
          default:
            return '';
        }
      })();

      const priceLabel = (() => {
        if (item.type === ModelTypeEnum.llm) {
          return (
            <PriceTiersLabel
              config={item}
              unitLabel={`${t('common:support.wallet.subscription.point')} / 1K Tokens`}
            />
          );
        }
        if (item.type === ModelTypeEnum.embedding || item.type === ModelTypeEnum.rerank) {
          return typeof item.charsPointsPrice === 'number' ? (
            <Flex color={'myGray.700'}>
              {`${t('common:Input')}: `}
              <Box fontWeight={'bold'} color={'myGray.900'} mx={0.5}>
                {item.charsPointsPrice}
              </Box>
              {` ${t('common:support.wallet.subscription.point')}/1K tokens`}
            </Flex>
          ) : (
            '-'
          );
        }
        if (item.type === ModelTypeEnum.tts) {
          return typeof item.charsPointsPrice === 'number' ? (
            <Flex color={'myGray.700'}>
              <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
                {item.charsPointsPrice}
              </Box>
              {` ${t('common:support.wallet.subscription.point')}/1K ${t('common:unit.character')}`}
            </Flex>
          ) : (
            '-'
          );
        }
        if (item.type === ModelTypeEnum.stt) {
          return typeof item.charsPointsPrice === 'number' ? (
            <Flex color={'myGray.700'}>
              <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
                {item.charsPointsPrice}
              </Box>
              {` ${t('common:support.wallet.subscription.point')}/60${t('common:unit.seconds')}`}
            </Flex>
          ) : (
            '-'
          );
        }
        return '-';
      })();

      const tagColor = (() => {
        switch (item.type) {
          case ModelTypeEnum.llm:
            return 'blue';
          case ModelTypeEnum.embedding:
            return 'yellow';
          case ModelTypeEnum.tts:
            return 'green';
          case ModelTypeEnum.stt:
            return 'purple';
          case ModelTypeEnum.rerank:
            return 'adora';
          default:
            return 'blue';
        }
      })();

      const provider = getModelProvider(item.provider, i18n.language);
      return {
        ...item,
        typeLabel,
        priceLabel,
        tagColor,
        avatar: provider.avatar,
        providerId: provider.id,
        providerName: t(provider.name as any),
        order: provider.order
      };
    });
    return formatList;
  }, [systemModelList, t, getModelProvider, i18n.language]);
  const filterProviderList = useMemo(() => {
    return providerList.current;
  }, []);

  const { runAsync: onTestModel, loading: testingModel } = useRequest(getTestModel, {
    manual: true,
    successToast: t('common:Success')
  });
  const { runAsync: updateModel, loading: updatingModel } = useRequest(putSystemModel, {
    onSuccess: refreshModels,
    errorToast: '',
    onError: (err: any) => {
      const refs = err?.data?.references;
      if (err?.code === 409 && refs?.length > 0) {
        setReferenceDialog({ isOpen: true, references: refs });
        return;
      }
      if (err?.code === 409 && err?.message) {
        toast({
          title: t(err.message as any),
          status: 'error'
        });
        return;
      }
    }
  });

  const { runAsync: deleteModel } = useRequest(deleteSystemModel, {
    onSuccess: refreshModels,
    errorToast: '',
    onError: (err: any) => {
      const refs = err?.data?.references;
      if (err?.code === 409 && refs?.length > 0) {
        setReferenceDialog({ isOpen: true, references: refs });
        return;
      }
    }
  });

  const [editModelData, setEditModelData] = useState<GetModelDetailResponse>();
  const { runAsync: onEditModel, loading: loadingData } = useRequest(
    (modelId: string) => getSystemModelDetail(modelId),
    {
      onSuccess: (data: GetModelDetailResponse) => {
        setEditModelData(data);
      }
    }
  );

  const onCreateModel = (type: ModelTypeEnum) => {
    const defaultModel = defaultModels[type];

    setEditModelData(getNewModelFormData(defaultModel, type));
  };

  const {
    isOpen: isOpenJsonConfig,
    onOpen: onOpenJsonConfig,
    onClose: onCloseJsonConfig
  } = useDisclosure();

  const isLoading = loadingModels || loadingData || updatingModel || testingModel;

  const [showModelId, setShowModelId] = useState(false);

  return (
    <>
      <Flex alignItems={'center'} mb={4} gap={3} flexShrink={0}>
        <HStack flexShrink={0}>
          <MySelect
            h={'36px'}
            w={'150px'}
            bg={'white'}
            value={provider}
            onChange={setProvider}
            list={filterProviderList}
          />
        </HStack>
        <Box flex={1} />
        <Box flex={'0 0 250px'}>
          <SearchInput
            h={'36px'}
            bg={'white'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common:model.search_name_placeholder')}
          />
        </Box>
        {isRoot && (
          <>
            <Button h={'36px'} variant={'whiteBase'} onClick={onOpenJsonConfig}>
              {t('account:model.json_config')}
            </Button>
          </>
        )}
        {canCreateModel && <AddModelButton h={'36px'} onCreate={onCreateModel} />}
      </Flex>
      <MyBox flex={'1 0 0'} h={0} isLoading={isLoading} display={'flex'} flexDirection={'column'}>
        <TableContainer flex={'1 0 0'} h={0} overflowY={'auto'}>
          <Table>
            <Thead>
              <Tr color={'myGray.600'}>
                <Th fontSize={'xs'}>
                  <HStack
                    spacing={1}
                    cursor={'pointer'}
                    onClick={() => setShowModelId(!showModelId)}
                  >
                    <Box>{showModelId ? t('account:model.model_id') : t('common:model.name')}</Box>
                    <MyIcon name={'modal/changePer'} w={'1rem'} />
                  </HStack>
                </Th>
                <Th fontSize={'xs'}>
                  <TableHeaderFilter
                    value={modelType}
                    onChange={(val) => setModelType(val as ModelTypeEnum)}
                    options={modelTypeList.map((item) => ({
                      key: item.value,
                      label: t(item.label)
                    }))}
                    label={t('common:model.model_type')}
                    allLabel={t('common:model.all_type')}
                  />
                </Th>
                {feConfigs?.isPlus && <Th fontSize={'xs'}>{t('common:model.billing')}</Th>}
                <Th fontSize={'xs'}>{t('account:model.creator')}</Th>
                <Th fontSize={'xs'}>{t('account:model.permission_label')}</Th>
                <Th fontSize={'xs'}>
                  <TableHeaderFilter
                    label={`${t('account:model.active')}(${activeTotal})`}
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                      { key: 'active', label: t('account_model:enable_channel') },
                      { key: 'inactive', label: t('account_model:forbid_channel') }
                    ]}
                    allLabel={t('account_model:model_status_all')}
                  />
                </Th>
                <Th fontSize={'xs'}></Th>
              </Tr>
            </Thead>
            <Tbody>
              {modelList.map((item, index) => (
                <Tr key={item.id} _hover={{ bg: 'myGray.50' }}>
                  <Td fontSize={'sm'}>
                    <HStack>
                      <Avatar src={item.avatar} w={'1.2rem'} borderRadius={'50%'} />
                      <Flex alignItems={'center'} gap={1} minW={0}>
                        <CopyBox
                          value={showModelId ? item.id : item.name}
                          color={'myGray.900'}
                          fontWeight={'500'}
                        >
                          {showModelId ? item.id : item.name}
                        </CopyBox>
                        {item.testMode && <TestModeBetaTag />}
                      </Flex>
                    </HStack>
                    <HStack mt={2}>
                      {item.contextToken && (
                        <MyTag type="borderFill" colorSchema="blue" py={0.5}>
                          {Math.floor(item.contextToken / 1000)}k
                        </MyTag>
                      )}
                      {item.vision && (
                        <MyTag type="borderFill" colorSchema="green" py={0.5}>
                          {t('account:model.vision_tag')}
                        </MyTag>
                      )}
                      {item.toolChoice && (
                        <MyTag type="borderFill" colorSchema="adora" py={0.5}>
                          {t('account:model.tool_choice_tag')}
                        </MyTag>
                      )}
                    </HStack>
                  </Td>
                  <Td>
                    <MyTag colorSchema={item.tagColor as any}>{item.typeLabel}</MyTag>
                  </Td>
                  {feConfigs?.isPlus && <Td fontSize={'sm'}>{item.priceLabel}</Td>}
                  <Td fontSize={'sm'} color={'myGray.700'}>
                    {item.sourceMember?.name || (item.isCustom ? '-' : 'System')}
                  </Td>
                  <Td fontSize={'sm'}>
                    <MyTag type="borderFill" colorSchema={item.isShared ? 'blue' : 'gray'}>
                      {item.isShared
                        ? t('account:model.permission_public')
                        : t('account:model.permission_private')}
                    </MyTag>
                  </Td>
                  <Td fontSize={'sm'}>
                    <Switch
                      size={'sm'}
                      isChecked={item.isActive}
                      isDisabled={!item.permission.hasManagePer}
                      onChange={(e) =>
                        updateModel({
                          id: item.id,
                          isActive: e.target.checked
                        })
                      }
                      colorScheme={'myBlue'}
                    />
                  </Td>
                  <Td>
                    <HStack>
                      <MyIconButton
                        icon={'core/chat/sendLight'}
                        tip={t('account:model.test_model')}
                        onClick={() => onTestModel({ id: item.id })}
                      />
                      {item.permission.hasManagePer && (
                        <>
                          <MyIconButton
                            icon={'common/settingLight'}
                            tip={t('account:model.edit_model')}
                            onClick={() => onEditModel(item.id)}
                          />
                          <LazyCollaboratorProvider
                            selectedHint={
                              item.isShared
                                ? t('account_model:model_permission_public_hint')
                                : undefined
                            }
                            defaultRole={ReadRoleVal}
                            onGetCollaboratorList={() => getModelCollaborators(item.id)}
                            onUpdateCollaborators={async ({ collaborators }) => {
                              try {
                                await updateModelCollaborators({
                                  collaborators,
                                  modelIds: [item.id]
                                });
                              } catch (err: any) {
                                const refs = err?.data?.references;
                                if (err?.code === 409 && refs?.length > 0) {
                                  setReferenceDialog({ isOpen: true, references: refs });
                                  throw err;
                                }
                                if (err?.code === 409 && err?.message) {
                                  toast({
                                    title: t(err.message as any),
                                    status: 'error'
                                  });
                                  return;
                                }
                                throw err;
                              }
                            }}
                            refetchResource={refreshModels}
                            permission={userInfo!.team.permission}
                          >
                            {({ onOpenManageModal }) => (
                              <MyIconButton
                                icon={'key'}
                                tip={t('common:permission.Permission config')}
                                onClick={onOpenManageModal}
                              />
                            )}
                          </LazyCollaboratorProvider>
                          {item.isCustom && (
                            <PopoverConfirm
                              Trigger={
                                <Box>
                                  <MyIconButton icon={'delete'} hoverColor={'red.500'} />
                                </Box>
                              }
                              type="delete"
                              content={t('account:model.delete_model_confirm')}
                              onConfirm={() => deleteModel({ id: item.id })}
                            />
                          )}
                        </>
                      )}
                    </HStack>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
        <Flex mt={3} justifyContent={'center'}>
          <Pagination />
        </Flex>
      </MyBox>

      {!!editModelData && (
        <ModelEditModal
          modelData={editModelData}
          onSuccess={refreshModels}
          onClose={() => setEditModelData(undefined)}
          isNormalUser={!isRoot}
        />
      )}
      {isOpenJsonConfig && (
        <JsonConfigModal onClose={onCloseJsonConfig} onSuccess={refreshModels} />
      )}

      {/* Reference warning dialog — shown when model deletion/permission revocation is blocked */}
      <ModelReferenceModal
        isOpen={referenceDialog.isOpen}
        references={referenceDialog.references}
        onClose={() => setReferenceDialog({ isOpen: false, references: [] })}
      />
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
  const { t } = useTranslation();

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
      title={t('account:model.json_config')}
      w={'100%'}
      h={'100%'}
    >
      <ModalBody display={'flex'} flexDirection={'column'}>
        <Box fontSize={'sm'} color={'myGray.500'}>
          {t('account:model.json_config_tip')}
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
          content={t('account:model.json_config_confirm')}
          onConfirm={() => runAsync({ config: data })}
        />
      </ModalFooter>
    </MyModal>
  );
};

export default ModelTable;
