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
  Checkbox
} from '@chakra-ui/react';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React, { useMemo, useState } from 'react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { modelTypeList, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import {
  getModelCollaborators,
  getModelListPage,
  getTestModel,
  updateModelCollaborators
} from '@/web/core/ai/config';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import dynamic from 'next/dynamic';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useTableMultipleSelect } from '@fastgpt/web/hooks/useTableMultipleSelect';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { useUserStore } from '@/web/support/user/useUserStore';
import { LazyCollaboratorProvider } from '@/components/support/permission/MemberManager/context';
import PriceTiersLabel from '../PriceTiersLabel';
import TestModeBetaTag from '../TestModeBetaTag';
import ModelCapabilityTags from '../ModelCapabilityTags';
import ChannelCountPopover from '../ChannelCountPopover';
import type { ListModelsBody, ModelListItem } from '@fastgpt/global/openapi/core/ai/model/api';
import { ModelPermission } from '@fastgpt/global/support/permission/model/controller';

const MyModal = dynamic(() => import('@fastgpt/web/components/common/MyModal'));

const ModelTable = ({ permissionConfig = false }: { permissionConfig?: boolean }) => {
  const { t, i18n } = useClientTranslation('account_model');
  const { getModelProviders, getModelProvider } = useSystemStore();
  const { userInfo } = useUserStore();
  const modelPermissionConfigHint = permissionConfig
    ? t('account_model:model_permission_config_hint')
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
  const [modelScope, setModelScope] = useState<'all' | 'system' | 'team'>('all');
  const modelScopeList = useMemo(
    () => [
      { label: t('common:All'), value: 'all' as const },
      { label: t('account_model:model.system_models'), value: 'system' as const },
      { label: t('account_model:model.team_models'), value: 'team' as const }
    ],
    [t]
  );

  // 后端分页 + 过滤（设计 §13.1）：每页 20 条，搜索/类型/提供商走后端参数
  const { data: modelList = [], Pagination } = usePagination<ListModelsBody, ModelListItem>(
    (params) =>
      getModelListPage({
        ...params,
        provider: provider || undefined,
        type: modelType || undefined,
        search: search || undefined,
        isSystem: modelScope === 'all' ? undefined : modelScope === 'system',
        isActive: 'active'
      }),
    {
      defaultPageSize: 20,
      refreshDeps: [provider, modelType, search, modelScope]
    }
  );

  const { runAsync: onTestModel } = useRequest(getTestModel, {
    manual: true,
    successToast: t('common:Success')
  });

  const modelListFormat = useMemo(() => {
    const formatLLMModelList = modelList
      .filter((item) => item.type === ModelTypeEnum.llm)
      .map((item) => ({
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
    const formatVectorModelList = modelList
      .filter((item) => item.type === ModelTypeEnum.embedding)
      .map((item) => ({
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
    const formatAudioSpeechModelList = modelList
      .filter((item) => item.type === ModelTypeEnum.tts)
      .map((item) => ({
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
    const formatWhisperModelList = modelList
      .filter((item) => item.type === ModelTypeEnum.stt)
      .map((item) => ({
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
    const formatRerankModelList = modelList
      .filter((item) => item.type === ModelTypeEnum.rerank)
      .map((item) => ({
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

    // Provider meta for display; order kept from the backend response (design §7.1)
    return list.map((item) => {
      const provider = getModelProvider(item.provider, i18n.language);
      return {
        id: item.id,
        model: item.model,
        name: item.name,
        isSystem: item.isSystem,
        testMode: item.testMode,
        contextToken: item.contextToken,
        vision: item.vision,
        audio: item.audio,
        video: item.video,
        reasoning: item.reasoning,
        toolChoice: item.toolChoice,
        channelCount: item.channelCount,
        sourceMember: item.sourceMember,
        permission: new ModelPermission({
          role: item.permission.role,
          isOwner: item.permission.isOwner
        }),
        avatar: provider.avatar,
        providerId: provider.id,
        providerName: t(provider.name as any),
        typeLabel: item.typeLabel,
        priceLabel: item.priceLabel,
        tagColor: item.tagColor
      };
    });
  }, [modelList, t, modelType, getModelProvider, i18n.language]);

  const manageableModelList = useMemo(
    () => modelListFormat.filter((item) => item.permission.hasManagePer),
    [modelListFormat]
  );
  const showPermissionConfig = permissionConfig && manageableModelList.length > 0;

  const {
    selectedItems,
    toggleSelect,
    isSelected,
    FloatingActionBar,
    isSelecteAll,
    selectAllTrigger
  } = useTableMultipleSelect({
    list: manageableModelList,
    // design §13.1: modelId is the stable identity — model names can collide
    // across teams, so the batch action must not select by name.
    getItemId: (e) => e.id
  });

  return (
    <Flex flexDirection={'column'} h={'100%'} minW={0}>
      <Flex flexDirection={['column', 'row']} gap={[3, 0]} alignItems={['stretch', 'center']}>
        <Flex flexShrink={0} w={['100%', 'auto']} alignItems={'center'} gap={2} mr={[0, 6]}>
          <Box w={['84px', 'auto']} flexShrink={0} fontSize={'sm'} color={'myGray.900'}>
            {t('account_model:model.scope')}
          </Box>
          <Box flex={1} minW={0} w={['100%', '150px']}>
            <MySelect
              w={'100%'}
              bg={'myGray.50'}
              value={modelScope}
              onChange={setModelScope}
              list={modelScopeList}
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
            {t('common:model.provider')}
          </Box>
          <Box flex={1} minW={0} w={['100%', '200px']}>
            <MySelect
              w={'100%'}
              bg={'myGray.50'}
              value={provider}
              onChange={setProvider}
              list={providerList}
            />
          </Box>
        </Flex>
        <Flex flexShrink={0} ml={[0, 6]} w={['100%', 'auto']} alignItems={'center'} gap={2}>
          <Box
            w={['84px', 'auto']}
            flexShrink={0}
            fontSize={'sm'}
            color={'myGray.900'}
            textAlign={'left'}
          >
            {t('common:model.model_type')}
          </Box>
          <Box flex={1} minW={0} w={['100%', '150px']}>
            <MySelect
              w={'100%'}
              bg={'myGray.50'}
              value={modelType}
              onChange={setModelType}
              list={selectModelTypeList}
            />
          </Box>
        </Flex>
        <Box flex={1} display={['none', 'block']} />
        <Box w={['100%', '250px']} flex={['none', '0 0 250px']}>
          <SearchInput
            bg={'myGray.50'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common:model.search_name_placeholder')}
          />
        </Box>
      </Flex>
      <TableContainer
        mt={5}
        flex={'1 0 0'}
        h={0}
        w={'100%'}
        maxW={'100%'}
        overflowY={'auto'}
        overflowX={'auto'}
      >
        <Table>
          <Thead>
            <Tr color={'myGray.600'}>
              <Th fontSize={'xs'}>
                <HStack>
                  {showPermissionConfig && (
                    <Checkbox
                      mr={1}
                      isChecked={isSelecteAll}
                      onChange={selectAllTrigger}
                    ></Checkbox>
                  )}
                  <Box>{t('common:model.name')}</Box>
                </HStack>
              </Th>
              <Th fontSize={'xs'}>{t('account_model:model.model_id')}</Th>
              <Th fontSize={'xs'}>{t('common:model.model_type')}</Th>
              <Th fontSize={'xs'}>{t('common:model.billing')}</Th>
              <Th fontSize={'xs'}>{t('common:model.provider')}</Th>
              <Th fontSize={'xs'}>{t('account_model:channel_creator')}</Th>
              <Th fontSize={'xs'}>{t('account_model:model.channel_count')}</Th>
              {showPermissionConfig && (
                <Th fontSize={'xs'}>{t('common:permission.Permission config')}</Th>
              )}
              <Th fontSize={'xs'}>{t('account_model:model.action')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {modelListFormat.map((item) => (
              <Tr key={item.id} _hover={{ bg: 'myGray.50' }}>
                <Td fontSize={'sm'}>
                  <HStack>
                    {showPermissionConfig && item.permission.hasManagePer && (
                      <Checkbox
                        mr={1}
                        isChecked={isSelected(item)}
                        onChange={() => toggleSelect(item)}
                      ></Checkbox>
                    )}
                    <Avatar src={item.avatar} w={'1.2rem'} />
                    <Flex alignItems={'center'} gap={1} minW={0}>
                      <CopyBox value={item.name || item.model} color={'myGray.900'}>
                        {item.name || item.model}
                      </CopyBox>
                      {item.isSystem && (
                        <MyTag colorSchema={'green'}>
                          {t('account_model:model.system_models')}
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
                <Td fontSize={'sm'}>{item.priceLabel}</Td>
                <Td fontSize={'sm'} color={'myGray.700'}>
                  {item.providerName}
                </Td>
                <Td fontSize={'sm'} color={'myGray.700'}>
                  {item.sourceMember?.name || '-'}
                </Td>
                <Td fontSize={'sm'}>
                  <ChannelCountPopover count={item.channelCount ?? 0} modelId={item.id} />
                </Td>
                {showPermissionConfig && (
                  <Td fontSize={'sm'}>
                    {item.permission.hasManagePer && (
                      <LazyCollaboratorProvider
                        selectedHint={modelPermissionConfigHint}
                        defaultRole={ReadRoleVal}
                        onGetCollaboratorList={() => getModelCollaborators(item.id)}
                        onUpdateCollaborators={({ collaborators }) =>
                          updateModelCollaborators({
                            collaborators,
                            modelIds: [item.id]
                          })
                        }
                        permission={item.permission}
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
                    )}
                  </Td>
                )}
                <Td>
                  <MyIconButton
                    icon={'core/chat/sendLight'}
                    tip={t('account_model:model.test_model')}
                    onClick={() => onTestModel({ id: item.id })}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>

      <Flex justifyContent={'center'} mt={3}>
        {Pagination()}
      </Flex>

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
                modelIds: selectedItems.map((i) => i.id)
              })
            }
            permission={selectedItems[0]?.permission ?? userInfo?.team.permission!}
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
