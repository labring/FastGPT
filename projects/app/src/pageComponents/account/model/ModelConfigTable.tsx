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
  Input,
  ModalFooter,
  Button,
  useDisclosure
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { modelTypeList, ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import dynamic from 'next/dynamic';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  deleteSystemModel,
  getModelConfigJson,
  getSystemModelDetail,
  getSystemModelList,
  getTestModel,
  putSystemModel,
  putUpdateDefaultModels
} from '@/web/core/ai/config';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { type SystemModelItemType } from '@fastgpt/service/core/ai/type';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import { clientInitData } from '@/web/common/system/staticData';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { putUpdateWithJson } from '@/web/core/ai/config';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import AIModelSelector from '@/components/Select/AIModelSelector';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { AddModelButton } from './AddModelBox';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';

const MyModal = dynamic(() => import('@fastgpt/web/components/common/MyModal'));
const ModelEditModal = dynamic(() => import('./AddModelBox').then((mod) => mod.ModelEditModal));

const ModelTable = ({ Tab }: { Tab: React.ReactNode }) => {
  const { t, i18n } = useTranslation();
  const { userInfo } = useUserStore();
  const { defaultModels, feConfigs, getModelProviders, getModelProvider } = useSystemStore();

  const isRoot = userInfo?.username === 'root';

  const [provider, setProvider] = useState<string | ''>('');
  const providerList = useRef<{ label: React.ReactNode; value: string | '' }[]>([
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
  ]);

  const [modelType, setModelType] = useState<ModelTypeEnum | ''>('');
  const selectModelTypeList = useRef<{ label: string; value: ModelTypeEnum | '' }[]>([
    { label: t('common:All'), value: '' },
    ...modelTypeList.map((item) => ({ label: t(item.label), value: item.value }))
  ]);

  const [search, setSearch] = useState('');
  const [showActive, setShowActive] = useState(false);

  const {
    data: systemModelList = [],
    runAsync: refreshSystemModelList,
    loading: loadingModels
  } = useRequest2(getSystemModelList, {
    manual: false
  });
  const refreshModels = useCallback(async () => {
    clientInitData();
    refreshSystemModelList();
  }, [refreshSystemModelList]);

  const modelList = useMemo(() => {
    const formatLLMModelList = systemModelList
      .filter((item) => item.type === ModelTypeEnum.llm)
      .map((item) => ({
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
    const formatVectorModelList = systemModelList
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
    const formatAudioSpeechModelList = systemModelList
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
    const formatWhisperModel = systemModelList
      .filter((item) => item.type === ModelTypeEnum.stt)
      .map((item) => ({
        ...item,
        typeLabel: t('common:model.type.stt'),
        priceLabel: (
          <Flex color={'myGray.700'}>
            <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
              {item.charsPointsPrice || 0}
            </Box>
            {` ${t('common:support.wallet.subscription.point')} / 60${t('common:unit.seconds')}`}
          </Flex>
        ),
        tagColor: 'purple'
      }));
    const formatRerankModelList = systemModelList
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

    const formatList = list.map((item) => {
      const provider = getModelProvider(item.provider, i18n.language);
      return {
        ...item,
        avatar: provider.avatar,
        providerId: provider.id,
        providerName: t(provider.name as any),
        order: provider.order
      };
    });
    formatList.sort((a, b) => a.order - b.order);

    const filterList = formatList.filter((item) => {
      const providerFilter = provider ? item.providerId === provider : true;

      const regx = new RegExp(search, 'i');
      const nameFilter = search ? regx.test(item.name) : true;

      const activeFilter = showActive ? item.isActive : true;

      return providerFilter && nameFilter && activeFilter;
    });

    return filterList;
  }, [
    systemModelList,
    t,
    modelType,
    getModelProvider,
    i18n.language,
    provider,
    search,
    showActive
  ]);
  const activeModelLength = useMemo(() => {
    return modelList.filter((item) => item.isActive).length;
  }, [modelList]);

  const filterProviderList = useMemo(() => {
    const allProviderIds: string[] = systemModelList.map((model) => model.provider);

    return providerList.current.filter(
      (item) => allProviderIds.includes(item.value) || item.value === ''
    );
  }, [systemModelList]);

  const { runAsync: onTestModel, loading: testingModel } = useRequest2(getTestModel, {
    manual: true,
    successToast: t('common:Success')
  });
  const { runAsync: updateModel, loading: updatingModel } = useRequest2(putSystemModel, {
    onSuccess: refreshModels
  });

  const { runAsync: deleteModel } = useRequest2(deleteSystemModel, {
    onSuccess: refreshModels
  });

  const [editModelData, setEditModelData] = useState<SystemModelItemType>();
  const { runAsync: onEditModel, loading: loadingData } = useRequest2(
    (modelId: string) => getSystemModelDetail(modelId),
    {
      onSuccess: (data: SystemModelItemType) => {
        setEditModelData(data);
      }
    }
  );

  const onCreateModel = (type: ModelTypeEnum) => {
    const defaultModel = defaultModels[type];

    setEditModelData({
      ...defaultModel,
      model: '',
      name: '',
      charsPointsPrice: 0,
      inputPrice: undefined,
      outputPrice: undefined,

      isCustom: true,
      isActive: true,

      isDefault: false,
      isDefaultDatasetTextModel: false,
      isDefaultDatasetImageModel: false,
      // @ts-ignore
      type
    });
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

  const isLoading = loadingModels || loadingData || updatingModel || testingModel;

  const [showModelId, setShowModelId] = useState(true);

  return (
    <>
      {isRoot && (
        <Flex alignItems={'center'}>
          {Tab}
          <Box flex={1} />
          <Button variant={'whiteBase'} mr={2} onClick={onOpenDefaultModel}>
            {t('account:model.default_model')}
          </Button>
          <Button variant={'whiteBase'} mr={2} onClick={onOpenJsonConfig}>
            {t('account:model.json_config')}
          </Button>
          <AddModelButton onCreate={onCreateModel} />
        </Flex>
      )}
      <MyBox flex={'1 0 0'} isLoading={isLoading}>
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
                    <HStack
                      spacing={1}
                      cursor={'pointer'}
                      onClick={() => setShowModelId(!showModelId)}
                    >
                      <Box>
                        {showModelId ? t('account:model.model_id') : t('common:model.name')}
                      </Box>
                      <MyIcon name={'modal/changePer'} w={'1rem'} />
                    </HStack>
                  </Th>
                  <Th fontSize={'xs'}>{t('common:model.model_type')}</Th>
                  {feConfigs?.isPlus && <Th fontSize={'xs'}>{t('common:model.billing')}</Th>}
                  <Th fontSize={'xs'}>
                    <Box
                      cursor={'pointer'}
                      onClick={() => setShowActive(!showActive)}
                      color={showActive ? 'primary.600' : 'myGray.600'}
                    >
                      {t('account:model.active')}({activeModelLength})
                    </Box>
                  </Th>
                  <Th fontSize={'xs'}></Th>
                </Tr>
              </Thead>
              <Tbody>
                {modelList.map((item, index) => (
                  <Tr key={item.model} _hover={{ bg: 'myGray.50' }}>
                    <Td fontSize={'sm'}>
                      <HStack>
                        <Avatar src={item.avatar} w={'1.2rem'} borderRadius={'50%'} />
                        <CopyBox
                          value={showModelId ? item.model : item.name}
                          color={'myGray.900'}
                          fontWeight={'500'}
                        >
                          {showModelId ? item.model : item.name}
                        </CopyBox>
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
                    <Td fontSize={'sm'}>
                      <Switch
                        size={'sm'}
                        isChecked={item.isActive}
                        onChange={(e) =>
                          updateModel({
                            model: item.model,
                            metadata: { isActive: e.target.checked }
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
                          onClick={() => onTestModel({ model: item.model })}
                        />
                        <MyIconButton
                          icon={'common/settingLight'}
                          tip={t('account:model.edit_model')}
                          onClick={() => onEditModel(item.model)}
                        />
                        {item.isCustom && (
                          <PopoverConfirm
                            Trigger={
                              <Box>
                                <MyIconButton icon={'delete'} hoverColor={'red.500'} />
                              </Box>
                            }
                            type="delete"
                            content={t('account:model.delete_model_confirm')}
                            onConfirm={() => deleteModel({ model: item.model })}
                          />
                        )}
                      </HStack>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
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
        <DefaultModelModal onClose={onCloseDefaultModel} onSuccess={refreshModels} />
      )}
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
  const { loading } = useRequest2(getModelConfigJson, {
    manual: false,
    onSuccess(res) {
      setData(res);
    }
  });

  const { runAsync } = useRequest2(putUpdateWithJson, {
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

const labelStyles = {
  fontSize: 'sm',
  color: 'myGray.900',
  mb: 0.5
};
const DefaultModelModal = ({
  onSuccess,
  onClose
}: {
  onSuccess: () => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const {
    defaultModels,
    llmModelList,
    datasetModelList,
    embeddingModelList,
    ttsModelList,
    sttModelList,
    reRankModelList,
    getVlmModelList
  } = useSystemStore();
  const vlmModelList = useMemo(() => getVlmModelList(), [getVlmModelList]);

  // Create a copy of defaultModels for local state management
  const [defaultData, setDefaultData] = useState(defaultModels);

  const { runAsync, loading } = useRequest2(putUpdateDefaultModels, {
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    successToast: t('common:update_success')
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('account:default_model_config')}
      iconSrc="modal/edit"
    >
      <ModalBody>
        <Box>
          <Box {...labelStyles}>{t('common:model.type.chat')}</Box>
          <Box flex={1}>
            <AIModelSelector
              bg="myGray.50"
              value={defaultData.llm?.model}
              list={llmModelList.map((item) => ({
                value: item.model,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  llm: llmModelList.find((item) => item.model === e)
                }));
              }}
            />
          </Box>
        </Box>
        <Box mt={4}>
          <Box {...labelStyles}>{t('common:model.type.embedding')}</Box>
          <Box flex={1}>
            <AIModelSelector
              bg="myGray.50"
              value={defaultData.embedding?.model}
              list={embeddingModelList.map((item) => ({
                value: item.model,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  embedding: embeddingModelList.find((item) => item.model === e)
                }));
              }}
            />
          </Box>
        </Box>
        <Box mt={4}>
          <Box {...labelStyles}>{t('common:model.type.tts')}</Box>
          <Box flex={1}>
            <AIModelSelector
              bg="myGray.50"
              value={defaultData.tts?.model}
              list={ttsModelList.map((item) => ({
                value: item.model,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  tts: ttsModelList.find((item) => item.model === e)
                }));
              }}
            />
          </Box>
        </Box>
        <Box mt={4}>
          <Box {...labelStyles}>{t('common:model.type.stt')}</Box>
          <Box flex={1}>
            <AIModelSelector
              bg="myGray.50"
              value={defaultData.stt?.model}
              list={sttModelList.map((item) => ({
                value: item.model,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  stt: sttModelList.find((item) => item.model === e)
                }));
              }}
            />
          </Box>
        </Box>
        <Box mt={4}>
          <Box {...labelStyles}>{t('common:model.type.reRank')}</Box>
          <Box flex={1}>
            <AIModelSelector
              bg="myGray.50"
              value={defaultData.rerank?.model}
              list={reRankModelList.map((item) => ({
                value: item.model,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  rerank: reRankModelList.find((item) => item.model === e)
                }));
              }}
            />
          </Box>
        </Box>
        <MyDivider />
        <Box>
          <Flex {...labelStyles} alignItems={'center'}>
            <Box mr={0.5}>{t('common:core.ai.model.Dataset Agent Model')}</Box>
            <QuestionTip label={t('common:dataset_text_model_tip')} />
          </Flex>
          <Box flex={1}>
            <AIModelSelector
              bg="myGray.50"
              value={defaultData.datasetTextLLM?.model}
              list={datasetModelList.map((item) => ({
                value: item.model,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  datasetTextLLM: datasetModelList.find((item) => item.model === e)
                }));
              }}
            />
          </Box>
        </Box>
        <Box>
          <Flex mt={4} {...labelStyles} alignItems={'center'}>
            <Box mr={0.5}>{t('account_model:vlm_model')}</Box>
            <QuestionTip label={t('account_model:vlm_model_tip')} />
          </Flex>
          <Box flex={1}>
            <AIModelSelector
              bg="myGray.50"
              value={defaultData.datasetImageLLM?.model}
              list={vlmModelList.map((item) => ({
                value: item.model,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  datasetImageLLM: vlmModelList.find((item) => item.model === e)
                }));
              }}
            />
          </Box>
        </Box>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={4} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button
          isLoading={loading}
          onClick={() =>
            runAsync({
              [ModelTypeEnum.llm]: defaultData.llm?.model,
              [ModelTypeEnum.embedding]: defaultData.embedding?.model,
              [ModelTypeEnum.tts]: defaultData.tts?.model,
              [ModelTypeEnum.stt]: defaultData.stt?.model,
              [ModelTypeEnum.rerank]: defaultData.rerank?.model,
              datasetTextLLM: defaultData.datasetTextLLM?.model,
              datasetImageLLM: defaultData.datasetImageLLM?.model
            })
          }
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default ModelTable;
