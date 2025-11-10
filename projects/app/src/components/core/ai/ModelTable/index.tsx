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
import { useTranslation } from 'next-i18next';
import React, { useMemo, useRef, useState } from 'react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { modelTypeList, ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import dynamic from 'next/dynamic';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useTableMultipleSelect } from '@fastgpt/web/hooks/useTableMultipleSelect';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { getModelCollaborators, updateModelCollaborators } from '@/web/common/system/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { LazyCollaboratorProvider } from '@/components/support/permission/MemberManager/context';

const MyModal = dynamic(() => import('@fastgpt/web/components/common/MyModal'));

const ModelTable = ({ permissionConfig = false }: { permissionConfig?: boolean }) => {
  const { t, i18n } = useTranslation();
  const { getModelProviders, getModelProvider } = useSystemStore();
  const { userInfo } = useUserStore();

  const [provider, setProvider] = useState<string | ''>('');
  const providerList = useRef<{ label: any; value: string | '' }[]>([
    { label: t('common:All'), value: '' },
    ...(getModelProviders(i18n.language).map((item) => ({
      label: (
        <HStack>
          <Avatar src={item.avatar} w={'1rem'} />
          <Box>{item.name}</Box>
        </HStack>
      ),
      value: item.id
    })) as any)
  ]);

  const [modelType, setModelType] = useState<ModelTypeEnum | ''>('');
  const selectModelTypeList = useRef<{ label: string; value: ModelTypeEnum | '' }[]>([
    { label: t('common:All'), value: '' },
    ...modelTypeList.map((item) => ({ label: t(item.label), value: item.value }))
  ]);

  const [search, setSearch] = useState('');

  const { llmModelList, ttsModelList, embeddingModelList, sttModelList, reRankModelList } =
    useSystemStore();

  const modelList = useMemo(() => {
    const formatLLMModelList = llmModelList.map((item) => ({
      ...item,
      typeLabel: t('common:model.type.chat'),
      priceLabel:
        typeof item.inputPrice === 'number' ? (
          <Box>
            <Flex>
              {`${t('common:Input')}:`}
              <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5} ml={2}>
                {item.inputPrice || 0}
              </Box>
              {`${t('common:support.wallet.subscription.point')} / 1K Tokens`}
            </Flex>
            <Flex>
              {`${t('common:Output')}:`}
              <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5} ml={2}>
                {item.outputPrice || 0}
              </Box>
              {`${t('common:support.wallet.subscription.point')} / 1K Tokens`}
            </Flex>
          </Box>
        ) : (
          <Flex color={'myGray.700'}>
            <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
              {item.charsPointsPrice || 0}
            </Box>
            {`${t('common:support.wallet.subscription.point')} / 1K Tokens`}
          </Flex>
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
        model: item.model,
        name: item.name,
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

    return providerList.current.filter(
      (item) => allProviderIds.includes(item.value) || item.value === ''
    );
  }, [ttsModelList, llmModelList, embeddingModelList, sttModelList, reRankModelList]);

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
    <Flex flexDirection={'column'} h={'100%'}>
      <Flex>
        <HStack flexShrink={0}>
          <Box fontSize={'sm'} color={'myGray.900'}>
            {t('common:model.provider')}
          </Box>
          <MySelect
            w={'200px'}
            bg={'myGray.50'}
            value={provider}
            onChange={setProvider}
            list={filterProviderList}
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
            list={selectModelTypeList.current}
          />
        </HStack>
        <Box flex={1} />
        <Box flex={'0 0 250px'}>
          <SearchInput
            bg={'myGray.50'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common:model.search_name_placeholder')}
          />
        </Box>
      </Flex>
      <TableContainer mt={5} flex={'1 0 0'} h={0} overflowY={'auto'}>
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
                        onChange={(e) => toggleSelect(item)}
                      ></Checkbox>
                    )}
                    <Avatar src={item.avatar} w={'1.2rem'} />
                    <CopyBox value={item.name} color={'myGray.900'}>
                      {item.name}
                    </CopyBox>
                  </HStack>
                </Td>
                <Td>
                  <MyTag colorSchema={item.tagColor as any}>{item.typeLabel}</MyTag>
                </Td>
                <Td fontSize={'sm'}>{item.priceLabel}</Td>
                {permissionConfig && userInfo?.team.permission.hasManagePer && (
                  <Td fontSize={'sm'}>
                    <LazyCollaboratorProvider
                      selectedHint={t('account_model:model_permission_config_hint')}
                      defaultRole={ReadRoleVal}
                      onGetCollaboratorList={() => getModelCollaborators(item.model)}
                      onUpdateCollaborators={({ collaborators }) =>
                        updateModelCollaborators({
                          collaborators,
                          models: [item.model]
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
            selectedHint={t('account_model:model_permission_config_hint')}
            defaultRole={ReadRoleVal}
            onGetCollaboratorList={() =>
              Promise.resolve({
                clbs: []
              })
            }
            onUpdateCollaborators={({ collaborators }) =>
              updateModelCollaborators({
                collaborators,
                models: selectedItems.map((i) => i.model)
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
  const { t } = useTranslation();
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
