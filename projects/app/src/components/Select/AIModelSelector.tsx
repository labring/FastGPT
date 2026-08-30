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
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import TestModeBetaTag from '@/components/core/ai/TestModeBetaTag';
import MultimodalTag from '@/components/core/ai/MultimodelTag';
import { isModelAllowedByValues, resolveModelSelectorSelection } from './AIModelSelector.utils';
import { useUserModelLists } from '@/web/core/ai/model/useUserModelLists';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';

type Props = Omit<SelectProps, 'list'> & {
  modelType?: ModelTypeEnum;
  /** 迁移期限制模型范围；候选模型仍来自当前成员完整目录。 */
  list?: SelectProps['list'];
  valueField?: 'modelId' | 'model';
  disableTip?: string;
  noOfLines?: ResponsiveValue<number>;
  cacheModel?: boolean;
  canBeUnset?: boolean;
  unsetLabel?: string;
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
    <Flex alignItems={'center'} justifyContent={'space-between'} py={1} w={'100%'} minW={0}>
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
      {showTags && (model.testMode || multimodalEmbedding) && (
        <Flex alignItems={'center'} gap={1} ml={2} flexShrink={0}>
          {model.testMode && <TestModeBetaTag />}
          {multimodalEmbedding && <MultimodalTag />}
        </Flex>
      )}
    </Flex>
  );
};

/** 模型选择器只读取 useUserModelStore 的完整目录，不再发起分页或单模型详情请求。 */
const AIModelSelector = ({
  modelType = ModelTypeEnum.llm,
  valueField = 'modelId',
  list: restrictedList,
  onChange,
  disableTip,
  noOfLines,
  canBeUnset = false,
  unsetLabel,
  placeholder,
  ...props
}: Props) => {
  const { t, i18n } = useTranslation();
  const { modelList, loading } = useUserModelLists();
  const getModelProvider = useUserModelStore((state) => state.getModelProvider);
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
        value: currentValue,
        valueField
      }),
    [currentValue, models, valueField]
  );
  const selectedModel = selection?.model;
  const legacySelectedItem = restrictedList?.find((item) => String(item.value) === currentValue);
  const getValue = useCallback(
    (model: MyModelItemType) => (valueField === 'modelId' ? model.modelId : model.model),
    [valueField]
  );
  const normalizedSelectionRef = useRef<string>();

  // 完整目录加载后自动把旧 model 值写回 modelId；其余调用方仍遵循各自的 valueField 输出契约。
  useEffect(() => {
    if (loading || !selection?.shouldNormalize) {
      normalizedSelectionRef.current = undefined;
      return;
    }

    const normalizationKey = `${currentValue}:${selection.normalizedValue}`;
    if (normalizedSelectionRef.current === normalizationKey) return;
    normalizedSelectionRef.current = normalizationKey;
    onChange?.(selection.normalizedValue);
  }, [currentValue, loading, onChange, selection]);

  const providerIds = Array.from(new Set(models.map((model) => model.provider)));
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
              value: getValue(model),
              label: <ModelLabel model={model} avatarSize={avatarSize} />
            }))
        };
      })
    : models.map((model) => ({
        value: getValue(model),
        label: <ModelLabel model={model} avatarSize={avatarSize} noOfLines={noOfLines} />
      }));
  if (canBeUnset)
    selectorList.unshift({
      value: UNSET_MODEL_VALUE,
      label: <Flex>{unsetLabel ?? t('common:not_model_config')}</Flex>,
      children: []
    });

  const invalidValue = !!currentValue && !selectedModel && !loading;
  const selectedLabel =
    canBeUnset && currentValue === UNSET_MODEL_VALUE ? (
      <>{unsetLabel ?? t('common:not_model_config')}</>
    ) : selectedModel ? (
      <ModelLabel
        model={selectedModel}
        avatarSize={avatarSize}
        noOfLines={noOfLines}
        showTags={false}
      />
    ) : invalidValue ? (
      <Box color={'red.500'} noOfLines={noOfLines ?? 1}>
        {t('common:model_disabled', { model: currentValue })}
      </Box>
    ) : legacySelectedItem ? (
      <>{legacySelectedItem.label}</>
    ) : undefined;

  return (
    <MyTooltip label={disableTip}>
      <MultipleRowSelect
        label={loading ? <>{t('common:model_loading_label')}</> : selectedLabel}
        list={selectorList}
        value={
          selectedModel
            ? grouped
              ? [selectedModel.provider, getValue(selectedModel)]
              : [getValue(selectedModel)]
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
          isDisabled: !!disableTip || loading,
          h: '40px',
          whiteSpace: 'nowrap'
        }}
      />
    </MyTooltip>
  );
};

export default AIModelSelector;
