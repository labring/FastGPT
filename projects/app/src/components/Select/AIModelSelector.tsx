import { getMyModel, getMyModels } from '@/web/common/system/api';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { MyModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { SelectProps } from '@fastgpt/web/components/common/MySelect';
import MultipleRowSelect from '@fastgpt/web/components/common/MySelect/MultipleRowSelect';
import type { ListItemType } from '@fastgpt/web/components/common/MySelect/type';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { Box, Flex } from '@chakra-ui/react';
import type { ResponsiveValue } from '@chakra-ui/system';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TestModeBetaTag from '@/components/core/ai/TestModeBetaTag';
import MultimodalTag from '@/components/core/ai/MultimodelTag';
import {
  createRestrictedModelDiscovery,
  getModelSelectorModelId,
  isModelAllowedByValues,
  resolveModelSelectorProvider
} from './AIModelSelector.utils';
import { useUserStore } from '@/web/support/user/useUserStore';

type Props = Omit<SelectProps, 'list'> & {
  modelType?: ModelTypeEnum;
  /** 迁移期可用于限制模型范围；为空时以服务端返回为准。 */
  list?: SelectProps['list'];
  valueField?: 'modelId' | 'model';
  disableTip?: string;
  noOfLines?: ResponsiveValue<number>;
  cacheModel?: boolean;
  canBeUnset?: boolean;
  unsetLabel?: string;
};

const UNSET_MODEL_VALUE = '';
const LOAD_MORE_VALUE = '__load_more__';
const LOADING_VALUE = '__loading__';
const PAGE_SIZE = 10;

const modelAvatarSizeMap = { sm: '1rem', md: '1.2rem', lg: '1.4rem' } as const;
const getModelAvatarSize = (size?: Props['size']) =>
  typeof size === 'string' && size in modelAvatarSizeMap
    ? modelAvatarSizeMap[size as keyof typeof modelAvatarSizeMap]
    : modelAvatarSizeMap.md;

const hasMultimodalEmbedding = (model?: MyModelItemType) =>
  model?.type === ModelTypeEnum.embedding && !!model.config.vision;

const ModelLabel = ({
  model,
  avatarSize,
  noOfLines,
  showTags = true
}: {
  model: MyModelItemType;
  avatarSize: string;
  noOfLines?: ResponsiveValue<number>;
  showTags?: boolean;
}) => (
  <Flex
    data-preserve-width
    alignItems={'center'}
    justifyContent={'space-between'}
    py={1}
    w={'100%'}
    minW={0}
  >
    <Flex alignItems={'center'} flex={'1 1 0'} minW={0}>
      <Avatar
        borderRadius={'0'}
        mr={2}
        src={model.avatar || HUGGING_FACE_ICON}
        fallbackSrc={HUGGING_FACE_ICON}
        w={avatarSize}
      />
      <Box noOfLines={noOfLines ?? 1} minW={0} overflow={'hidden'}>
        {model.name}
      </Box>
    </Flex>
    {showTags && (model.testMode || hasMultimodalEmbedding(model)) && (
      <Flex alignItems={'center'} gap={1} ml={2} flexShrink={0}>
        {model.testMode && <TestModeBetaTag />}
        {hasMultimodalEmbedding(model) && <MultimodalTag />}
      </Flex>
    )}
  </Flex>
);

/**
 * 模型选择器不再依赖 getInitData 的完整模型缓存。当前值通过 getMyModel 单独恢复；
 * 候选列表只在用户首次打开选择器时请求，超过 10 条才进入 Provider 分组。
 */
const AIModelSelectorInner = ({
  modelType = ModelTypeEnum.llm,
  valueField = 'modelId',
  list: legacyList,
  onChange,
  disableTip,
  noOfLines,
  canBeUnset = false,
  unsetLabel,
  placeholder,
  ...props
}: Props) => {
  const { t, i18n } = useTranslation();
  const { getModelProvider } = useSystemStore();
  const avatarSize = useMemo(() => getModelAvatarSize(props.size), [props.size]);
  const allowedLegacyValues = useMemo(
    () =>
      legacyList === undefined ? undefined : new Set(legacyList.map((item) => String(item.value))),
    [legacyList]
  );
  const filterLegacyList = useCallback(
    (models: MyModelItemType[]) =>
      allowedLegacyValues === undefined
        ? models
        : models.filter((model) => isModelAllowedByValues(model, allowedLegacyValues)),
    [allowedLegacyValues]
  );
  const currentValue = props.value ? String(props.value) : '';
  const selectedModelId = getModelSelectorModelId(currentValue, valueField);
  const legacySelectedItem =
    selectedModelId || !currentValue
      ? undefined
      : legacyList?.find((item) => String(item.value) === currentValue);

  const discoveryRequestTypeRef = useRef<ModelTypeEnum>();
  const {
    data: discoveryResult,
    loading: discoveryLoading,
    run: runDiscovery
  } = useRequest(
    async (requestModelType: ModelTypeEnum) => {
      try {
        const discoveryPageSize = allowedLegacyValues === undefined ? PAGE_SIZE : 100;
        let data = await getMyModels({
          modelType: requestModelType,
          pageNum: 1,
          pageSize: discoveryPageSize
        });

        if (allowedLegacyValues !== undefined) {
          const models = [...data.list];
          for (let pageNum = 2; (pageNum - 1) * discoveryPageSize < data.total; pageNum += 1) {
            const page = await getMyModels({
              modelType: requestModelType,
              pageNum,
              pageSize: discoveryPageSize
            });
            models.push(...page.list);
          }
          data = createRestrictedModelDiscovery({ models, allowedValues: allowedLegacyValues });
        }
        let legacySelectedModel: MyModelItemType | undefined;

        // 历史 model 值只在展开选择器后从可用模型列表恢复，不扩大内部单模型 API 的兼容面。
        if (currentValue && !selectedModelId) {
          legacySelectedModel = data.list.find(
            (model) => model.model === currentValue || model.modelId === currentValue
          );

          if (
            allowedLegacyValues === undefined &&
            !legacySelectedModel &&
            data.total > data.list.length
          ) {
            const recoveryPageSize = 100;
            for (
              let pageNum = 1;
              (pageNum - 1) * recoveryPageSize < data.total && !legacySelectedModel;
              pageNum += 1
            ) {
              const page = await getMyModels({
                modelType: requestModelType,
                pageNum,
                pageSize: recoveryPageSize
              });
              legacySelectedModel = page.list.find(
                (model) => model.model === currentValue || model.modelId === currentValue
              );
            }
          }
        }

        return { modelType: requestModelType, data, legacySelectedModel };
      } finally {
        if (discoveryRequestTypeRef.current === requestModelType) {
          discoveryRequestTypeRef.current = undefined;
        }
      }
    },
    {
      manual: true,
      errorToast: ''
    }
  );
  const discovery = discoveryResult?.modelType === modelType ? discoveryResult.data : undefined;
  const discoveredLegacyModel =
    discoveryResult?.modelType === modelType ? discoveryResult.legacySelectedModel : undefined;
  const loadDiscovery = useCallback(() => {
    if (discovery || discoveryRequestTypeRef.current === modelType) return;

    discoveryRequestTypeRef.current = modelType;
    runDiscovery(modelType);
  }, [discovery, modelType, runDiscovery]);

  const [provider, setProvider] = useState('');
  const [providerPage, setProviderPage] = useState(1);
  const [providerModels, setProviderModels] = useState<MyModelItemType[]>([]);
  const [providerHasMore, setProviderHasMore] = useState(false);
  const [providerLoading, setProviderLoading] = useState(false);
  const selectedModelFromLoadedList = currentValue
    ? [...(discovery?.list ?? []), ...providerModels].find(
        (model) => (valueField === 'modelId' ? model.modelId : model.model) === currentValue
      )
    : undefined;
  const {
    data: selectedModel,
    loading: selectedLoading,
    error: selectedError
  } = useRequest(() => getMyModel({ modelId: String(props.value) }), {
    manual:
      !selectedModelId ||
      props.value === UNSET_MODEL_VALUE ||
      selectedModelFromLoadedList !== undefined,
    refreshDeps: [props.value, valueField],
    errorToast: ''
  });

  // 选择器列表已经包含用户刚选中的完整模型，优先复用它，避免 value 变化后重复请求。
  const requestedSelectedModel =
    selectedModel?.modelId === selectedModelId ? selectedModel : undefined;
  const resolvedSelectedModel =
    selectedModelFromLoadedList ?? requestedSelectedModel ?? discoveredLegacyModel;
  const selectedModelForType =
    resolvedSelectedModel?.type === modelType &&
    isModelAllowedByValues(resolvedSelectedModel, allowedLegacyValues)
      ? resolvedSelectedModel
      : undefined;

  useEffect(() => {
    if (!discovery) return;
    // Provider 是 discovery 请求结果对应的交互状态，需要在结果切换时整体重置。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProvider((current) =>
      resolveModelSelectorProvider({
        total: discovery.total,
        pageSize: PAGE_SIZE,
        providers: discovery.providers,
        selectedProvider: selectedModelForType?.provider,
        currentProvider: current
      })
    );
    setProviderPage(1);
    setProviderModels([]);
    setProviderHasMore(false);
  }, [discovery, selectedModelForType?.provider]);

  useEffect(() => {
    if (
      !discovery ||
      allowedLegacyValues !== undefined ||
      discovery.total <= PAGE_SIZE ||
      !provider
    ) {
      return;
    }
    let cancelled = false;
    // 此状态覆盖当前 effect 启动的异步请求生命周期。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProviderLoading(true);
    getMyModels({ modelType, provider, pageNum: providerPage, pageSize: PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;
        const nextModels = filterLegacyList(result.list);
        setProviderModels((current) =>
          providerPage === 1
            ? nextModels
            : [
                ...current,
                ...nextModels.filter((item) => !current.some((m) => m.modelId === item.modelId))
              ]
        );
        setProviderHasMore(providerPage * PAGE_SIZE < result.total);
      })
      .catch(() => {
        if (!cancelled) setProviderHasMore(false);
      })
      .finally(() => {
        if (!cancelled) setProviderLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowedLegacyValues, discovery, filterLegacyList, modelType, provider, providerPage]);

  const getValue = useCallback(
    (model: MyModelItemType) => (valueField === 'modelId' ? model.modelId : model.model),
    [valueField]
  );
  const selectedUnset = canBeUnset && props.value === UNSET_MODEL_VALUE;
  const requiresSelectedModelRequest = !!selectedModelId && !selectedModelFromLoadedList;
  const selectedValueLoading =
    requiresSelectedModelRequest &&
    !!props.value &&
    (selectedLoading || (!requestedSelectedModel && !selectedError));
  const invalidValue = selectedModelId
    ? !!props.value &&
      !selectedValueLoading &&
      ((requiresSelectedModelRequest && !!selectedError) || !selectedModelForType)
    : !!props.value && !!discovery && !selectedModelForType;
  const invalidModelLabel = resolvedSelectedModel?.name || currentValue;
  const selectedErrorText = t('common:model_disabled', { model: invalidModelLabel });
  const selectedLabel = selectedUnset ? (
    <>{unsetLabel ?? t('common:not_model_config')}</>
  ) : selectedValueLoading ? (
    <>{t('common:model_loading_label')}</>
  ) : invalidValue ? (
    <Box color={'red.500'} noOfLines={noOfLines ?? 1} title={selectedErrorText}>
      {selectedErrorText}
    </Box>
  ) : selectedModelForType ? (
    <ModelLabel
      model={selectedModelForType}
      avatarSize={avatarSize}
      noOfLines={noOfLines}
      showTags={false}
    />
  ) : legacySelectedItem ? (
    <>{legacySelectedItem.label}</>
  ) : currentValue ? (
    <>{currentValue}</>
  ) : undefined;

  const oneRowModels = useMemo(() => {
    const models = [...filterLegacyList(discovery?.list ?? [])];
    if (
      selectedModelForType &&
      !models.some((model) => model.modelId === selectedModelForType.modelId)
    ) {
      models.unshift(selectedModelForType);
    }
    return models;
  }, [discovery?.list, filterLegacyList, selectedModelForType]);

  const isGrouped = !!discovery && discovery.total > PAGE_SIZE;
  const selectorList: ListItemType[] = isGrouped
    ? discovery.providers.map((providerId) => {
        const providerData = getModelProvider(providerId, i18n.language);
        const children = (
          allowedLegacyValues !== undefined
            ? discovery.list.filter((model) => model.provider === providerId)
            : provider === providerId
              ? providerModels
              : []
        ).map((model) => ({
          value: getValue(model),
          label: <ModelLabel model={model} avatarSize={avatarSize} />
        }));
        if (allowedLegacyValues === undefined && provider === providerId && providerHasMore) {
          children.push({
            value: LOAD_MORE_VALUE,
            label: <Box color={'primary.600'}>{t('common:request_more')}</Box>
          });
        }
        if (allowedLegacyValues === undefined && children.length === 0) {
          children.push({ value: LOADING_VALUE, label: <Box>{t('common:model_loading')}</Box> });
        }
        return {
          value: providerId,
          label: (
            <Flex alignItems={'center'} py={1}>
              <Avatar src={providerData.avatar || HUGGING_FACE_ICON} w={'1rem'} mr={2} />
              <Box>{providerData.name}</Box>
            </Flex>
          ),
          children
        };
      })
    : oneRowModels.map((model) => ({
        value: getValue(model),
        label: <ModelLabel model={model} avatarSize={avatarSize} noOfLines={noOfLines} />
      }));
  if (!discovery && discoveryLoading) {
    selectorList.push({
      value: LOADING_VALUE,
      label: <Box>{t('common:model_loading')}</Box>,
      children: []
    });
  }
  if (canBeUnset) {
    selectorList.unshift({
      value: UNSET_MODEL_VALUE,
      label: <Flex>{unsetLabel ?? t('common:not_model_config')}</Flex>,
      children: []
    });
  }

  return (
    <MyTooltip label={disableTip}>
      <MultipleRowSelect
        label={selectedLabel}
        list={selectorList}
        value={
          selectedUnset
            ? [UNSET_MODEL_VALUE]
            : selectedModelForType
              ? isGrouped
                ? [selectedModelForType.provider, getValue(selectedModelForType)]
                : [getValue(selectedModelForType)]
              : currentValue && !isGrouped
                ? [currentValue]
                : []
        }
        placeholder={
          selectedValueLoading
            ? t('common:model_loading_label')
            : (placeholder ?? t('common:not_model_config'))
        }
        changeOnEverySelect
        rowMinWidth="160px"
        onOpenFunc={loadDiscovery}
        onSelect={(values) => {
          if (!isGrouped) {
            const [modelValue] = values;
            if (modelValue === UNSET_MODEL_VALUE) return onChange?.(UNSET_MODEL_VALUE);
            if (modelValue && modelValue !== LOADING_VALUE) onChange?.(modelValue);
            return;
          }

          const [nextProvider, modelValue] = values;
          if (nextProvider === UNSET_MODEL_VALUE) return onChange?.(UNSET_MODEL_VALUE);
          if (nextProvider && nextProvider !== provider) {
            setProvider(nextProvider);
            setProviderPage(1);
            setProviderModels([]);
            return;
          }
          if (modelValue === LOAD_MORE_VALUE) {
            if (!providerLoading) setProviderPage((page) => page + 1);
            return;
          }
          if (modelValue && modelValue !== LOADING_VALUE) onChange?.(modelValue);
        }}
        ButtonProps={{
          ...props,
          isDisabled: !!disableTip,
          h: '40px',
          whiteSpace: 'nowrap'
        }}
      />
    </MyTooltip>
  );
};

/** 切换成员身份时强制重建选择器，避免请求完成前短暂展示上一成员的可用模型。 */
const AIModelSelector = (props: Props) => {
  const tmbId = useUserStore((state) => state.userInfo?.team?.tmbId ?? 'unauthenticated');
  const modelType = props.modelType ?? ModelTypeEnum.llm;
  return <AIModelSelectorInner key={`${tmbId}:${modelType}`} {...props} />;
};

export default AIModelSelector;
