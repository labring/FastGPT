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
  type ButtonProps
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useMemo, useRef, useState } from 'react';
import {
  ModelProviderList,
  type ModelProviderIdType,
  getModelProvider
} from '@fastgpt/global/core/ai/provider';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getSystemModelDefaultConfig, putSystemModel } from '@/web/core/ai/config';
import { type SystemModelItemType } from '@fastgpt/service/core/ai/type';
import { useForm } from 'react-hook-form';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyModal from '@fastgpt/web/components/common/MyModal';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

export const AddModelButton = ({
  onCreate,
  ...props
}: { onCreate: (type: ModelTypeEnum) => void } & ButtonProps) => {
  const { t } = useTranslation();

  return (
    <MyMenu
      trigger="hover"
      size="sm"
      Button={<Button {...props}>{t('account:create_model')}</Button>}
      menuList={[
        {
          children: [
            {
              label: t('common:model.type.chat'),
              onClick: () => onCreate(ModelTypeEnum.llm)
            },
            {
              label: t('common:model.type.embedding'),
              onClick: () => onCreate(ModelTypeEnum.embedding)
            },
            {
              label: t('common:model.type.tts'),
              onClick: () => onCreate(ModelTypeEnum.tts)
            },
            {
              label: t('common:model.type.stt'),
              onClick: () => onCreate(ModelTypeEnum.stt)
            },
            {
              label: t('common:model.type.reRank'),
              onClick: () => onCreate(ModelTypeEnum.rerank)
            }
          ]
        }
      ]}
    />
  );
};

const InputStyles = {
  maxW: '300px',
  bg: 'myGray.50',
  w: '100%',
  rows: 3
};
export const ModelEditModal = ({
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
    if (isLLMModel || isEmbeddingModel || isRerankModel) return '/ 1k Tokens';
    if (isTTSModel) return `/ 1k ${t('common:unit.character')}`;
    if (isSTTModel) return `/ 60 ${t('common:unit.seconds')}`;
    return '';
  }, [isLLMModel, isEmbeddingModel, isTTSModel, t, isSTTModel, isRerankModel]);

  const { runAsync: updateModel, loading: updatingModel } = useRequest2(
    async (data: SystemModelItemType) => {
      for (const key in data) {
        // @ts-ignore
        const val = data[key];
        if (val === null || val === undefined || Number.isNaN(val)) {
          // @ts-ignore
          data[key] = '';
        }
      }

      return putSystemModel({
        model: data.model,
        metadata: data
      }).then(onSuccess);
    },
    {
      onSuccess: () => {
        onClose();
      },
      successToast: t('common:Success')
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

  const CustomApi = useMemo(
    () => (
      <>
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
      </>
    ),
    []
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
                      onChange={(value) => setValue('provider', value)}
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
                      <Td>
                        <FormLabel
                          required
                          color={'myGray.600'}
                          fontSize={'md'}
                          fontWeight={'normal'}
                        >
                          {t('common:core.ai.Max context')}
                        </FormLabel>
                      </Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <MyNumberInput
                            register={register}
                            isRequired
                            name="maxContext"
                            {...InputStyles}
                          />
                        </Flex>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td>
                        <FormLabel
                          required
                          color={'myGray.600'}
                          fontSize={'md'}
                          fontWeight={'normal'}
                        >
                          {t('account:model.max_quote')}
                        </FormLabel>
                      </Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <MyNumberInput
                            register={register}
                            isRequired
                            name="quoteMaxToken"
                            {...InputStyles}
                          />
                        </Flex>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td>
                        <HStack spacing={1}>
                          <Box>{t('common:core.chat.response.module maxToken')}</Box>
                          <QuestionTip label={t('account_model:maxToken_tip')} />
                        </HStack>
                      </Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <MyNumberInput
                            min={2000}
                            register={register}
                            name="maxResponse"
                            {...InputStyles}
                          />
                        </Flex>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td>
                        <HStack spacing={1}>
                          <Box>{t('account:model.max_temperature')}</Box>
                          <QuestionTip label={t('account_model:max_temperature_tip')} />
                        </HStack>
                      </Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <MyNumberInput
                            register={register}
                            name="maxTemperature"
                            min={0}
                            step={0.1}
                            {...InputStyles}
                          />
                        </Flex>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td>
                        <HStack spacing={1}>
                          <Box>{t('account:model.show_top_p')}</Box>
                        </HStack>
                      </Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <Switch {...register('showTopP')} />
                        </Flex>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td>
                        <HStack spacing={1}>
                          <Box>{t('account:model.show_stop_sign')}</Box>
                        </HStack>
                      </Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <Switch {...register('showStopSign')} />
                        </Flex>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td>{t('account:model.response_format')}</Td>
                      <Td textAlign={'right'}>
                        <JsonEditor
                          value={JSON.stringify(getValues('responseFormatList'), null, 2)}
                          resize
                          onChange={(e) => {
                            if (!e) {
                              setValue('responseFormatList', []);
                              return;
                            }
                            try {
                              setValue('responseFormatList', JSON.parse(e));
                            } catch (error) {
                              console.error(error);
                            }
                          }}
                          {...InputStyles}
                        />
                      </Td>
                    </Tr>
                  </>
                )}
                {isEmbeddingModel && (
                  <>
                    <Tr>
                      <Td>
                        <HStack spacing={1}>
                          <Box>{t('account:model.normalization')}</Box>
                          <QuestionTip label={t('account:model.normalization_tip')} />
                        </HStack>
                      </Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <Switch {...register('normalization')} />
                        </Flex>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td>
                        <HStack spacing={1}>
                          <Box>{t('account:model.default_token')}</Box>
                          <QuestionTip label={t('account:model.default_token_tip')} />
                        </HStack>
                      </Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <MyNumberInput
                            register={register}
                            isRequired
                            name="defaultToken"
                            {...InputStyles}
                          />
                        </Flex>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td>{t('common:core.ai.Max context')}</Td>
                      <Td textAlign={'right'}>
                        <Flex justifyContent={'flex-end'}>
                          <MyNumberInput
                            register={register}
                            isRequired
                            name="maxToken"
                            {...InputStyles}
                          />
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
                                setValue('defaultConfig', undefined);
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
                {!isLLMModel && CustomApi}
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
                        <Box>{t('account:model.default_config')}</Box>
                        <QuestionTip label={t('account:model.default_config_tip')} />
                      </HStack>
                    </Td>
                    <Td textAlign={'right'}>
                      <JsonEditor
                        value={JSON.stringify(getValues('defaultConfig'), null, 2)}
                        resize
                        onChange={(e) => {
                          console.log(e, '===');
                          if (!e) {
                            setValue('defaultConfig', undefined);
                            return;
                          }
                          try {
                            setValue('defaultConfig', JSON.parse(e.trim()));
                          } catch (error) {
                            console.error(error);
                          }
                        }}
                        {...InputStyles}
                      />
                    </Td>
                  </Tr>
                  {CustomApi}
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
          {t('common:Cancel')}
        </Button>
        <Button isLoading={updatingModel} onClick={handleSubmit(updateModel)}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default function Dom() {
  return <></>;
}
