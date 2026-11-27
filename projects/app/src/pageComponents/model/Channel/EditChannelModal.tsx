import { sortModelSelectorModels } from '@/components/Select/AIModelSelector.utils';
import type { CreateChannelResponse } from '@fastgpt/global/openapi/core/ai/model/channel/api';
import {
  CHAT_UPSTREAM_PROTOCOL_CHANNEL_TYPES,
  ChatUpstreamProtocolSchema,
  type ChannelInfoType,
  type ChatUpstreamProtocol
} from '@fastgpt/global/core/ai/model/channel';
import { Box, type BoxProps, Button, Flex, Input, HStack } from '@chakra-ui/react';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import ModelMappingInput from './ModelMappingInput';
import SecretValueInput from '@/components/common/secret/SecretValueInput';
import { getChannelProviders, postCreateChannel, putChannel } from '@/web/core/ai/model/channel';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { useModelConfig } from '@/web/core/ai/model/useModelConfig';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { useLockFn } from 'ahooks';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';

const LabelStyles: BoxProps = {
  fontSize: 'sm',
  color: 'myGray.900',
  flex: '0 0 70px'
};

const CompactLabelStyles: BoxProps = {
  fontSize: 'sm',
  color: 'myGray.900',
  flex: '0 0 64px'
};

const EditChannelModal = ({
  defaultConfig,
  fixedModel,
  fixedModels,
  allowEmptyModels = false,
  channelType,
  onClose,
  onSuccess
}: {
  defaultConfig: ChannelInfoType;
  fixedModel?: { model: string; avatar?: string };
  fixedModels?: { model: string; avatar?: string }[];
  allowEmptyModels?: boolean;
  channelType: ChannelType;
  onClose: () => void;
  onSuccess: (createdChannelData?: CreateChannelResponse) => unknown | Promise<unknown>;
}) => {
  const { t, i18n } = useSafeTranslation();
  const isEdit = defaultConfig.id !== 0;
  const currentModels = useMemo(
    () => fixedModels ?? (fixedModel ? [fixedModel] : []),
    [fixedModel, fixedModels]
  );
  const isCompactCreate = !isEdit && currentModels.length > 0;
  const isSingleCompactCreate = isCompactCreate && currentModels.length === 1;
  // 精简新建弹窗不展示模型多选框，跳过模型列表请求避免无意义加载。
  const {
    getModelProvider,
    models: availableModels,
    loading: loadingModels
  } = useModelConfig({ channelType, language: i18n.language, manual: isCompactCreate });

  const { register, handleSubmit, control, setValue } = useForm<ChannelInfoType>({
    defaultValues: {
      ...defaultConfig,
      configs: {
        ...defaultConfig.configs,
        // 未配置时默认 auto，按模型选择上游协议；只在用户保存后写入，不主动迁移已有渠道。
        chat_upstream_protocol: ChatUpstreamProtocolSchema.parse(
          defaultConfig.configs?.chat_upstream_protocol
        )
      }
    }
  });

  const providerType = useWatch({ control, name: 'type' });
  const chatUpstreamProtocol = useWatch({ control, name: 'configs.chat_upstream_protocol' });
  const supportsChatUpstreamProtocol = CHAT_UPSTREAM_PROTOCOL_CHANNEL_TYPES.some(
    (type) => type === providerType
  );
  const { data: channelProviderMetas = {}, loading: loadingChannelProviderMetas } = useRequest(
    getChannelProviders,
    { manual: false }
  );
  const providerList = useMemo(
    () =>
      Object.entries(channelProviderMetas)
        .sort(
          ([, a], [, b]) =>
            (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
        )
        .flatMap(([channelId, mapData]) => {
          if (!mapData.canCreate) return [];

          return [
            {
              defaultBaseUrl: mapData.defaultBaseUrl,
              keyHelp: mapData.keyHelp,
              icon: mapData.avatar,
              label: parseI18nString(
                mapData.displayName ?? mapData.name,
                i18n.language as localeType
              ),
              value: Number(channelId)
            }
          ];
        }),
    [channelProviderMetas, i18n.language]
  );

  const selectedChannel = channelProviderMetas[providerType];
  const selectedProvider = useMemo(() => {
    const res = providerList.find((item) => item.value === providerType);
    return res;
  }, [providerList, providerType]);

  const models = useWatch({ control, name: 'models' });
  const modelList = useMemo(() => {
    // 候选模型仍在加载时保留当前已选模型作为占位，避免 MultipleSelect 短暂把已有模型标红为无效项。
    if (loadingModels && availableModels.length === 0) {
      return models.map((model) => ({
        icon: undefined,
        label: model,
        value: model,
        searchText: model
      }));
    }

    return sortModelSelectorModels(availableModels).map((item) => {
      const provider = getModelProvider(item.provider, i18n.language);

      return {
        icon: provider?.avatar,
        label: item.model,
        value: item.model,
        searchText: item.model
      };
    });
  }, [availableModels, getModelProvider, i18n.language, loadingModels, models]);

  const pendingModelLabel = t('config_model:model_pending_creation');
  const singleCompactModelName = useMemo(() => {
    if (!isSingleCompactCreate) return '';
    const candidate = (models[0] || currentModels[0]?.model || '').trim();
    return candidate !== '' && candidate !== pendingModelLabel ? candidate : '';
  }, [currentModels, isSingleCompactCreate, models, pendingModelLabel]);

  const modelIconMap = useMemo(() => {
    const map = new Map<string, string | undefined>();
    modelList.forEach((item) => {
      map.set(item.value, item.icon);
    });
    currentModels.forEach((item) => {
      if (!map.has(item.model) && item.avatar) {
        map.set(item.model, item.avatar);
      }
    });
    return map;
  }, [currentModels, modelList]);

  // 模型映射左侧仅允许从当前渠道已选模型中选择；精简弹窗空白新建时过滤待绑定占位文案。
  const mappingKeyOptions = useMemo(() => {
    const sourceModels =
      models.length > 0
        ? models
        : isCompactCreate
          ? currentModels
              .map((item) => item.model.trim())
              .filter((name) => name !== '' && name !== pendingModelLabel)
          : [];

    return Array.from(new Set(sourceModels)).map((modelName) => ({
      icon: modelIconMap.get(modelName) || HUGGING_FACE_ICON,
      label: modelName,
      value: modelName,
      searchText: modelName
    }));
  }, [currentModels, isCompactCreate, modelIconMap, models, pendingModelLabel]);

  const apiKey = useWatch({ control, name: 'key' });
  const [hasEditedKey, setHasEditedKey] = useState(false);
  const hasEditedKeyRef = useRef(false);
  const handleKeyChange = (val: string) => {
    hasEditedKeyRef.current = true;
    setHasEditedKey(true);
    setValue('key', val);
  };
  const isKeyConfigured = Boolean(defaultConfig.keyConfigured) && !hasEditedKey;

  const modelMapping = useWatch({ control, name: 'model_mapping' });
  const [compactMappingTarget, setCompactMappingTarget] = useState(() =>
    singleCompactModelName ? (defaultConfig.model_mapping?.[singleCompactModelName] ?? '') : ''
  );
  const handleCompactMappingChange = (val: string) => {
    setCompactMappingTarget(val);
    if (!singleCompactModelName) {
      setValue('model_mapping', {});
      return;
    }
    const trimmed = val.trim();
    setValue('model_mapping', trimmed ? { [singleCompactModelName]: trimmed } : {});
  };
  const hasDuplicateModelMappingRef = useRef(false);
  const { runAsync: submitRequest, loading: loadingCreate } = useRequest(
    async (formData: ChannelInfoType) => {
      if (hasDuplicateModelMappingRef.current) {
        return Promise.reject(t('config_model:mapping_key_duplicate'));
      }
      const { chat_upstream_protocol, ...otherConfigs } = formData.configs ?? {};
      const { keyConfigured: _keyConfigured, ...restFormData } = formData;
      const data = {
        ...restFormData,
        configs: {
          ...otherConfigs,
          ...(supportsChatUpstreamProtocol ? { chat_upstream_protocol } : {})
        }
      };
      if (!allowEmptyModels && data.models.length === 0) {
        return Promise.reject(t('config_model:selected_model_empty'));
      }
      if (isEdit) {
        await putChannel({
          ...data,
          // 未修改已保存密钥时不传 key，遵循 AIProxy patch 语义保持原密钥不变。
          ...(defaultConfig.keyConfigured && !hasEditedKeyRef.current ? { key: undefined } : {}),
          status: data.status === 1 || data.status === 2 ? data.status : undefined,
          channelType
        });
        await onSuccess();
        return;
      }

      const createdChannel = await postCreateChannel({
        ...data,
        status: data.status === 1 || data.status === 2 ? data.status : undefined,
        channelType,
        model_mapping: data.model_mapping ?? {}
      });
      await onSuccess(createdChannel);
    },
    {
      onSuccess() {
        onClose();
      },
      successToast: isEdit ? t('common:update_success') : t('common:create_success'),
      manual: true
    }
  );
  const onSubmit = useLockFn(submitRequest);

  const chatProtocolField = supportsChatUpstreamProtocol ? (
    <Box>
      <HStack spacing={1} mb={2}>
        <FormLabel>{t('config_model:chat_upstream_protocol')}</FormLabel>
        <QuestionTip label={t('config_model:chat_upstream_protocol_tip')} />
      </HStack>
      <MySelect<ChatUpstreamProtocol>
        h={isCompactCreate ? '36px' : undefined}
        value={chatUpstreamProtocol}
        list={[
          { label: t('config_model:chat_upstream_protocol_auto'), value: 'auto' },
          { label: 'Responses', value: 'responses' },
          { label: 'Chat Completions', value: 'chat_completions' }
        ]}
        onChange={(value) => setValue('configs.chat_upstream_protocol', value)}
      />
    </Box>
  ) : null;

  const modelMappingField = (
    <Box>
      <HStack spacing={1} mb={2}>
        <FormLabel>{t('config_model:mapping')}</FormLabel>
        <QuestionTip label={t('config_model:mapping_tip')} />
      </HStack>
      <ModelMappingInput
        value={modelMapping}
        modelOptions={mappingKeyOptions}
        getModelAvatar={(modelName) => modelIconMap.get(modelName) || HUGGING_FACE_ICON}
        inputHeight={isCompactCreate ? '36px' : undefined}
        onChange={(val) => setValue('model_mapping', val)}
        onValidationChange={({ hasDuplicateKey }) => {
          hasDuplicateModelMappingRef.current = hasDuplicateKey;
        }}
      />
    </Box>
  );

  return (
    <MyModal
      title={isEdit ? t('config_model:edit_channel') : t('config_model:create_channel')}
      onClose={onClose}
      size={isCompactCreate ? 'sm' : 'lg'}
      footer={
        <>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button variant={'primary'} isLoading={loadingCreate} onClick={handleSubmit(onSubmit)}>
            {isEdit ? t('common:Update') : t('common:new_create')}
          </Button>
        </>
      }
    >
      {isCompactCreate ? (
        <Flex direction="column" gap={4}>
          <Flex alignItems="center" gap={8}>
            <FormLabel required {...CompactLabelStyles}>
              {t('common:Name')}
            </FormLabel>
            <Input
              h="36px"
              {...register('name', { required: true })}
              placeholder={t('config_model:channel_name_placeholder')}
            />
          </Flex>

          <Flex alignItems="center" gap={8}>
            <FormLabel required {...CompactLabelStyles}>
              {t('config_model:channel_type')}
            </FormLabel>
            <Box flex="1 0 0" minW={0}>
              <MySelect
                h="36px"
                list={providerList}
                isLoading={loadingChannelProviderMetas}
                placeholder={t('config_model:select_provider_placeholder')}
                value={providerType}
                isSearch
                onChange={(val) => setValue('type', val)}
              />
            </Box>
          </Flex>

          <Box>
            <Flex alignItems="center" gap={1} mb={2}>
              <FormLabel>{t('config_model:base_url')}</FormLabel>
              <Box color="myGray.500">{t('config_model:leave_blank_use_default_url')}</Box>
            </Flex>
            <Input
              h="36px"
              {...register('base_url')}
              placeholder={selectedProvider?.defaultBaseUrl ?? 'https://api.openai.com/v1'}
            />
          </Box>

          <Box>
            <FormLabel mb={2}>{t('config_model:api_key')}</FormLabel>
            <SecretValueInput
              h="36px"
              bg="white"
              value={apiKey ?? ''}
              isConfigured={isKeyConfigured}
              placeholder={t('config_model:api_key_placeholder')}
              onChange={handleKeyChange}
            />
          </Box>

          {chatProtocolField}

          <Flex alignItems="center" gap={8} minH="36px">
            <HStack spacing={1} {...CompactLabelStyles}>
              <FormLabel>{t('config_model:current_model')}</FormLabel>
              <QuestionTip
                label={
                  allowEmptyModels
                    ? t('config_model:deferred_channel_model_tip')
                    : t('config_model:fixed_channel_model_tip')
                }
              />
            </HStack>
            {currentModels.length > 1 ? (
              <Box>{t('config_model:selected_model_count', { count: currentModels.length })}</Box>
            ) : (
              currentModels.map((model) => (
                <HStack key={model.model} spacing={1.5} minW={0}>
                  <MyAvatar src={model.avatar} w="18px" flexShrink={0} />
                  <Box noOfLines={1}>{model.model}</Box>
                </HStack>
              ))
            )}
          </Flex>

          {isSingleCompactCreate ? (
            <Flex alignItems="center" gap={8}>
              <HStack spacing={1} {...CompactLabelStyles}>
                <FormLabel>{t('config_model:mapping')}</FormLabel>
                <QuestionTip label={t('config_model:compact_mapping_tip')} />
              </HStack>
              <Input
                flex="1 0 0"
                minW={0}
                h="36px"
                value={compactMappingTarget}
                isDisabled={!singleCompactModelName}
                placeholder={t('config_model:mapping_value_placeholder')}
                onChange={(e) => handleCompactMappingChange(e.target.value)}
              />
            </Flex>
          ) : (
            modelMappingField
          )}
        </Flex>
      ) : (
        <Box>
          {/* Chnnel name */}
          <Box>
            <FormLabel required {...LabelStyles}>
              {t('common:Name')}
            </FormLabel>
            <Input mt={1} {...register('name', { required: true })} />
          </Box>
          {/* Provider */}
          <Box alignItems={'center'} mt={4}>
            <FormLabel required {...LabelStyles}>
              {t('config_model:channel_type')}
            </FormLabel>
            <Box mt={1}>
              <MySelect
                list={providerList}
                isLoading={loadingChannelProviderMetas}
                placeholder={t('config_model:select_provider_placeholder')}
                value={providerType}
                isSearch
                onChange={(val) => {
                  setValue('type', val);
                }}
              />
            </Box>
          </Box>
          {/* Proxy URL */}
          <Box mt={4}>
            <Flex alignItems={'center'} justifyContent="space-between">
              <Flex alignItems="center">
                <FormLabel>{t('config_model:base_url')}</FormLabel>
                {selectedProvider && (
                  <Flex alignItems={'center'} fontSize={'xs'}>
                    <Box>{'('}</Box>
                    <Box mr={1}>{t('config_model:default_url')}:</Box>
                    <CopyBox value={selectedProvider?.defaultBaseUrl || ''}>
                      {selectedProvider?.defaultBaseUrl || ''}
                    </CopyBox>
                    <Box>{')'}</Box>
                  </Flex>
                )}
              </Flex>
              {selectedChannel?.website && (
                <a href={selectedChannel.website} target="_blank" rel="noreferrer">
                  {t('config_model:official_website')}
                </a>
              )}
            </Flex>
            <Input
              mt={1}
              {...register('base_url')}
              placeholder={selectedProvider?.defaultBaseUrl || 'https://api.openai.com/v1'}
            />
          </Box>
          {/* API key */}
          <Box mt={4}>
            <Flex alignItems={'center'}>
              <FormLabel>{t('config_model:api_key')}</FormLabel>
              {selectedProvider?.keyHelp && (
                <Flex alignItems={'center'} fontSize={'xs'}>
                  <Box>{'('}</Box>
                  <Box mr={1}>{t('config_model:key_type')}</Box>
                  <Box>{selectedProvider.keyHelp}</Box>
                  <Box>{')'}</Box>
                </Flex>
              )}
            </Flex>
            <Box mt={1}>
              <SecretValueInput
                h="36px"
                bg="white"
                value={apiKey ?? ''}
                isConfigured={isKeyConfigured}
                placeholder={selectedProvider?.keyHelp || 'sk-1234567890'}
                onChange={handleKeyChange}
              />
            </Box>
          </Box>
          {chatProtocolField && <Box mt={4}>{chatProtocolField}</Box>}
          {/* Model */}
          <Box mt={4}>
            <Flex alignItems={'center'}>
              <FormLabel required flex={'1 0 0'}>
                {t('config_model:model')}({models.length})
              </FormLabel>

              <Button size={'sm'} variant={'whiteBase'} onClick={() => setValue('models', [])}>
                {t('config_model:clear_model')}
              </Button>
            </Flex>
            <Box mt={2}>
              <MultipleSelect
                value={models}
                list={modelList}
                isLoading={loadingModels}
                onSelect={(val) => {
                  setValue('models', val);
                }}
                placeholder={t('config_model:select_model_placeholder')}
                itemWrap
                closeable
                isSearch
                searchPlaceholder={t('config_model:search_model')}
                emptyText={t('config_model:model_search_empty')}
                virtualScroll
              />
            </Box>
          </Box>
          {/* Mapping */}
          <Box mt={4}>{modelMappingField}</Box>
        </Box>
      )}
    </MyModal>
  );
};
export default EditChannelModal;
