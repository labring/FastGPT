import MyTextarea from '@/components/common/Textarea/MyTextarea';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, Flex, Grid, GridItem, HStack, Input, Switch } from '@chakra-ui/react';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model.schema';
import type { ModelProviderItemType } from '@fastgpt/global/core/ai/provider';
import {
  getRuntimeResolvedPriceTiers,
  normalizeModelPricingForRead,
  normalizeModelPricingForSave
} from '@fastgpt/global/core/ai/pricing';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useLockFn } from 'ahooks';
import React, { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import {
  useController,
  useForm,
  useWatch,
  type Control,
  type FieldPath,
  type UseFormRegister,
  type UseFormSetValue
} from 'react-hook-form';
import ModelPriceTiersTable, { emptyPriceTier } from './ModelPriceTiersTable';

const ControlHeight = '32px';

const InputStyles = {
  maxW: '100%',
  bg: 'white',
  w: '100%',
  h: ControlHeight,
  minH: ControlHeight,
  fontSize: 'sm'
};

const NumberInputStyles = {
  ...InputStyles,
  inputFieldProps: {
    bg: 'transparent',
    h: ControlHeight,
    minH: ControlHeight,
    px: 3,
    fontSize: 'sm'
  }
};

const MultilineInputStyles = {
  maxW: '100%',
  bg: 'white',
  w: '100%',
  rows: 3
};

const defaultResponseFormatOptions = ['text', 'json_schema', 'json_object'];

/**
 * 删除表单控件产生的 NaN，避免 JSON 序列化把嵌套 NaN 变成 null 后再被接口 schema 拒绝。
 * 数组中的 NaN 使用 null 保留位置，模型配置对象中的 NaN 则直接视为未填写。
 */
const removeNaNValues = (value: unknown): void => {
  if (!value || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (typeof item === 'number' && Number.isNaN(item)) {
        value[index] = null;
      } else {
        removeNaNValues(item);
      }
    });
    return;
  }

  Object.entries(value).forEach(([key, item]) => {
    if (typeof item === 'number' && Number.isNaN(item)) {
      delete (value as Record<string, unknown>)[key];
    } else {
      removeNaNValues(item);
    }
  });
};

const Section = ({
  title,
  children,
  showBorder = true
}: {
  title: string;
  children: React.ReactNode;
  showBorder?: boolean;
}) => (
  <Grid
    templateColumns={['1fr', '160px minmax(0, 1fr)']}
    rowGap={[3, 4]}
    columnGap={'32px'}
    py={6}
    borderBottom={showBorder ? '1px solid' : 'none'}
    borderColor={'myGray.200'}
  >
    <Box fontSize={'14px'} w={'160px'} fontWeight={'600'} color={'myGray.900'} lineHeight={1.2}>
      {title}
    </Box>
    <Box>{children}</Box>
  </Grid>
);

const Field = ({
  label,
  tip,
  children,
  colSpan = 1,
  required = false
}: {
  label: string;
  tip?: string;
  children: React.ReactNode;
  colSpan?: number | number[];
  required?: boolean;
}) => (
  <GridItem colSpan={colSpan}>
    <Flex alignItems={'center'} gap={1} mb={2}>
      <FormLabel required={required} fontSize={'12px'} fontWeight={'500'}>
        {label}
      </FormLabel>
      {tip && <QuestionTip label={tip} />}
    </Flex>
    {children}
  </GridItem>
);

const SwitchField = ({
  label,
  tip,
  field,
  register
}: {
  label: string;
  tip?: string;
  field: FieldPath<SystemModelDocumentDataType>;
  register: UseFormRegister<SystemModelDocumentDataType>;
}) => (
  <GridItem>
    <Flex alignItems={'center'} gap={1} mb={3}>
      <Box fontSize={'12px'} fontWeight={'500'} color={'myGray.900'}>
        {label}
      </Box>
      {tip && <QuestionTip label={tip} />}
    </Flex>
    <Switch size={'md'} {...register(field)} />
  </GridItem>
);

const ProviderField = React.memo(function ProviderField({
  control,
  providerList,
  t
}: {
  control: Control<SystemModelDocumentDataType>;
  providerList: { label: React.ReactNode; value: string }[];
  t: ReturnType<typeof useClientTranslation>['t'];
}) {
  const {
    field: { value, onChange, onBlur, ref },
    fieldState,
    formState: { isSubmitted }
  } = useController({
    control,
    name: 'provider',
    rules: { required: true }
  });

  return (
    <Field label={t('common:model.provider')} required>
      <MySelect
        value={value}
        placeholder={t('config_model:select_model_provider_placeholder')}
        onChange={onChange}
        onBlur={onBlur}
        ref={ref}
        isInvalid={isSubmitted && !!fieldState.error}
        list={providerList}
        {...InputStyles}
        maxW={['100%', '360px']}
      />
    </Field>
  );
});

const ResponseFormatField = React.memo(function ResponseFormatField({
  control,
  setValue,
  t
}: {
  control: Control<SystemModelDocumentDataType>;
  setValue: UseFormSetValue<SystemModelDocumentDataType>;
  t: ReturnType<typeof useClientTranslation>['t'];
}) {
  const responseFormatList = useWatch({
    control,
    name: 'config.responseFormatList'
  });
  const responseFormatOptions = useMemo(() => {
    const valueSet = new Set([
      ...defaultResponseFormatOptions,
      ...(Array.isArray(responseFormatList) ? responseFormatList : [])
    ]);

    return Array.from(valueSet).map((item) => ({
      value: item,
      label: item
    }));
  }, [responseFormatList]);

  return (
    <Field label={t('config_model:model.response_format')}>
      <MultipleSelect<string>
        list={responseFormatOptions}
        value={Array.isArray(responseFormatList) ? responseFormatList : []}
        onSelect={(value) => setValue('config.responseFormatList', value, { shouldDirty: true })}
        placeholder={t('config_model:model.response_format')}
        {...InputStyles}
        borderRadius={'md'}
        tagStyle={{
          bg: 'transparent',
          color: 'myGray.700',
          borderColor: 'myGray.200',
          borderWidth: '1px',
          borderRadius: '6px',
          px: 2,
          py: 1,
          fontSize: '10px'
        }}
      />
    </Field>
  );
});

const DefaultConfigField = React.memo(function DefaultConfigField({
  control,
  setValue,
  label,
  tip,
  onDraftChange
}: {
  control: Control<SystemModelDocumentDataType>;
  setValue: UseFormSetValue<SystemModelDocumentDataType>;
  label: string;
  tip: string;
  onDraftChange?: () => void;
}) {
  const defaultConfig = useWatch({
    control,
    name: 'config.defaultConfig'
  });

  return (
    <Field label={label} tip={tip} colSpan={[1, 2]}>
      <JsonEditor
        value={JSON.stringify(defaultConfig, null, 2)}
        resize
        onChange={(e) => {
          onDraftChange?.();
          if (!e) {
            setValue('config.defaultConfig', {}, { shouldDirty: true });
            return;
          }
          try {
            setValue('config.defaultConfig', JSON.parse(e.trim()), { shouldDirty: true });
          } catch (error) {
            console.error(error);
          }
        }}
        {...MultilineInputStyles}
        pr={2.5}
      />
    </Field>
  );
});

const VoicesField = React.memo(function VoicesField({
  control,
  t,
  onDraftChange
}: {
  control: Control<SystemModelDocumentDataType>;
  t: ReturnType<typeof useClientTranslation>['t'];
  onDraftChange?: () => void;
}) {
  const [isValidJson, setIsValidJson] = useState(true);
  const { field, fieldState } = useController({
    control,
    name: 'config.voices',
    rules: {
      validate: (value) =>
        (isValidJson &&
          Array.isArray(value) &&
          value.length > 0 &&
          value.every(
            (voice) => voice && typeof voice.label === 'string' && typeof voice.value === 'string'
          )) ||
        t('config_model:voices_array_required')
    }
  });

  return (
    <Field
      label={t('config_model:model.voices')}
      required
      tip={t('config_model:model.voices_tip')}
      colSpan={[1, 2]}
    >
      <JsonEditor
        value={JSON.stringify(field.value, null, 2)}
        onChange={(e) => {
          onDraftChange?.();
          try {
            const value = JSON.parse(e);
            setIsValidJson(true);
            field.onChange(value);
          } catch {
            setIsValidJson(false);
          }
        }}
        {...MultilineInputStyles}
      />
      {fieldState.error && (
        <Box color="red.500" fontSize="sm">
          {fieldState.error.message}
        </Box>
      )}
    </Field>
  );
});

export type ModelConfigFormGetValues = () => SystemModelDocumentDataType;

type ModelConfigFormProps = {
  modelData: SystemModelDocumentDataType;
  providers: ModelProviderItemType[];
  formId: string;
  onSubmit: (modelData: SystemModelDocumentDataType) => Promise<unknown>;
  isModelIdReadOnly?: boolean;
  channelSection?: {
    title: string;
    content: React.ReactNode;
  };
  onModelChange?: (model: string) => void;
  onSuccess?: () => void;
  onSubmittingChange?: (loading: boolean) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  /** 暴露当前未保存草稿读取器，供渠道测试等不触发表单提交的动作使用。 */
  getValuesRef?: MutableRefObject<ModelConfigFormGetValues | null>;
};

const ModelConfigForm = ({
  modelData,
  providers,
  formId,
  onSubmit,
  channelSection,
  isModelIdReadOnly = false,
  onModelChange,
  onSuccess,
  onSubmittingChange,
  onDirtyChange,
  getValuesRef
}: ModelConfigFormProps) => {
  const { t } = useClientTranslation('config_model');
  const { feConfigs } = useSystemStore();
  const initialModelData = normalizeModelPricingForRead(modelData);
  const [hasJsonDraftChanges, setHasJsonDraftChanges] = useState(false);

  const {
    control,
    register,
    getValues,
    setValue,
    handleSubmit,
    formState: { isDirty }
  } = useForm<SystemModelDocumentDataType>({
    defaultValues: {
      // 空白草稿的引用上限不向输入框写入 NaN，保持视觉上未填写。
      ...(initialModelData.type === ModelTypeEnum.llm &&
      Number.isNaN(initialModelData.config.quoteMaxToken)
        ? {
            ...initialModelData,
            config: { ...initialModelData.config, quoteMaxToken: undefined }
          }
        : initialModelData),
      priceTiers: (() => {
        if (modelData.type !== ModelTypeEnum.llm) return undefined;
        const tiers = initialModelData.priceTiers ?? [];
        if (tiers.length === 0) return [emptyPriceTier];

        const last = tiers[tiers.length - 1];
        if (!last.maxInputTokens) return tiers;

        return [
          ...tiers,
          {
            ...emptyPriceTier,
            minInputTokens: last.maxInputTokens
          }
        ];
      })()
    }
  });

  useEffect(() => {
    if (!getValuesRef) return;
    getValuesRef.current = getValues;
    return () => {
      getValuesRef.current = null;
    };
  }, [getValues, getValuesRef]);
  const reasoningEnabled = useWatch({ control, name: 'config.reasoning' });
  const model = useWatch({ control, name: 'model' });

  useEffect(() => {
    onModelChange?.(model);
  }, [model, onModelChange]);

  useEffect(() => {
    // 仅在 reasoning 关闭且 reasoningEffort 实际为 true 时才清，避免挂载即把表单标 dirty
    if (!reasoningEnabled && getValues('config.reasoningEffort')) {
      setValue('config.reasoningEffort', false, { shouldDirty: false });
    }
  }, [reasoningEnabled, getValues, setValue]);

  const isLLMModel = modelData?.type === ModelTypeEnum.llm;
  const isEmbeddingModel = modelData?.type === ModelTypeEnum.embedding;
  const isTTSModel = modelData?.type === ModelTypeEnum.tts;
  const isSTTModel = modelData?.type === ModelTypeEnum.stt;
  const isRerankModel = modelData?.type === ModelTypeEnum.rerank;

  const providerList = useMemo(
    () =>
      providers.map((item) => ({
        label: (
          <HStack>
            <Avatar src={item.avatar} w={'1rem'} />
            <Box>{item.name}</Box>
          </HStack>
        ),
        value: item.id
      })),
    [providers]
  );

  const priceUnit = useMemo(() => {
    if (isLLMModel || isEmbeddingModel || isRerankModel) return '/ 1k Tokens';
    if (isTTSModel) return `/ 1k ${t('common:unit.character')}`;
    if (isSTTModel) return `/ 60 ${t('common:unit.seconds')}`;
    return '';
  }, [isLLMModel, isEmbeddingModel, isTTSModel, t, isSTTModel, isRerankModel]);

  const { runAsync: submitModelRequest, loading: submittingModel } = useRequest(
    async (data: SystemModelDocumentDataType) => {
      data.name = data.name?.trim() || data.model;
      if (data.type === ModelTypeEnum.llm) {
        // 数字输入留空会产生 NaN；仅未填写时按上下文计算，保留显式填写的 0。
        if (data.config.quoteMaxToken == null || Number.isNaN(data.config.quoteMaxToken)) {
          data.config.quoteMaxToken = Math.floor(data.config.maxContext * 0.8);
        }

        // 空数字输入会被 react-hook-form 解析为 NaN；显式转成协议允许的 null，
        // 避免依赖 JSON.stringify 将 NaN 隐式转换成 null。
        if (Number.isNaN(data.config.maxTemperature)) {
          data.config.maxTemperature = null;
        }

        const priceTiers = getRuntimeResolvedPriceTiers({ priceTiers: data.priceTiers });

        let currentLowerExclusiveBound = 0;

        for (let index = 0; index < priceTiers.length; index++) {
          const tier = priceTiers[index];
          const hasPrice =
            typeof tier.inputPrice === 'number' || typeof tier.outputPrice === 'number';

          if (!hasPrice) {
            return Promise.reject(t('config_model:model.price_tier_price_required'));
          }

          if (index < priceTiers.length - 1 && typeof tier.maxInputTokens !== 'number') {
            return Promise.reject(t('config_model:model.price_tier_max_required'));
          }

          if (
            typeof tier.maxInputTokens === 'number' &&
            tier.maxInputTokens <= currentLowerExclusiveBound
          ) {
            return Promise.reject(t('config_model:model.price_tier_range_invalid'));
          }

          if (typeof tier.maxInputTokens === 'number') {
            currentLowerExclusiveBound = tier.maxInputTokens;
          }
        }

        data.priceTiers = priceTiers;
      }

      const modelData = data as Record<string, unknown>;
      removeNaNValues(modelData);
      for (const key of Object.keys(modelData)) {
        const val = modelData[key];
        if (val === null || val === undefined) delete modelData[key];
      }

      return onSubmit(normalizeModelPricingForSave(data));
    },
    {
      onSuccess: () => {
        onSuccess?.();
      },
      successToast: t('common:Success')
    }
  );
  const submitModel = useLockFn(submitModelRequest);

  useEffect(() => {
    onSubmittingChange?.(submittingModel);
  }, [onSubmittingChange, submittingModel]);

  useEffect(() => {
    onDirtyChange?.(isDirty || hasJsonDraftChanges);
  }, [hasJsonDraftChanges, isDirty, onDirtyChange]);

  const CustomApi = useMemo(
    () => (
      <>
        <GridItem colSpan={[1, 2]}>
          <Flex alignItems={'center'} gap={1} mb={3}>
            <Box fontSize={'12px'} fontWeight={'600'} color={'myGray.900'}>
              {t('config_model:model.request_url')}
            </Box>
            <QuestionTip label={t('config_model:model.request_url_tip')} />
          </Flex>
          <Input {...register('requestUrl')} {...InputStyles} />
        </GridItem>
        <GridItem colSpan={[1, 2]}>
          <Flex alignItems={'center'} gap={1} mb={3}>
            <Box fontSize={'12px'} fontWeight={'600'} color={'myGray.900'}>
              {t('config_model:model.request_auth')}
            </Box>
            <QuestionTip label={t('config_model:model.request_auth_tip')} />
          </Flex>
          <Input {...register('requestAuth')} {...InputStyles} />
        </GridItem>
      </>
    ),
    [register, t]
  );

  return (
    <Box as="form" id={formId} onSubmit={handleSubmit(submitModel)}>
      <Section title={t('config_model:model.basic_config_section')}>
        <Flex direction={['column', 'row']} gap={[6, 8]} alignItems={['stretch', 'flex-start']}>
          <Grid flex={'1 0 0'} templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
            <Field
              label={t('config_model:model.model_id')}
              required
              tip={t('config_model:model.model_id_tip')}
            >
              <Input
                {...register('model', { required: true })}
                autoFocus={!isModelIdReadOnly && !modelData.model?.trim()}
                {...InputStyles}
                isReadOnly={isModelIdReadOnly}
                bg={isModelIdReadOnly ? 'myGray.50' : 'white'}
                cursor={isModelIdReadOnly ? 'not-allowed' : undefined}
              />
            </Field>
            <Field label={t('config_model:model.alias')} tip={t('config_model:model.alias_tip')}>
              <Input {...register('name')} {...InputStyles} />
            </Field>
            <ProviderField control={control} providerList={providerList} t={t} />
            <SwitchField
              label={t('config_model:model.active')}
              field={'isActive'}
              register={register}
            />
          </Grid>
        </Flex>
      </Section>

      {channelSection && <Section title={channelSection.title}>{channelSection.content}</Section>}

      {isLLMModel && (
        <Section title={t('config_model:model.params_config_section')}>
          <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={'16px'}>
            <Field label={t('common:core.ai.Max context')} required>
              <MyNumberInput
                register={register}
                isRequired
                name="config.maxContext"
                {...NumberInputStyles}
              />
            </Field>

            <Field
              label={t('config_model:max_response_tokens')}
              required
              tip={t('config_model:maxToken_tip')}
            >
              <MyNumberInput
                register={register}
                isRequired
                name="config.maxResponse"
                min={2000}
                {...NumberInputStyles}
              />
            </Field>

            <Field label={t('config_model:model.max_quote')}>
              <MyNumberInput
                register={register}
                name="config.quoteMaxToken"
                {...NumberInputStyles}
              />
            </Field>

            <Field
              label={t('config_model:model.max_temperature')}
              tip={t('config_model:max_temperature_tip')}
            >
              <MyNumberInput
                register={register}
                name="config.maxTemperature"
                min={0}
                step={0.1}
                {...NumberInputStyles}
              />
            </Field>

            <SwitchField
              label={t('config_model:model.show_top_p')}
              field={'config.showTopP'}
              register={register}
            />

            <SwitchField
              label={t('config_model:model.show_stop_sign')}
              field={'config.showStopSign'}
              register={register}
            />

            <ResponseFormatField control={control} setValue={setValue} t={t} />
          </Grid>
        </Section>
      )}

      {isEmbeddingModel && (
        <Section title={t('config_model:model.params_config_section')}>
          <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
            <SwitchField
              label={t('config_model:model.normalization')}
              tip={t('config_model:model.normalization_tip')}
              field={'config.normalization'}
              register={register}
            />
            <Field label={t('config_model:batch_size')} required>
              <MyNumberInput
                register={register}
                isRequired
                name="config.batchSize"
                min={1}
                step={1}
                {...NumberInputStyles}
              />
            </Field>
            <Field
              label={t('config_model:model.default_token')}
              required
              tip={t('config_model:model.default_token_tip')}
            >
              <MyNumberInput
                register={register}
                isRequired
                name="config.defaultToken"
                {...NumberInputStyles}
              />
            </Field>
            <Field label={t('common:core.ai.Max context')} required>
              <MyNumberInput
                register={register}
                isRequired
                name="config.maxToken"
                {...NumberInputStyles}
              />
            </Field>
          </Grid>
        </Section>
      )}

      {isRerankModel && (
        <Section title={t('config_model:model.params_config_section')}>
          <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
            <Field
              label={t('config_model:rerank_max_token')}
              required
              tip={t('config_model:rerank_max_token_tip')}
            >
              <MyNumberInput
                register={register}
                name="config.maxToken"
                isRequired
                min={1000}
                {...NumberInputStyles}
              />
            </Field>
          </Grid>
        </Section>
      )}

      {isLLMModel && (
        <Section title={t('config_model:model.feature_config_section')}>
          <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
            <SwitchField
              label={t('config_model:model.tool_choice')}
              tip={t('config_model:model.tool_choice_tip')}
              field={'config.toolChoice'}
              register={register}
            />
            <SwitchField
              label={t('config_model:model.vision')}
              tip={t('config_model:model.vision_tip')}
              field={'config.vision'}
              register={register}
            />
            <SwitchField
              label={t('config_model:audio')}
              tip={t('config_model:audio_tip')}
              field={'config.audio'}
              register={register}
            />
            <SwitchField
              label={t('config_model:video')}
              tip={t('config_model:video_tip')}
              field={'config.video'}
              register={register}
            />
            <SwitchField
              label={t('config_model:model.reasoning')}
              tip={t('config_model:model.reasoning_tip')}
              field={'config.reasoning'}
              register={register}
            />
            {reasoningEnabled && (
              <SwitchField
                label={t('config_model:model.reasoning_effort')}
                field={'config.reasoningEffort'}
                register={register}
              />
            )}
            {feConfigs?.isPlus && (
              <SwitchField
                label={t('config_model:model.censor')}
                tip={t('config_model:model.censor_tip')}
                field={'config.censor'}
                register={register}
              />
            )}
          </Grid>
        </Section>
      )}

      {isEmbeddingModel && (
        <Section title={t('config_model:model.feature_config_section')}>
          <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
            <SwitchField
              label={t('config_model:model.vision')}
              tip={t('config_model:model.embedding_vision_tip')}
              field={'config.vision'}
              register={register}
            />
          </Grid>
        </Section>
      )}

      {priceUnit && feConfigs?.isPlus && (
        <Section title={t('config_model:model.price_config_section')}>
          {isLLMModel ? (
            <ModelPriceTiersTable
              control={control}
              register={register}
              getValues={getValues}
              setValue={setValue}
            />
          ) : (
            <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
              <Field
                label={`${t('config_model:model.charsPointsPrice')}`}
                tip={t('config_model:model.charsPointsPrice_tip')}
              >
                <Flex alignItems={'center'} gap={2}>
                  <MyNumberInput
                    register={register}
                    name="charsPointsPrice"
                    step={0.01}
                    {...NumberInputStyles}
                  />
                  <Box flexShrink={0} fontSize={'12px'} color={'myGray.900'}>
                    {priceUnit}
                  </Box>
                </Flex>
              </Field>
            </Grid>
          )}
        </Section>
      )}

      <Section title={t('common:Other')} showBorder={false}>
        <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
          {isLLMModel && (
            <Field
              label={t('config_model:model.default_system_chat_prompt')}
              tip={t('config_model:model.default_system_chat_prompt_tip')}
              colSpan={[1, 2]}
            >
              <MyTextarea
                {...register('config.defaultSystemChatPrompt')}
                {...MultilineInputStyles}
                minH={'110px'}
              />
            </Field>
          )}
          {(isLLMModel || isEmbeddingModel || isRerankModel) && (
            <DefaultConfigField
              control={control}
              setValue={setValue}
              label={
                isEmbeddingModel
                  ? t('config_model:model.defaultConfig')
                  : t('config_model:model.default_config')
              }
              tip={
                isEmbeddingModel
                  ? t('config_model:model.defaultConfig_tip')
                  : isRerankModel
                    ? t('config_model:model.rerank_default_config_tip')
                    : t('config_model:model.default_config_tip')
              }
              onDraftChange={() => setHasJsonDraftChanges(true)}
            />
          )}
          {isTTSModel && (
            <VoicesField
              control={control}
              t={t}
              onDraftChange={() => setHasJsonDraftChanges(true)}
            />
          )}
          {CustomApi}
          <SwitchField
            label={t('config_model:model.test_mode')}
            tip={t('config_model:model.test_mode_tip')}
            field={'testMode'}
            register={register}
          />
        </Grid>
      </Section>
    </Box>
  );
};

export default ModelConfigForm;
