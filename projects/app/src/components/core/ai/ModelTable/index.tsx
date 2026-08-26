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
import MySelect from '@fastgpt/web/components/common/MySelect';
import { modelTypeList, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import dynamic from 'next/dynamic';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useTableMultipleSelect } from '@fastgpt/web/hooks/useTableMultipleSelect';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import {
  getModelCollaborators,
  getMyModels,
  getSystemModels,
  updateModelCollaborators
} from '@/web/common/system/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { LazyCollaboratorProvider } from '@/components/support/permission/MemberManager/context';
import PriceTiersLabel from '../PriceTiersLabel';
import TestModeBetaTag from '../TestModeBetaTag';
import ModelCapabilityTags from '../ModelCapabilityTags';
import { useRequest } from '@fastgpt/web/hooks/useRequest';

const MyModal = dynamic(() => import('@fastgpt/web/components/common/MyModal'));

const ModelTable = ({
  permissionConfig = false,
  contentPx
}: {
  permissionConfig?: boolean;
  contentPx?: FlexProps['px'];
}) => {
  const { t, i18n } = useClientTranslation();
  const { getModelProviders, getModelProvider } = useSystemStore();
  const { userInfo } = useUserStore();
  const modelPermissionConfigHint = permissionConfig
    ? t('common:model.permission_config_hint')
    : '';

  const [provider, setProvider] = useState<string | ''>('');
  const providerList = useMemo<{ label: React.ReactNode; value: string | '' }[]>(
    () => [
      { label: t('common:All'), value: '' },
      ...getModelProviders(i18n.language).map((item) => ({
        label: (
          <HStack>
            <Avatar src={item.avatar} w={'1rem'} />
            <Box>{item.name}</Box>
          </HStack>
        ),
        value: item.id
      }))
    ],
    [getModelProviders, i18n.language, t]
  );

  const [modelType, setModelType] = useState<ModelTypeEnum | ''>('');
  const selectModelTypeList = useMemo<{ label: string; value: ModelTypeEnum | '' }[]>(
    () => [
      { label: t('common:All'), value: '' },
      ...modelTypeList.map((item) => ({ label: t(item.label), value: item.value }))
    ],
    [t]
  );

  const [search, setSearch] = useState('');

  const { data: remoteModels = [] } = useRequest(
    async () => {
      const list = await (async () => {
        if (!permissionConfig) return getSystemModels();

        const models: Awaited<ReturnType<typeof getMyModels>>['list'] = [];
        const pageSize = 100;
        let pageNum = 1;
        let total = 0;
        do {
          const response = await getMyModels({ pageNum, pageSize });
          models.push(...response.list);
          total = response.total;
          pageNum += 1;
        } while (models.length < total);
        return models;
      })();

      return list;
    },
    { manual: false, refreshDeps: [permissionConfig] }
  );
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
        modelId: item.modelId,
        model: item.model,
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
        <Flex flexShrink={0} w={['100%', 'auto']} alignItems={'center'} gap={2}>
          <Box
            w={['84px', 'auto']}
            flexShrink={0}
            fontSize={'sm'}
            color={'myGray.900'}
            textAlign={'left'}
          >
            {t('common:model.provider')}
          </Box>
          <Box flex={1} minW={0} w={['100%', '160px']}>
            <MySelect
              w={'100%'}
              bg={'myGray.25'}
              value={provider}
              onChange={setProvider}
              list={filterProviderList}
            />
          </Box>
        </Flex>
        <Flex flexShrink={0} w={['100%', 'auto']} alignItems={'center'} gap={2}>
          <Box
            w={['84px', 'auto']}
            flexShrink={0}
            fontSize={'sm'}
            color={'myGray.900'}
            textAlign={'left'}
          >
            {t('common:model.model_type')}
          </Box>
          <Box flex={1} minW={0} w={['100%', '160px']}>
            <MySelect
              w={'100%'}
              bg={'myGray.25'}
              value={modelType}
              onChange={setModelType}
              list={selectModelTypeList}
            />
          </Box>
        </Flex>
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
            {modelList.map((item, index) => (
              <Tr key={index} _hover={{ bg: 'myGray.50' }}>
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
                      <CopyBox value={item.name} color={'myGray.900'}>
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
                      onGetCollaboratorList={() => getModelCollaborators(item.modelId)}
                      onUpdateCollaborators={({ collaborators }) =>
                        updateModelCollaborators({
                          collaborators,
                          modelIds: [item.modelId]
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
                modelIds: selectedItems.map((i) => i.modelId)
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
