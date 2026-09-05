import {
  Button,
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
  useDisclosure,
  Checkbox,
  type FlexProps
} from '@chakra-ui/react';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React, { useCallback, useMemo, useState } from 'react';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import dynamic from 'next/dynamic';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useTableMultipleSelect } from '@fastgpt/web/hooks/useTableMultipleSelect';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import {
  getModelCollaborators,
  getPublicModelCatalog,
  updateModelCollaborators
} from '@/web/common/system/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { LazyCollaboratorProvider } from '@/components/support/permission/MemberManager/context';
import PriceTiersLabel from '../PriceTiersLabel';
import TestModeBetaTag from '../TestModeBetaTag';
import ModelCapabilityTags from '../ModelCapabilityTags';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import { useUserModelLists } from '@/web/core/ai/model/useUserModelLists';
import {
  formatModelProviders,
  getModelProviderFromCache,
  getModelProviderListFromCache
} from '@fastgpt/global/core/ai/provider';
import ModelListFilters from '../ModelListFilters';
import { useFixedTableHeader } from '@fastgpt/web/hooks/useFixedTableHeader';

const MyModal = dynamic(() => import('@fastgpt/web/components/v2/common/MyModal'));

const modelTableColumnWidth = {
  selection: '48px',
  type: '160px',
  billing: '250px',
  permission: '160px'
} as const;
const modelTableMinWidth = {
  default: '800px',
  withPermission: '848px'
} as const;

const ModelTable = ({
  permissionConfig = false,
  contentPx
}: {
  permissionConfig?: boolean;
  contentPx?: FlexProps['px'];
}) => {
  const { t, i18n } = useClientTranslation();
  const { modelProviders: memberModelProviders, getModelProvider: getMemberModelProvider } =
    useUserModelStore();
  const { modelList: availableModels } = useUserModelLists();
  const { data: publicCatalog } = useRequest(getPublicModelCatalog, {
    manual: permissionConfig
  });
  const publicProviderCache = useMemo(
    () => formatModelProviders(publicCatalog?.providers ?? []),
    [publicCatalog?.providers]
  );
  const getModelProvider = useCallback(
    (provider?: string, language?: string) =>
      permissionConfig
        ? getMemberModelProvider(provider, language)
        : getModelProviderFromCache({
            cache: publicProviderCache.ModelProviderMapCache,
            provider,
            language
          }),
    [getMemberModelProvider, permissionConfig, publicProviderCache.ModelProviderMapCache]
  );
  const { userInfo } = useUserStore();
  const showPermissionColumn = permissionConfig && !!userInfo?.team.permission.hasManagePer;
  const tableMinWidth = showPermissionColumn
    ? modelTableMinWidth.withPermission
    : modelTableMinWidth.default;
  const { headerContainerRef, bodyContainerRef, headerTableWidth } = useFixedTableHeader();
  const modelPermissionConfigHint = permissionConfig
    ? t('common:model.permission_config_hint')
    : '';
  const getPermissionModelId = (modelId?: string) => {
    if (!modelId) throw new Error('Permission model ID is missing');
    return modelId;
  };

  const [provider, setProvider] = useState<string | ''>('');
  const modelProviders = useMemo(() => {
    return getModelProviderListFromCache(
      permissionConfig ? memberModelProviders : publicProviderCache.ModelProviderListCache,
      i18n.language
    );
  }, [
    i18n.language,
    memberModelProviders,
    permissionConfig,
    publicProviderCache.ModelProviderListCache
  ]);

  const [modelType, setModelType] = useState<ModelTypeEnum | ''>('');
  const [search, setSearch] = useState('');

  const remoteModels = permissionConfig ? availableModels : (publicCatalog?.models ?? []);
  const llmModelList = remoteModels.filter((model) => model.type === ModelTypeEnum.llm);
  const embeddingModelList = remoteModels.filter((model) => model.type === ModelTypeEnum.embedding);
  const ttsModelList = remoteModels.filter((model) => model.type === ModelTypeEnum.tts);
  const sttModelList = remoteModels.filter((model) => model.type === ModelTypeEnum.stt);
  const reRankModelList = remoteModels.filter((model) => model.type === ModelTypeEnum.rerank);

  const modelList = useMemo(() => {
    const formatLLMModelList = llmModelList.map((item) => ({
      ...item,
      typeLabel: t('common:model.type.chat'),
      priceLabel: (
        <PriceTiersLabel
          config={item}
          unitLabel={`${t('common:support.wallet.subscription.point')} / 1K Tokens`}
        />
      ),
      tagColor: 'blue'
    }));
    const formatVectorModelList = embeddingModelList.map((item) => ({
      ...item,
      typeLabel: t('common:model.type.embedding'),
      priceLabel: (
        <Flex color={'myGray.700'}>
          {`${t('common:Input')}: `}
          <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
            {item.charsPointsPrice || 0}
          </Box>
          {` ${t('common:support.wallet.subscription.point')} / 1K Tokens`}
        </Flex>
      ),
      tagColor: 'yellow'
    }));
    const formatAudioSpeechModelList = ttsModelList.map((item) => ({
      ...item,
      typeLabel: t('common:model.type.tts'),
      priceLabel: (
        <Flex color={'myGray.700'}>
          <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
            {item.charsPointsPrice || 0}
          </Box>
          {` ${t('common:support.wallet.subscription.point')} / 1K ${t('common:unit.character')}`}
        </Flex>
      ),
      tagColor: 'green'
    }));
    const formatWhisperModelList = sttModelList.map((item) => ({
      ...item,
      typeLabel: t('common:model.type.stt'),
      priceLabel: (
        <Flex color={'myGray.700'}>
          <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
            {item.charsPointsPrice}
          </Box>
          {` ${t('common:support.wallet.subscription.point')} / 60${t('common:unit.seconds')}`}
        </Flex>
      ),
      tagColor: 'purple'
    }));
    const formatRerankModelList = reRankModelList.map((item) => ({
      ...item,
      typeLabel: t('common:model.type.reRank'),
      priceLabel: item.charsPointsPrice ? (
        <Flex color={'myGray.700'}>
          {`${t('common:Input')}: `}
          <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
            {item.charsPointsPrice}
          </Box>
          {` ${t('common:support.wallet.subscription.point')} / 1K Tokens`}
        </Flex>
      ) : (
        '-'
      ),
      tagColor: 'red'
    }));

    const list = (() => {
      if (modelType === ModelTypeEnum.llm) return formatLLMModelList;
      if (modelType === ModelTypeEnum.embedding) return formatVectorModelList;
      if (modelType === ModelTypeEnum.tts) return formatAudioSpeechModelList;
      if (modelType === ModelTypeEnum.stt) return formatWhisperModelList;
      if (modelType === ModelTypeEnum.rerank) return formatRerankModelList;

      return [
        ...formatLLMModelList,
        ...formatVectorModelList,
        ...formatAudioSpeechModelList,
        ...formatWhisperModelList,
        ...formatRerankModelList
      ];
    })();
    const formatList = list.map((item) => {
      const provider = getModelProvider(item.provider, i18n.language);
      return {
        modelId: 'modelId' in item ? item.modelId : undefined,
        name: item.name,
        testMode: item.testMode,
        contextToken:
          item.type === ModelTypeEnum.llm
            ? item.config.maxContext
            : item.type === ModelTypeEnum.embedding || item.type === ModelTypeEnum.rerank
              ? item.config.maxToken
              : undefined,
        vision:
          (item.type === ModelTypeEnum.llm || item.type === ModelTypeEnum.embedding) &&
          'vision' in item.config
            ? item.config.vision
            : undefined,
        audio: item.type === ModelTypeEnum.llm ? item.config.audio : undefined,
        video: item.type === ModelTypeEnum.llm ? item.config.video : undefined,
        reasoning: item.type === ModelTypeEnum.llm ? item.config.reasoning : undefined,
        toolChoice:
          item.type === ModelTypeEnum.llm && 'toolChoice' in item.config
            ? item.config.toolChoice
            : undefined,
        avatar: provider.avatar,
        providerId: provider.id,
        providerName: provider.name,
        typeLabel: item.typeLabel,
        priceLabel: item.priceLabel,
        order: provider.order,
        tagColor: item.tagColor
      };
    });
    formatList.sort((a, b) => a.order - b.order);

    const filterList = formatList.filter((item) => {
      const providerFilter = provider ? item.providerId === provider : true;

      const regx = new RegExp(search, 'i');
      const nameFilter = search ? regx.test(item.name) : true;

      return providerFilter && nameFilter;
    });

    return filterList;
  }, [
    llmModelList,
    embeddingModelList,
    ttsModelList,
    sttModelList,
    reRankModelList,
    t,
    modelType,
    getModelProvider,
    i18n.language,
    provider,
    search
  ]);

  const {
    selectedItems,
    toggleSelect,
    isSelected,
    getRowSelectionProps,
    FloatingActionBar,
    isSelecteAll,
    selectAllTrigger
  } = useTableMultipleSelect({
    list: modelList,
    getItemId: (e) => e.name
  });
  return (
    <Flex flexDirection={'column'} h={contentPx === undefined ? '100%' : ['auto', '100%']} minW={0}>
      <ModelListFilters
        px={contentPx}
        providers={modelProviders}
        models={remoteModels}
        provider={provider}
        onProviderChange={setProvider}
        modelType={modelType}
        onModelTypeChange={setModelType}
        search={search}
        onSearchChange={setSearch}
      />
      <TableContainer
        mt={5}
        px={contentPx}
        ref={headerContainerRef}
        flexShrink={0}
        w={'100%'}
        maxW={'100%'}
        overflowX={'hidden'}
      >
        <Table
          minW={tableMinWidth}
          sx={{
            tableLayout: 'fixed',
            width: `${headerTableWidth} !important`
          }}
        >
          <colgroup>
            {showPermissionColumn && <col style={{ width: modelTableColumnWidth.selection }} />}
            <col />
            <col style={{ width: modelTableColumnWidth.type }} />
            <col style={{ width: modelTableColumnWidth.billing }} />
            {showPermissionColumn && <col style={{ width: modelTableColumnWidth.permission }} />}
          </colgroup>
          <Thead>
            <Tr color={'myGray.600'}>
              {showPermissionColumn && (
                <Th px={3}>
                  <Checkbox
                    isChecked={isSelecteAll}
                    isIndeterminate={selectedItems.length > 0 && !isSelecteAll}
                    onChange={selectAllTrigger}
                  />
                </Th>
              )}
              <Th fontSize={'xs'}>{t('common:model.name')}</Th>
              <Th fontSize={'xs'}>{t('common:model.model_type')}</Th>
              <Th fontSize={'xs'}>{t('common:model.billing')}</Th>
              {showPermissionColumn && (
                <Th fontSize={'xs'}>{t('common:permission.Permission config')}</Th>
              )}
            </Tr>
          </Thead>
        </Table>
      </TableContainer>
      <TableContainer
        px={contentPx}
        ref={bodyContainerRef}
        flex={contentPx === undefined ? '1 0 0' : ['0 0 auto', '1 0 0']}
        h={contentPx === undefined ? 0 : ['auto', 0]}
        minH={0}
        w={'100%'}
        maxW={'100%'}
        overflowY={contentPx === undefined ? 'auto' : ['visible', 'auto']}
        overflowX={'auto'}
      >
        <Table minW={tableMinWidth} sx={{ tableLayout: 'fixed' }}>
          <colgroup>
            {showPermissionColumn && <col style={{ width: modelTableColumnWidth.selection }} />}
            <col />
            <col style={{ width: modelTableColumnWidth.type }} />
            <col style={{ width: modelTableColumnWidth.billing }} />
            {showPermissionColumn && <col style={{ width: modelTableColumnWidth.permission }} />}
          </colgroup>
          <Tbody>
            {modelList.map((item) => (
              <Tr
                key={`${item.providerId}-${item.typeLabel}-${item.name}`}
                _hover={{ bg: 'myGray.50' }}
                {...getRowSelectionProps(item, {
                  isDisabled: !permissionConfig || !userInfo?.team.permission.hasManagePer
                })}
              >
                {showPermissionColumn && (
                  <Td w={modelTableColumnWidth.selection} px={3}>
                    <Checkbox isChecked={isSelected(item)} onChange={() => toggleSelect(item)} />
                  </Td>
                )}
                <Td fontSize={'sm'}>
                  <HStack>
                    <Avatar src={item.avatar} w={'1.2rem'} />
                    <Flex alignItems={'center'} gap={1} minW={0}>
                      <CopyBox value={item.name} data-row-action color={'myGray.900'}>
                        {item.name}
                      </CopyBox>
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
                <Td>
                  <MyTag colorSchema={item.tagColor as any}>{item.typeLabel}</MyTag>
                </Td>
                <Td fontSize={'sm'}>{item.priceLabel}</Td>
                {showPermissionColumn && (
                  <Td fontSize={'sm'}>
                    <LazyCollaboratorProvider
                      selectedHint={modelPermissionConfigHint}
                      defaultRole={ReadRoleVal}
                      onGetCollaboratorList={() =>
                        getModelCollaborators(getPermissionModelId(item.modelId))
                      }
                      onUpdateCollaborators={({ collaborators }) =>
                        updateModelCollaborators({
                          collaborators,
                          modelIds: [getPermissionModelId(item.modelId)]
                        })
                      }
                      permission={userInfo?.team.permission!}
                    >
                      {({ onOpenManageModal }) => (
                        <MyIconButton
                          icon={'edit'}
                          size="1rem"
                          hoverColor={'blue.500'}
                          w="min-content"
                          data-row-action
                          onClick={onOpenManageModal}
                        />
                      )}
                    </LazyCollaboratorProvider>
                  </Td>
                )}
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>

      <FloatingActionBar
        flexShrink={0}
        borderTopWidth="1px"
        borderColor="myGray.100"
        Controler={
          <LazyCollaboratorProvider
            selectedHint={modelPermissionConfigHint}
            defaultRole={ReadRoleVal}
            onGetCollaboratorList={() =>
              Promise.resolve({
                clbs: []
              })
            }
            onUpdateCollaborators={({ collaborators }) =>
              updateModelCollaborators({
                collaborators,
                modelIds: selectedItems.map((item) => getPermissionModelId(item.modelId))
              })
            }
            permission={userInfo?.team.permission!}
          >
            {({ onOpenManageModal }) => (
              <Button variant={'whiteBase'} onClick={onOpenManageModal}>
                {t('common:permission.Permission config')}
              </Button>
            )}
          </LazyCollaboratorProvider>
        }
      ></FloatingActionBar>
    </Flex>
  );
};

export default ModelTable;

export const ModelPriceModal = ({
  children
}: {
  children: ({ onOpen }: { onOpen: () => void }) => React.ReactNode;
}) => {
  const { t } = useClientTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      {children({ onOpen })}
      {isOpen && (
        <MyModal
          isCentered
          title={t('common:support.wallet.subscription.Ai points')}
          isOpen
          onClose={onClose}
          w={'100%'}
          h={'100%'}
          maxW={'90vw'}
          maxH={'90vh'}
          bodyStyles={{ flex: '1 0 0', minH: 0 }}
        >
          <ModelTable />
        </MyModal>
      )}
    </>
  );
};
