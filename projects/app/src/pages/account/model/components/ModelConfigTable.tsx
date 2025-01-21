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
  Button
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
  getSystemModelDetail,
  getSystemModelList,
  putSystemModel
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
import { delay } from '@fastgpt/global/common/system/utils';

const MyModal = dynamic(() => import('@fastgpt/web/components/common/MyModal'));

const ModelTable = ({ Tab }: { Tab: React.ReactNode }) => {
  const { t } = useTranslation();
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
                {item.charsPointsPrice}
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
              {item.charsPointsPrice}
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
              {item.charsPointsPrice}
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
              {item.charsPointsPrice}
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

      return providerFilter && nameFilter;
    });

    return filterList;
  }, [systemModelList, t, modelType, provider, search]);

  const filterProviderList = useMemo(() => {
    const allProviderIds: string[] = systemModelList.map((model) => model.provider);

    return providerList.current.filter(
      (item) => allProviderIds.includes(item.value) || item.value === ''
    );
  }, [systemModelList]);

  const { runAsync: updateModel, loading: updatingModel } = useRequest2(putSystemModel, {
    onSuccess: refreshModels
  });

  const { ConfirmModal, openConfirm } = useConfirm({
    type: 'delete',
    content: t('account:model.delete_model_confirm')
  });
  const { runAsync: deleteModel, loading: deletingModel } = useRequest2(deleteSystemModel, {
    onSuccess: refreshModels
  });

  const [updateModelId, setUpdateModelId] = useState<string>();

  const isLoading = loadingModels || updatingModel || deletingModel;

  return (
    <>
      <Flex justifyContent={'space-between'}>{Tab}</Flex>
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
                  <Th fontSize={'xs'}>{t('common:model.name')}</Th>
                  <Th fontSize={'xs'}>{t('common:model.model_type')}</Th>
                  <Th fontSize={'xs'}>{t('common:model.billing')}</Th>
                  <Th fontSize={'xs'}>{t('account:model.active')}</Th>
                  <Th fontSize={'xs'}></Th>
                </Tr>
              </Thead>
              <Tbody>
                {modelList.map((item, index) => (
                  <Tr key={index} _hover={{ bg: 'myGray.50' }}>
                    <Td fontSize={'sm'}>
                      <HStack>
                        <Avatar src={item.avatar} w={'1.2rem'} />
                        <Box color={'myGray.900'}>{item.name}</Box>
                      </HStack>
                    </Td>
                    <Td>
                      <MyTag colorSchema={item.tagColor as any}>{item.typeLabel}</MyTag>
                    </Td>
                    <Td fontSize={'sm'}>{item.priceLabel}</Td>
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
                          icon={'common/settingLight'}
                          onClick={() => setUpdateModelId(item.model)}
                        />
                        {item.isCustom && (
                          <MyIconButton
                            icon={'delete'}
                            hoverColor={'red.500'}
                            onClick={() => openConfirm(() => deleteModel({ model: item.model }))}
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
      {!!updateModelId && (
        <ModelEditModal
          modelId={updateModelId}
          onSuccess={refreshModels}
          onClose={() => setUpdateModelId(undefined)}
        />
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
  modelId,
  onSuccess,
  onClose
}: {
  modelId: string;
  onSuccess: () => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();

  const { register, reset, getValues, setValue, handleSubmit } = useForm<SystemModelItemType>();

  const { data: modelData, loading: loadingData } = useRequest2(
    () => getSystemModelDetail(modelId),
    {
      manual: false,
      onSuccess: (data) => {
        reset(data);
      }
    }
  );
  const isLLMModel = modelData?.type === ModelTypeEnum.llm;
  const isEmbeddingModel = modelData?.type === ModelTypeEnum.embedding;
  const isTTSModel = modelData?.type === ModelTypeEnum.tts;
  const isSTTModel = modelData?.type === ModelTypeEnum.stt;
  const isRerankModel = modelData?.type === ModelTypeEnum.rerank;

  const provider = getModelProvider(modelData?.provider);
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
        model: modelId,
        metadata: data
      }).then(onSuccess);
    },
    {
      onSuccess: () => {
        onClose();
      }
    }
  );

  return (
    <MyModal
      isLoading={loadingData}
      iconSrc={modelData?.avatar}
      title={t('account:model.edit_model')}
      isOpen
      onClose={onClose}
      maxW={['90vw', '80vw']}
      w={'100%'}
      h={'100%'}
    >
      <ModalBody>
        <Flex gap={4}>
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
                  <Td>{t('account:model.model_id')}</Td>
                  <Td textAlign={'right'}>{modelData?.model}</Td>
                </Tr>
                <Tr>
                  <Td>Provider</Td>
                  <Td textAlign={'right'}>
                    <HStack justifyContent={'flex-end'}>
                      <Avatar src={provider.avatar} w={'1rem'} />
                      <Box>{t(provider.name)}</Box>
                    </HStack>
                  </Td>
                </Tr>
                <Tr>
                  <Td>Alias</Td>
                  <Td textAlign={'right'}>
                    <Input {...register('name')} {...InputStyles} />
                  </Td>
                </Tr>
                {priceUnit && (
                  <Tr>
                    <Td>Price</Td>
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
                )}

                {isLLMModel && (
                  <>
                    <Tr>
                      <Td>Max Context</Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <MyNumberInput register={register} name="maxContext" {...InputStyles} />
                        </Flex>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td>Max Quote</Td>
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
                      <Td>Max Tokens</Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <MyNumberInput register={register} name="maxResponse" {...InputStyles} />
                        </Flex>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td>Max Temperature</Td>
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
                    <Tr>
                      <Td>toolChoice</Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <Switch {...register('toolChoice')} />
                        </Flex>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td>functionCall</Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <Switch {...register('functionCall')} />
                        </Flex>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td>Censor</Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <Switch {...register('censor')} />
                        </Flex>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td>Vision</Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <Switch {...register('vision')} />
                        </Flex>
                      </Td>
                    </Tr>
                  </>
                )}
                {isEmbeddingModel && (
                  <>
                    <Tr>
                      <Td>defaultToken</Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <MyNumberInput register={register} name="defaultToken" {...InputStyles} />
                        </Flex>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td>maxToken</Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <MyNumberInput register={register} name="maxToken" {...InputStyles} />
                        </Flex>
                      </Td>
                    </Tr>
                  </>
                )}
                {isTTSModel && (
                  <>
                    <Tr>
                      <Td>voices</Td>
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
                  <Td>requestUrl</Td>
                  <Td textAlign={'right'}>
                    <Input {...register('requestUrl')} {...InputStyles} />
                  </Td>
                </Tr>
                <Tr>
                  <Td>requestAuth</Td>
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
                    <Td>datasetProcess</Td>
                    <Td textAlign={'right'}>
                      <Flex justifyContent={'flex-end'}>
                        <Switch {...register('datasetProcess')} />
                      </Flex>
                    </Td>
                  </Tr>
                  <Tr>
                    <Td>usedInClassify</Td>
                    <Td textAlign={'right'}>
                      <Flex justifyContent={'flex-end'}>
                        <Switch {...register('usedInClassify')} />
                      </Flex>
                    </Td>
                  </Tr>
                  <Tr>
                    <Td>usedInExtractFields</Td>
                    <Td textAlign={'right'}>
                      <Flex justifyContent={'flex-end'}>
                        <Switch {...register('usedInExtractFields')} />
                      </Flex>
                    </Td>
                  </Tr>
                  <Tr>
                    <Td>usedInToolCall</Td>
                    <Td textAlign={'right'}>
                      <Flex justifyContent={'flex-end'}>
                        <Switch {...register('usedInToolCall')} />
                      </Flex>
                    </Td>
                  </Tr>
                  <Tr>
                    <Td>usedInQueryExtension</Td>
                    <Td textAlign={'right'}>
                      <Flex justifyContent={'flex-end'}>
                        <Switch {...register('usedInQueryExtension')} />
                      </Flex>
                    </Td>
                  </Tr>
                  <Tr>
                    <Td>defaultSystemChatPrompt</Td>
                    <Td textAlign={'right'}>
                      <MyTextarea {...register('defaultSystemChatPrompt')} {...InputStyles} />
                    </Td>
                  </Tr>
                  <Tr>
                    <Td>customCQPrompt</Td>
                    <Td textAlign={'right'}>
                      <MyTextarea {...register('customCQPrompt')} {...InputStyles} />
                    </Td>
                  </Tr>
                  <Tr>
                    <Td>customExtractPrompt</Td>
                    <Td textAlign={'right'}>
                      <MyTextarea {...register('customExtractPrompt')} {...InputStyles} />
                    </Td>
                  </Tr>
                  <Tr>
                    <Td>defaultConfig</Td>
                    <Td textAlign={'right'}>
                      <JsonEditor
                        value={JSON.stringify(getValues('defaultConfig'))}
                        onChange={(e) => {
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

export default ModelTable;
