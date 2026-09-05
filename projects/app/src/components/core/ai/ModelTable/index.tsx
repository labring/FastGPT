import {
  Button,
  Box,
  Flex,
  HStack,
  ModalBody,
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
import React, { useMemo, useState } from 'react';
import { SingleSelectFilter } from '@fastgpt/web/components/common/TagFilter';
import { modelTypeList, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
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

const MyModal = dynamic(() => import('@fastgpt/web/components/common/MyModal'));

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
  const getModelProvider = permissionConfig
    ? getMemberModelProvider
    : (provider?: string, language?: string) =>
        getModelProviderFromCache({
          cache: publicProviderCache.ModelProviderMapCache,
          provider,
          language
        });
  const { userInfo } = useUserStore();
  const modelPermissionConfigHint = permissionConfig
    ? t('common:model.permission_config_hint')
    : '';
  const getPermissionModelId = (modelId?: string) => {
    if (!modelId) throw new Error('Permission model ID is missing');
    return modelId;
  };

  const [provider, setProvider] = useState<string | ''>('');
  const providerList = useMemo<
    { label: string; value: string | ''; searchText?: string; avatar?: string }[]
  >(() => {
    const providers = getModelProviderListFromCache(
      permissionConfig ? memberModelProviders : publicProviderCache.ModelProviderListCache,
      i18n.language
    );

    return [
      { label: t('common:All'), value: '' },
      ...providers.map((item) => ({
        label: item.name,
        avatar: item.avatar,
        searchText: item.name,
        value: item.id
      }))
    ];
  }, [i18n.language, memberModelProviders, permissionConfig, publicProviderCache, t]);

  const [modelType, setModelType] = useState<ModelTypeEnum | ''>('');
  const selectModelTypeList = useMemo<{ label: string; value: ModelTypeEnum | '' }[]>(
    () => [
      { label: t('common:All'), value: '' },
      ...modelTypeList.map((item) => ({ label: t(item.label), value: item.value }))
    ],
    [t]
  );

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

  const filterProviderList = useMemo(() => {
    const allProviderIds: string[] = [
      ...llmModelList,
      ...embeddingModelList,
      ...ttsModelList,
      ...sttModelList,
      ...reRankModelList
    ].map((model) => model.provider);

    return providerList.filter((item) => allProviderIds.includes(item.value) || item.value === '');
  }, [ttsModelList, llmModelList, embeddingModelList, sttModelList, reRankModelList, providerList]);

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
      <Flex
        px={contentPx}
        flexDirection={['column', 'row']}
        gap={[3, 6]}
        alignItems={['stretch', 'flex-start']}
      >
        <SingleSelectFilter
          title={t('common:model.provider')}
          value={provider}
          options={filterProviderList}
          onChange={setProvider}
          showSearch
          maxW={'240px'}
        />
        <SingleSelectFilter
          title={t('common:model.model_type')}
          value={modelType}
          options={selectModelTypeList}
          onChange={setModelType}
        />
        <Box
          ml={[0, 'auto']}
          w={'100%'}
          maxW={['100%', '200px']}
          flex={['none', '0 0 200px']}
          flexShrink={0}
        >
          <SearchInput
            bg={'myGray.25'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common:model.search_name_placeholder')}
          />
        </Box>
      </Flex>
      <TableContainer
        mt={5}
        px={contentPx}
        flex={contentPx === undefined ? '1 0 0' : ['0 0 auto', '1 0 0']}
        h={contentPx === undefined ? 0 : ['auto', 0]}
        w={'100%'}
        maxW={'100%'}
        overflowY={contentPx === undefined ? 'auto' : ['visible', 'auto']}
        overflowX={'auto'}
      >
        <Table>
          <Thead>
            <Tr color={'myGray.600'}>
              <Th fontSize={'xs'}>
                <HStack>
                  {permissionConfig && userInfo?.team.permission.hasManagePer && (
                    <Checkbox
                      mr={1}
                      isChecked={isSelecteAll}
                      onChange={selectAllTrigger}
                    ></Checkbox>
                  )}
                  <Box>{t('common:model.name')}</Box>
                </HStack>
              </Th>
              <Th fontSize={'xs'}>{t('common:model.model_type')}</Th>
              <Th fontSize={'xs'}>{t('common:model.billing')}</Th>
              {permissionConfig && userInfo?.team.permission.hasManagePer && (
                <Th fontSize={'xs'}>{t('common:permission.Permission config')}</Th>
              )}
            </Tr>
          </Thead>
          <Tbody>
            {modelList.map((item) => (
              <Tr
                key={`${item.providerId}-${item.typeLabel}-${item.name}`}
                _hover={{ bg: 'myGray.50' }}
                {...getRowSelectionProps(item, {
                  isDisabled: !permissionConfig || !userInfo?.team.permission.hasManagePer
                })}
              >
                <Td fontSize={'sm'}>
                  <HStack>
                    {permissionConfig && userInfo?.team.permission.hasManagePer && (
                      <Checkbox
                        mr={1}
                        isChecked={isSelected(item)}
                        onChange={() => toggleSelect(item)}
                      ></Checkbox>
                    )}
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
                {permissionConfig && userInfo?.team.permission.hasManagePer && (
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
        activedStyles={{
          borderRadius: 'md',
          boxShadow: 'md'
        }}
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
          iconSrc="/imgs/modal/bill.svg"
          title={t('common:support.wallet.subscription.Ai points')}
          isOpen
          onClose={onClose}
          w={'100%'}
          h={'100%'}
          maxW={'90vw'}
          maxH={'90vh'}
        >
          <ModalBody flex={'1 0 0'}>
            <ModelTable />
          </ModalBody>
        </MyModal>
      )}
    </>
  );
};
