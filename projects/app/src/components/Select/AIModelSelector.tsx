import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { MyModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { SelectProps } from '@fastgpt/web/components/common/MySelect';
import MultipleRowSelect from '@fastgpt/web/components/common/MySelect/MultipleRowSelect';
import type { ListItemType } from '@fastgpt/web/components/common/MySelect/type';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { Box, Flex } from '@chakra-ui/react';
import type { ResponsiveValue } from '@chakra-ui/system';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import TestModeBetaTag from '@/components/core/ai/TestModeBetaTag';
import MultimodalTag from '@/components/core/ai/MultimodelTag';
import {
  isModelAllowedByValues,
  resolveModelSelectorDefault,
  resolveModelSelectorDisabled,
  resolveModelSelectorProviders,
  resolveModelSelectorSelection
} from './AIModelSelector.utils';
import { useModelDetail } from '@/web/core/ai/model/useModelDetail';
import { ModelStatusLabel } from './ModelStatusLabel';
import { useUserModelLists } from '@/web/core/ai/model/useUserModelLists';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

type Props = Omit<SelectProps, 'list'> & {
  modelType: ModelTypeEnum;
  /** 迁移期限制模型范围；候选模型仍来自当前成员完整目录。 */
  list?: SelectProps['list'];
  /**
   * 兼容现有调用方；当前状态统一由展示详情接口提供，避免绕过成员权限判断。
   */
  resolvedCurrentModel?: MyModelItemType;
  disableTip?: string;
  noOfLines?: ResponsiveValue<number>;
  canBeUnset?: boolean;
  unsetLabel?: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  /** 当前值为空时，目录加载完成后写入系统有效默认模型；不覆盖非空的历史或失效值。 */
  autoSelectDefault?: boolean;
};

const UNSET_MODEL_VALUE = '';
const modelAvatarSizeMap = { sm: '1rem', md: '1.2rem', lg: '1.4rem' } as const;
const getModelAvatarSize = (size?: Props['size']) =>
  typeof size === 'string' && size in modelAvatarSizeMap
    ? modelAvatarSizeMap[size as keyof typeof modelAvatarSizeMap]
    : modelAvatarSizeMap.md;

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
}) => {
  const multimodalEmbedding = model.type === ModelTypeEnum.embedding && !!model.config.vision;
  return (
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
        <MyTooltip label={model.name} showOnlyWhenOverflow shouldWrapChildren={false}>
          <Box
            data-preserve-width
            w={'100%'}
            noOfLines={noOfLines ?? 1}
            minW={0}
            overflow={'hidden'}
          >
            {model.name}
          </Box>
        </MyTooltip>
      </Flex>
      {showTags && (model.testMode || multimodalEmbedding) && (
        <Flex alignItems={'center'} gap={1} ml={2} flexShrink={0}>
          {model.testMode && <TestModeBetaTag />}
          {multimodalEmbedding && <MultimodalTag />}
        </Flex>
      )}
    </Flex>
  );
};

/** 收起时仅查询当前模型详情；展开时校验候选目录，显示和选择都不使用隐式默认值。 */
const AIModelSelector = ({
  modelType,
  list: restrictedList,
  resolvedCurrentModel: _resolvedCurrentModel,
  onChange,
  disableTip,
  noOfLines,
  canBeUnset = false,
  unsetLabel,
  placeholder,
  outLinkAuthData,
  autoSelectDefault = false,
  ...props
}: Props) => {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const {
    modelList,
    loading,
    error: catalogError
  } = useUserModelLists({ outLinkAuthData, enabled: isOpen });
  const getModelProvider = useUserModelStore((state) => state.getModelProvider);
  const getModelProviders = useUserModelStore((state) => state.getModelProviders);
  const defaultModelId = useUserModelStore((state) => state.defaultModelIds[modelType]);
  const avatarSize = useMemo(() => getModelAvatarSize(props.size), [props.size]);
  const allowedValues = useMemo(
    () =>
      restrictedList === undefined
        ? undefined
        : new Set(restrictedList.map((item) => String(item.value))),
    [restrictedList]
  );
  const models = useMemo(
    () =>
      modelList.filter(
        (model) =>
          model.type === modelType &&
          (allowedValues === undefined || isModelAllowedByValues(model, allowedValues))
      ),
    [allowedValues, modelList, modelType]
  );
  const currentValue = props.value ? String(props.value) : '';
  const selection = useMemo(
    () =>
      resolveModelSelectorSelection({
        models,
        value: currentValue
      }),
    [currentValue, models]
  );
  const selectedModel = selection?.model;
  const detailState = useModelDetail({ modelId: currentValue, outLinkAuthData });
  const normalizedSelectionRef = useRef<string>();
  const autoSelectedDefaultRef = useRef<string>();

  // 完整目录加载后自动把旧 model 值写回 modelId，选择器对外只输出稳定 ID。
  useEffect(() => {
    if (!isOpen || loading || catalogError || !selection?.shouldNormalize) {
      normalizedSelectionRef.current = undefined;
      return;
    }

    const normalizationKey = `${currentValue}:${selection.normalizedValue}`;
    if (normalizedSelectionRef.current === normalizationKey) return;
    normalizedSelectionRef.current = normalizationKey;
    onChange?.(selection.normalizedValue);
  }, [catalogError, currentValue, isOpen, loading, onChange, selection]);

  const defaultModel = useMemo(
    () => resolveModelSelectorDefault({ models, defaultModelId }),
    [defaultModelId, models]
  );

  // 仅为明确启用该能力的业务表单补齐空值；历史失效值必须保留并显示不可用状态。
  useEffect(() => {
    if (!isOpen || !autoSelectDefault || loading || catalogError || currentValue || !defaultModel)
      return;

    const defaultKey = `${modelType}:${defaultModel.modelId}`;
    if (autoSelectedDefaultRef.current === defaultKey) return;
    autoSelectedDefaultRef.current = defaultKey;
    onChange?.(defaultModel.modelId);
  }, [
    autoSelectDefault,
    catalogError,
    currentValue,
    defaultModel,
    isOpen,
    loading,
    modelType,
    onChange
  ]);

  const providerIds = resolveModelSelectorProviders({
    models,
    providers: getModelProviders(i18n.language)
  });
  const grouped = models.length > 10;
  const selectorList: ListItemType[] = grouped
    ? providerIds.map((providerId) => {
        const provider = getModelProvider(providerId, i18n.language);
        return {
          value: providerId,
          label: (
            <Flex alignItems={'center'} py={1}>
              <Avatar src={provider.avatar || HUGGING_FACE_ICON} w={'1rem'} mr={2} />
              <Box>{provider.name}</Box>
            </Flex>
          ),
          children: models
            .filter((model) => model.provider === providerId)
            .map((model) => ({
              value: model.modelId,
              label: <ModelLabel model={model} avatarSize={avatarSize} />
            }))
        };
      })
    : models.map((model) => ({
        value: model.modelId,
        label: <ModelLabel model={model} avatarSize={avatarSize} noOfLines={noOfLines} />
      }));
  if (canBeUnset)
    selectorList.unshift({
      value: UNSET_MODEL_VALUE,
      label: <Flex>{unsetLabel ?? t('common:not_model_config')}</Flex>,
      children: []
    });

  const selector = (
    <MultipleRowSelect
      label={
        <ModelStatusLabel
          modelId={currentValue}
          detail={detailState.detail}
          loading={detailState.loading}
          error={detailState.error}
          emptyLabel={canBeUnset ? unsetLabel : placeholder}
          avatarSize={avatarSize}
        />
      }
      list={loading || catalogError ? [] : selectorList}
      emptyTip={
        loading
          ? t('common:model_loading_label')
          : catalogError
            ? t('common:model_detail_load_failed')
            : undefined
      }
      onOpenFunc={() => {
        setIsOpen(true);
        detailState.refresh();
      }}
      onCloseFunc={() => setIsOpen(false)}
      value={
        selectedModel
          ? grouped
            ? [selectedModel.provider, selectedModel.modelId]
            : [selectedModel.modelId]
          : canBeUnset && currentValue === UNSET_MODEL_VALUE
            ? [UNSET_MODEL_VALUE]
            : []
      }
      placeholder={
        loading ? t('common:model_loading_label') : (placeholder ?? t('common:not_model_config'))
      }
      changeOnEverySelect
      rowMinWidth="160px"
      onSelect={(values) => {
        if (canBeUnset && values[0] === UNSET_MODEL_VALUE) {
          onChange?.(UNSET_MODEL_VALUE);
          return;
        }
        const value = grouped ? values[1] : values[0];
        if (value !== undefined) onChange?.(value);
      }}
      ButtonProps={{
        ...props,
        isLoading: isOpen && loading,
        loadingText: t('common:model_loading_label'),
        isDisabled: resolveModelSelectorDisabled({
          isDisabled: props.isDisabled,
          loading,
          disableTip
        }),
        h: '40px',
        whiteSpace: 'nowrap'
      }}
    />
  );

  if (!disableTip) return selector;

  return (
    <MyTooltip label={disableTip} shouldWrapChildren={false}>
      <Box w={props.w ?? props.width ?? '100%'} maxW={props.maxW ?? props.maxWidth}>
        {selector}
      </Box>
    </MyTooltip>
  );
};

export default AIModelSelector;
