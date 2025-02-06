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
import {
  ModelProviderList,
  ModelProviderIdType,
  getModelProvider
} from '@fastgpt/global/core/ai/provider';
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
  getSystemModelDefaultConfig,
  getSystemModelDetail,
  getSystemModelList,
  getTestModel,
  putSystemModel,
  putUpdateDefaultModels
} from '@/web/core/ai/config';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { SystemModelItemType } from '@fastgpt/service/core/ai/type';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useForm } from 'react-hook-form';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import { clientInitData } from '@/web/common/system/staticData';
import { useUserStore } from '@/web/support/user/useUserStore';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { putUpdateWithJson } from '@/web/core/ai/config';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useRefresh } from '../../../../../../packages/web/hooks/useRefresh';
import { Prompt_CQJson, Prompt_ExtractJson } from '@fastgpt/global/core/ai/prompt/agent';

const MyModal = dynamic(() => import('@fastgpt/web/components/common/MyModal'));

const ModelTable = ({ Tab }: { Tab: React.ReactNode }) => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { defaultModels, feConfigs } = useSystemStore();

  const isRoot = userInfo?.username === 'root';

  const [provider, setProvider] = useState<ModelProviderIdType | ''>('');
  const providerList = useRef<{ label: any; value: ModelProviderIdType | '' }[]>([
    { label: t('common:common.All'), value: '' },
    ...ModelProviderList.map((item) => ({
      label: (
        <HStack>
          <Avatar src={item.avatar} w={'1rem'} />
          <Box>{t(item.name as any)}</Box>
        </HStack>
      ),
      value: item.id
    }))
  ]);

  const [modelType, setModelType] = useState<ModelTypeEnum | ''>('');
  const selectModelTypeList = useRef<{ label: string; value: ModelTypeEnum | '' }[]>([
    { label: t('common:common.All'), value: '' },
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
                {`${t('common:common.Input')}:`}
                <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5} ml={2}>
                  {item.inputPrice || 0}
                </Box>
                {`${t('common:support.wallet.subscription.point')} / 1K Tokens`}
              </Flex>
              <Flex>
                {`${t('common:common.Output')}:`}
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
        priceLabel: <Flex color={'myGray.700'}>- </Flex>,
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
      const provider = getModelProvider(item.provider);
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
  }, [systemModelList, t, modelType, provider, search, showActive]);
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
    successToast: t('common:common.Success')
  });
  const { runAsync: updateModel, loading: updatingModel } = useRequest2(putSystemModel, {
    onSuccess: refreshModels
  });

  const { ConfirmModal, openConfirm } = useConfirm({
    type: 'delete',
    content: t('account:model.delete_model_confirm')
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
          <MyMenu
            trigger="hover"
            size="sm"
            Button={<Button>{t('account:create_model')}</Button>}
            menuList={[
              {
                children: [
                  {
                    label: t('common:model.type.chat'),
                    onClick: () => onCreateModel(ModelTypeEnum.llm)
                  },
                  {
                    label: t('common:model.type.embedding'),
                    onClick: () => onCreateModel(ModelTypeEnum.embedding)
                  },
                  {
                    label: t('common:model.type.tts'),
                    onClick: () => onCreateModel(ModelTypeEnum.tts)
                  },
                  {
                    label: t('common:model.type.stt'),
                    onClick: () => onCreateModel(ModelTypeEnum.stt)
                  },
                  {
                    label: t('common:model.type.reRank'),
                    onClick: () => onCreateModel(ModelTypeEnum.rerank)
                  }
                ]
              }
            ]}
          />
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
                onchange={setProvider}
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
                onchange={setModelType}
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
                          onClick={() => onTestModel(item.model)}
                        />
                        <MyIconButton
                          icon={'common/settingLight'}
                          tip={t('account:model.edit_model')}
                          onClick={() => onEditModel(item.model)}
                        />
                        {item.isCustom && (
                          <MyIconButton
                            icon={'delete'}
                            hoverColor={'red.500'}
                            onClick={() => openConfirm(() => deleteModel({ model: item.model }))()}
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

      <ConfirmModal />
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

const InputStyles = {
  maxW: '300px',
  bg: 'myGray.50',
  w: '100%',
  rows: 3
};
const ModelEditModal = ({
  modelData,
  onSuccess,
  onClose
}: {
  modelData: SystemModelItemType;
  onSuccess: () => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const { register, getValues, setValue, handleSubmit, watch, reset } =
    useForm<SystemModelItemType>({
      defaultValues: modelData
    });

  const isCustom = !!modelData.isCustom;
  const isLLMModel = modelData?.type === ModelTypeEnum.llm;
  const isEmbeddingModel = modelData?.type === ModelTypeEnum.embedding;
  const isTTSModel = modelData?.type === ModelTypeEnum.tts;
  const isSTTModel = modelData?.type === ModelTypeEnum.stt;
  const isRerankModel = modelData?.type === ModelTypeEnum.rerank;

  const provider = watch('provider');
  const providerData = useMemo(() => getModelProvider(provider), [provider]);

  const providerList = useRef<{ label: any; value: ModelProviderIdType }[]>(
    ModelProviderList.map((item) => ({
      label: (
        <HStack>
          <Avatar src={item.avatar} w={'1rem'} />
          <Box>{t(item.name as any)}</Box>
        </HStack>
      ),
      value: item.id
    }))
  );

  const priceUnit = useMemo(() => {
    if (isLLMModel || isEmbeddingModel) return '/ 1k Tokens';
    if (isTTSModel) return `/ 1k ${t('common:unit.character')}`;
    if (isSTTModel) return `/ 60 ${t('common:unit.seconds')}`;
    return '';
    return '';
  }, [isLLMModel, isEmbeddingModel, isTTSModel, t, isSTTModel]);

  const { runAsync: updateModel, loading: updatingModel } = useRequest2(
    async (data: SystemModelItemType) => {
      return putSystemModel({
        model: data.model,
        metadata: data
      }).then(onSuccess);
    },
    {
      onSuccess: () => {
        onClose();
      },
      successToast: t('common:common.Success')
    }
  );

  const [key, setKey] = useState(0);
  const { runAsync: loadDefaultConfig, loading: loadingDefaultConfig } = useRequest2(
    getSystemModelDefaultConfig,
    {
      onSuccess(res) {
        reset({
          ...getValues(),
          ...res
        });
        setTimeout(() => {
          setKey((prev) => prev + 1);
        }, 0);
      }
    }
  );

  return (
    <MyModal
      iconSrc={'modal/edit'}
      title={t('account:model.edit_model')}
      isOpen
      onClose={onClose}
      maxW={['90vw', '80vw']}
      w={'100%'}
      h={'100%'}
    >
      <ModalBody>
        <Flex gap={4} key={key}>
          <TableContainer flex={'1'}>
            <Table>
              <Thead>
                <Tr color={'myGray.600'}>
                  <Th fontSize={'xs'}>{t('account:model.param_name')}</Th>
                  <Th fontSize={'xs'}></Th>
                </Tr>
              </Thead>
              <Tbody>
                <Tr>
                  <Td>
                    <HStack spacing={1}>
                      <Box>{t('account:model.model_id')}</Box>
                      <QuestionTip label={t('account:model.model_id_tip')} />
                    </HStack>
                  </Td>
                  <Td textAlign={'right'}>
                    {isCustom ? (
                      <Input {...register('model', { required: true })} {...InputStyles} />
                    ) : (
                      modelData?.model
                    )}
                  </Td>
                </Tr>
                <Tr>
                  <Td>{t('common:model.provider')}</Td>
                  <Td textAlign={'right'}>
                    <MySelect
                      value={provider}
                      onchange={(value) => setValue('provider', value)}
                      list={providerList.current}
                      {...InputStyles}
                    />
                  </Td>
                </Tr>
                <Tr>
                  <Td>
                    <HStack spacing={1}>
                      <Box>{t('account:model.alias')}</Box>
                      <QuestionTip label={t('account:model.alias_tip')} />
                    </HStack>
                  </Td>
                  <Td textAlign={'right'}>
                    <Input {...register('name', { required: true })} {...InputStyles} />
                  </Td>
                </Tr>
                {priceUnit && feConfigs?.isPlus && (
                  <>
                    <Tr>
                      <Td>
                        <HStack spacing={1}>
                          <Box>{t('account:model.charsPointsPrice')}</Box>
                          <QuestionTip label={t('account:model.charsPointsPrice_tip')} />
                        </HStack>
                      </Td>
                      <Td>
                        <Flex justify="flex-end">
                          <HStack w={'100%'} maxW={'300px'}>
                            <MyNumberInput
                              flex={'1 0 0'}
                              register={register}
                              name={'charsPointsPrice'}
                              step={0.01}
                            />
                            <Box fontSize={'sm'}>{priceUnit}</Box>
                          </HStack>
                        </Flex>
                      </Td>
                    </Tr>
                    {isLLMModel && (
                      <>
                        <Tr>
                          <Td>
                            <HStack spacing={1}>
                              <Box>{t('account:model.input_price')}</Box>
                              <QuestionTip label={t('account:model.input_price_tip')} />
                            </HStack>
                          </Td>
                          <Td>
                            <Flex justify="flex-end">
                              <HStack w={'100%'} maxW={'300px'}>
                                <MyNumberInput
                                  flex={'1 0 0'}
                                  register={register}
                                  name={'inputPrice'}
                                  step={0.01}
                                />
                                <Box fontSize={'sm'}>{priceUnit}</Box>
                              </HStack>
                            </Flex>
                          </Td>
                        </Tr>
                        <Tr>
                          <Td>
                            <HStack spacing={1}>
                              <Box>{t('account:model.output_price')}</Box>
                              <QuestionTip label={t('account:model.output_price_tip')} />
                            </HStack>
                          </Td>
                          <Td>
                            <Flex justify="flex-end">
                              <HStack w={'100%'} maxW={'300px'}>
                                <MyNumberInput
                                  flex={'1 0 0'}
                                  register={register}
                                  name={'outputPrice'}
                                  step={0.01}
                                />
                                <Box fontSize={'sm'}>{priceUnit}</Box>
                              </HStack>
                            </Flex>
                          </Td>
                        </Tr>
                      </>
                    )}
                  </>
                )}
                {isLLMModel && (
                  <>
                    <Tr>
                      <Td>{t('common:core.ai.Max context')}</Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <MyNumberInput register={register} name="maxContext" {...InputStyles} />
                        </Flex>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td>{t('account:model.max_quote')}</Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <MyNumberInput
                            register={register}
                            name="quoteMaxToken"
                            {...InputStyles}
                          />
                        </Flex>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td>{t('common:core.chat.response.module maxToken')}</Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <MyNumberInput register={register} name="maxResponse" {...InputStyles} />
                        </Flex>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td>{t('account:model.max_temperature')}</Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <MyNumberInput
                            register={register}
                            name="maxTemperature"
                            step={0.1}
                            {...InputStyles}
                          />
                        </Flex>
                      </Td>
                    </Tr>
                  </>
                )}
                {isEmbeddingModel && (
                  <>
                    <Tr>
                      <Td>
                        <HStack spacing={1}>
                          <Box>{t('account:model.default_token')}</Box>
                          <QuestionTip label={t('account:model.default_token_tip')} />
                        </HStack>
                      </Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <MyNumberInput register={register} name="defaultToken" {...InputStyles} />
                        </Flex>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td>{t('common:core.ai.Max context')}</Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <MyNumberInput register={register} name="maxToken" {...InputStyles} />
                        </Flex>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td>
                        <HStack spacing={1}>
                          <Box>{t('account:model.defaultConfig')}</Box>
                          <QuestionTip label={t('account:model.defaultConfig_tip')} />
                        </HStack>
                      </Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <JsonEditor
                            value={JSON.stringify(getValues('defaultConfig'), null, 2)}
                            onChange={(e) => {
                              if (!e) {
                                setValue('defaultConfig', {});
                                return;
                              }
                              try {
                                setValue('defaultConfig', JSON.parse(e));
                              } catch (error) {
                                console.error(error);
                              }
                            }}
                            {...InputStyles}
                          />
                        </Flex>
                      </Td>
                    </Tr>
                  </>
                )}
                {isTTSModel && (
                  <>
                    <Tr>
                      <Td>
                        <HStack spacing={1}>
                          <Box>{t('account:model.voices')}</Box>
                          <QuestionTip label={t('account:model.voices_tip')} />
                        </HStack>
                      </Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <JsonEditor
                            value={JSON.stringify(getValues('voices'), null, 2)}
                            onChange={(e) => {
                              try {
                                setValue('voices', JSON.parse(e));
                              } catch (error) {
                                console.error(error);
                              }
                            }}
                            {...InputStyles}
                          />
                        </Flex>
                      </Td>
                    </Tr>
                  </>
                )}
                <Tr>
                  <Td>
                    <HStack spacing={1}>
                      <Box>{t('account:model.request_url')}</Box>
                      <QuestionTip label={t('account:model.request_url_tip')} />
                    </HStack>
                  </Td>
                  <Td textAlign={'right'}>
                    <Input {...register('requestUrl')} {...InputStyles} />
                  </Td>
                </Tr>
                <Tr>
                  <Td>
                    <HStack spacing={1}>
                      <Box>{t('account:model.request_auth')}</Box>
                      <QuestionTip label={t('account:model.request_auth_tip')} />
                    </HStack>
                  </Td>
                  <Td textAlign={'right'}>
                    <Input {...register('requestAuth')} {...InputStyles} />
                  </Td>
                </Tr>
              </Tbody>
            </Table>
          </TableContainer>
          {isLLMModel && (
            <TableContainer flex={'1'}>
              <Table>
                <Thead>
                  <Tr color={'myGray.600'}>
                    <Th fontSize={'xs'}>{t('account:model.param_name')}</Th>
                    <Th fontSize={'xs'}></Th>
                  </Tr>
                </Thead>
                <Tbody>
                  <Tr>
                    <Td>
                      <HStack spacing={1}>
                        <Box>{t('account:model.tool_choice')}</Box>
                        <QuestionTip label={t('account:model.tool_choice_tip')} />
                      </HStack>
                    </Td>
                    <Td textAlign={'right'}>
                      <Flex justifyContent={'flex-end'}>
                        <Switch {...register('toolChoice')} />
                      </Flex>
                    </Td>
                  </Tr>
                  <Tr>
                    <Td>
                      <HStack spacing={1}>
                        <Box>{t('account:model.function_call')}</Box>
                        <QuestionTip label={t('account:model.function_call_tip')} />
                      </HStack>
                    </Td>
                    <Td textAlign={'right'}>
                      <Flex justifyContent={'flex-end'}>
                        <Switch {...register('functionCall')} />
                      </Flex>
                    </Td>
                  </Tr>
                  <Tr>
                    <Td>
                      <HStack spacing={1}>
                        <Box>{t('account:model.vision')}</Box>
                        <QuestionTip label={t('account:model.vision_tip')} />
                      </HStack>
                    </Td>
                    <Td textAlign={'right'}>
                      <Flex justifyContent={'flex-end'}>
                        <Switch {...register('vision')} />
                      </Flex>
                    </Td>
                  </Tr>
                  <Tr>
                    <Td>
                      <HStack spacing={1}>
                        <Box>{t('account:model.reasoning')}</Box>
                        <QuestionTip label={t('account:model.reasoning_tip')} />
                      </HStack>
                    </Td>
                    <Td textAlign={'right'}>
                      <Flex justifyContent={'flex-end'}>
                        <Switch {...register('reasoning')} />
                      </Flex>
                    </Td>
                  </Tr>
                  {feConfigs?.isPlus && (
                    <Tr>
                      <Td>
                        <HStack spacing={1}>
                          <Box>{t('account:model.censor')}</Box>
                          <QuestionTip label={t('account:model.censor_tip')} />
                        </HStack>
                      </Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <Switch {...register('censor')} />
                        </Flex>
                      </Td>
                    </Tr>
                  )}
                  <Tr>
                    <Td>{t('account:model.dataset_process')}</Td>
                    <Td textAlign={'right'}>
                      <Flex justifyContent={'flex-end'}>
                        <Switch {...register('datasetProcess')} />
                      </Flex>
                    </Td>
                  </Tr>
                  <Tr>
                    <Td>{t('account:model.used_in_classify')}</Td>
                    <Td textAlign={'right'}>
                      <Flex justifyContent={'flex-end'}>
                        <Switch {...register('usedInClassify')} />
                      </Flex>
                    </Td>
                  </Tr>
                  <Tr>
                    <Td>{t('account:model.used_in_extract_fields')}</Td>
                    <Td textAlign={'right'}>
                      <Flex justifyContent={'flex-end'}>
                        <Switch {...register('usedInExtractFields')} />
                      </Flex>
                    </Td>
                  </Tr>
                  <Tr>
                    <Td>{t('account:model.used_in_tool_call')}</Td>
                    <Td textAlign={'right'}>
                      <Flex justifyContent={'flex-end'}>
                        <Switch {...register('usedInToolCall')} />
                      </Flex>
                    </Td>
                  </Tr>
                  <Tr>
                    <Td>
                      <HStack spacing={1}>
                        <Box>{t('account:model.default_system_chat_prompt')}</Box>
                        <QuestionTip label={t('account:model.default_system_chat_prompt_tip')} />
                      </HStack>
                    </Td>
                    <Td textAlign={'right'}>
                      <MyTextarea {...register('defaultSystemChatPrompt')} {...InputStyles} />
                    </Td>
                  </Tr>
                  <Tr>
                    <Td>
                      <HStack spacing={1}>
                        <Box>{t('account:model.custom_cq_prompt')}</Box>
                        <QuestionTip
                          label={t('account:model.custom_cq_prompt_tip', { prompt: Prompt_CQJson })}
                        />
                      </HStack>
                    </Td>
                    <Td textAlign={'right'}>
                      <MyTextarea {...register('customCQPrompt')} {...InputStyles} />
                    </Td>
                  </Tr>
                  <Tr>
                    <Td>
                      <HStack spacing={1}>
                        <Box>{t('account:model.custom_extract_prompt')}</Box>
                        <QuestionTip
                          label={t('account:model.custom_extract_prompt_tip', {
                            prompt: Prompt_ExtractJson
                          })}
                        />
                      </HStack>
                    </Td>
                    <Td textAlign={'right'}>
                      <MyTextarea {...register('customExtractPrompt')} {...InputStyles} />
                    </Td>
                  </Tr>
                  <Tr>
                    <Td>
                      <HStack spacing={1}>
                        <Box>{t('account:model.default_config')}</Box>
                        <QuestionTip label={t('account:model.default_config_tip')} />
                      </HStack>
                    </Td>
                    <Td textAlign={'right'}>
                      <JsonEditor
                        value={JSON.stringify(getValues('defaultConfig'), null, 2)}
                        resize
                        onChange={(e) => {
                          if (!e) {
                            setValue('defaultConfig', {});
                            return;
                          }
                          try {
                            setValue('defaultConfig', JSON.parse(e));
                          } catch (error) {
                            console.error(error);
                          }
                        }}
                        {...InputStyles}
                      />
                    </Td>
                  </Tr>
                </Tbody>
              </Table>
            </TableContainer>
          )}
        </Flex>
      </ModalBody>
      <ModalFooter>
        {!modelData.isCustom && (
          <Button
            isLoading={loadingDefaultConfig}
            variant={'whiteBase'}
            mr={4}
            onClick={() => loadDefaultConfig(modelData.model)}
          >
            {t('account:reset_default')}
          </Button>
        )}
        <Button variant={'whiteBase'} mr={4} onClick={onClose}>
          {t('common:common.Cancel')}
        </Button>
        <Button isLoading={updatingModel} onClick={handleSubmit(updateModel)}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
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

  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('account:model.json_config_confirm')
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
          {t('common:common.Cancel')}
        </Button>
        <Button
          onClick={() =>
            openConfirm(() => {
              return runAsync({ config: data });
            })()
          }
        >
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>

      <ConfirmModal />
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
    embeddingModelList,
    ttsModelList,
    sttModelList,
    reRankModelList
  } = useSystemStore();

  // Create a copy of defaultModels for local state management
  const [defaultData, setDefaultData] = useState(defaultModels);

  const { runAsync, loading } = useRequest2(putUpdateDefaultModels, {
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    successToast: t('common:common.Update Success')
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
              onchange={(e) => {
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
              onchange={(e) => {
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
              onchange={(e) => {
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
              onchange={(e) => {
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
              onchange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  rerank: reRankModelList.find((item) => item.model === e)
                }));
              }}
            />
          </Box>
        </Box>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={4} onClick={onClose}>
          {t('common:common.Cancel')}
        </Button>
        <Button
          isLoading={loading}
          onClick={() =>
            runAsync({
              [ModelTypeEnum.llm]: defaultData.llm?.model,
              [ModelTypeEnum.embedding]: defaultData.embedding?.model,
              [ModelTypeEnum.tts]: defaultData.tts?.model,
              [ModelTypeEnum.stt]: defaultData.stt?.model,
              [ModelTypeEnum.rerank]: defaultData.rerank?.model
            })
          }
        >
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default ModelTable;
