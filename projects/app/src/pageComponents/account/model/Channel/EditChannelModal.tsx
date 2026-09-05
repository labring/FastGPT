import { type ChannelInfoType } from '@/global/aiproxy/type';
import { Box, type BoxProps, Button, Flex, Input, HStack } from '@chakra-ui/react';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import { getChannelProviders, postCreateChannel, putChannel } from '@/web/core/ai/channel';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { useAdminModelConfig } from '@/web/core/ai/model/useAdminModelConfig';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { useLockFn } from 'ahooks';

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
  allowEmptyModels = false,
  onClose,
  onSuccess
}: {
  defaultConfig: ChannelInfoType;
  fixedModel?: { model: string; avatar?: string };
  allowEmptyModels?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const { t, i18n } = useClientTranslation('config_model');
  const {
    aiproxyChannels,
    getModelProvider,
    systemModelList,
    loading: loadingModels
  } = useAdminModelConfig();
  const isEdit = defaultConfig.id !== 0;
  const isCompactCreate = !isEdit && !!fixedModel;

  const { register, handleSubmit, control, setValue } = useForm({
    defaultValues: defaultConfig
  });

  const providerType = useWatch({ control, name: 'type' });
  const { data: channelProviderMetas = {}, loading: loadingChannelProviderMetas } = useRequest(
    getChannelProviders,
    { manual: false }
  );
  const providerList = useMemo(
    () =>
      aiproxyChannels.flatMap((channel) => {
        const mapData = channelProviderMetas[channel.channelId];
        if (!mapData) return [];

        return [
          {
            defaultBaseUrl: mapData.defaultBaseUrl,
            keyHelp: mapData.keyHelp,
            icon: channel.avatar,
            label: parseI18nString(channel.name, i18n.language as localeType),
            value: channel.channelId
          }
        ];
      }),
    [aiproxyChannels, channelProviderMetas, i18n.language]
  );

  const selectedProvider = useMemo(() => {
    const res = providerList.find((item) => item.value === providerType);
    return res;
  }, [providerList, providerType]);

  const models = useWatch({ control, name: 'models' });
  const modelList = useMemo(() => {
    return systemModelList.map((item) => {
      const provider = getModelProvider(item.provider, i18n.language);

      return {
        icon: provider?.avatar,
        label: item.model,
        value: item.model,
        searchText: item.model
      };
    });
  }, [getModelProvider, i18n.language, systemModelList]);

  const modelMapping = useWatch({ control, name: 'model_mapping' });
  const { runAsync: submitRequest, loading: loadingCreate } = useRequest(
    async (data: ChannelInfoType) => {
      if (!allowEmptyModels && data.models.length === 0) {
        return Promise.reject(t('config_model:selected_model_empty'));
      }
      if (isEdit) return putChannel(data);
      return postCreateChannel({ ...data, model_mapping: data.model_mapping ?? {} });
    },
    {
      onSuccess() {
        onSuccess();
        onClose();
      },
      successToast: isEdit ? t('common:update_success') : t('common:create_success'),
      manual: true
    }
  );
  const onSubmit = useLockFn(submitRequest);

  const isLoading = loadingModels || loadingChannelProviderMetas || loadingCreate;

  return (
    <MyModal
      isLoading={isLoading}
      title={isCompactCreate ? t('config_model:create_channel') : t('config_model:edit_channel')}
      onClose={onClose}
      size={isCompactCreate ? 'sm' : 'lg'}
      footer={
        <>
          <Button variant={isEdit ? 'outline' : 'whiteBase'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button variant={'primary'} onClick={handleSubmit(onSubmit)}>
            {isEdit ? t('common:Update') : t('common:new_create')}
          </Button>
        </>
      }
    >
      {isCompactCreate && fixedModel ? (
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
            <Input
              h="36px"
              {...register('key')}
              placeholder={t('config_model:api_key_placeholder')}
            />
          </Box>

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
            <HStack spacing={1.5} minW={0}>
              <MyAvatar src={fixedModel.avatar} w="18px" flexShrink={0} />
              <Box noOfLines={1}>{fixedModel.model}</Box>
            </HStack>
          </Flex>

          <Box>
            <HStack spacing={1} mb={2}>
              <FormLabel>{t('config_model:mapping')}</FormLabel>
              <QuestionTip label={t('config_model:mapping_tip')} />
            </HStack>
            <JsonEditor
              resize={false}
              defaultHeight={100}
              value={JSON.stringify(modelMapping, null, 2)}
              onChange={(val) => {
                if (!val) {
                  setValue('model_mapping', {});
                  return;
                }
                try {
                  setValue('model_mapping', JSON.parse(val));
                } catch (_error) {}
              }}
            />
          </Box>
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
            <Flex alignItems={'center'}>
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
            <Input
              mt={1}
              {...register('key')}
              placeholder={selectedProvider?.keyHelp || 'sk-1234567890'}
            />
          </Box>
          {/* Model */}
          <Box mt={4}>
            <Flex alignItems={'center'}>
              <FormLabel required flex={'1 0 0'}>
                {t('config_model:model')}({models.length})
              </FormLabel>

              <Button size={'sm'} variant={'whitePrimary'} onClick={() => setValue('models', [])}>
                {t('config_model:clear_model')}
              </Button>
            </Flex>
            <Box mt={2}>
              <MultipleSelect
                value={models}
                list={modelList}
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
          <Box mt={4}>
            <HStack>
              <FormLabel>{t('config_model:mapping')}</FormLabel>
              <QuestionTip label={t('config_model:mapping_tip')} />
            </HStack>
            <Box mt={2}>
              <JsonEditor
                value={JSON.stringify(modelMapping, null, 2)}
                onChange={(val) => {
                  if (!val) {
                    setValue('model_mapping', {});
                  } else {
                    try {
                      setValue('model_mapping', JSON.parse(val));
                    } catch (_error) {}
                  }
                }}
              />
            </Box>
          </Box>
        </Box>
      )}
    </MyModal>
  );
};
export default EditChannelModal;
