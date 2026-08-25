import { Box, Flex } from '@chakra-ui/react';
import type { ResponsiveValue } from '@chakra-ui/system';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { ListModelsBody, ModelListItem } from '@fastgpt/global/openapi/core/ai/model/api';
import type { GetSystemDefaultModelResponse } from '@fastgpt/global/openapi/core/ai/model/api';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MySelect, { type SelectProps } from '@fastgpt/web/components/common/MySelect';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDebounceFn } from 'ahooks';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getSystemDefault, getModelDetail, getModelListPage } from '@/web/core/ai/config';
import TestModeBetaTag from '@/components/core/ai/TestModeBetaTag';
import MultimodalTag from '@/components/core/ai/MultimodelTag';

type Props = Omit<SelectProps, 'onChange' | 'list' | 'type'> & {
  /** Model type filter for the paginated list query. Accepts the enum or its string values. */
  type: ModelTypeEnum | `${ModelTypeEnum}`;
  /** Business-filtered candidate model ids. When provided, only models within this set are shown. */
  list?: { value: string }[];
  /** Selected modelId; onChange fires with (modelId, modelData) */
  onChange?: (modelId: string, modelData?: ModelListItem) => any;
  disableTip?: string;
  noOfLines?: ResponsiveValue<number>;
  canBeUnset?: boolean;
  unsetLabel?: string;
  /** Auto select the system default model when value is empty (design §3.2) */
  autoSelectDefault?: boolean;
  /**
   * Which scene of GetSystemDefaultModelResponse to read when autoSelectDefault
   * is on. Defaults to the plain type key (llm/embedding/tts/stt/rerank); pass
   * e.g. 'datasetTextLLM' to default by the dataset text model instead.
   */
  defaultKey?: keyof GetSystemDefaultModelResponse;
  resourceContext?: { appId?: string; datasetId?: string };
};

export type AIModelSelectorProps = Props;

/** Unified type for models from both the list and detail endpoints */
type SelectorModel = Pick<ModelListItem, 'id' | 'provider' | 'model' | 'name' | 'type'> & {
  testMode?: boolean;
  vision?: boolean;
  isSystem?: boolean;
};

const modelAvatarSizeMap = {
  sm: '1rem',
  md: '1.2rem',
  lg: '1.4rem'
} as const;

const getModelAvatarSize = (size?: Props['size']) => {
  if (typeof size === 'string' && size in modelAvatarSizeMap) {
    return modelAvatarSizeMap[size as keyof typeof modelAvatarSizeMap];
  }

  return modelAvatarSizeMap.md;
};

const isTestModeModel = (model?: SelectorModel) => {
  return !!model?.testMode;
};
const isMultimodalEmbeddingModel = (model?: SelectorModel) => {
  return model?.type === ModelTypeEnum.embedding && !!model.vision;
};

const UNSET_MODEL_VALUE = '';
const PAGE_SIZE = 20;
// map model type to the corresponding key in GetSystemDefaultModelResponse
const defaultModelKeyMap: Record<ModelTypeEnum, keyof GetSystemDefaultModelResponse> = {
  [ModelTypeEnum.llm]: 'llm',
  [ModelTypeEnum.embedding]: 'embedding',
  [ModelTypeEnum.tts]: 'tts',
  [ModelTypeEnum.stt]: 'stt',
  [ModelTypeEnum.rerank]: 'rerank'
};

const UnsetOptionLabel = React.memo(function UnsetOptionLabel({
  label
}: {
  label: string | React.ReactNode;
}) {
  return (
    <Flex alignItems={'center'} py={1} w={'100%'} minW={0}>
      <Box noOfLines={1} flex={'1 1 0'} minW={0} overflow={'hidden'}>
        {label}
      </Box>
    </Flex>
  );
});

const SelectorActiveModelTags = React.memo(function SelectorActiveModelTags({
  model
}: {
  model?: SelectorModel;
}) {
  const showTestModeTip = isTestModeModel(model);
  const showMultimodalTip = isMultimodalEmbeddingModel(model);

  if (!showTestModeTip && !showMultimodalTip) return null;

  return (
    <Box
      position={'absolute'}
      top={'50%'}
      right={'40px'}
      transform={'translateY(-50%)'}
      zIndex={3}
      display={'flex'}
      alignItems={'center'}
      gap={1}
    >
      {showTestModeTip && <TestModeBetaTag />}
      {showMultimodalTip && <MultimodalTag />}
    </Box>
  );
});

const ModelOptionLabel = React.memo(function ModelOptionLabel({
  name,
  showTestModeTip,
  showMultimodalTip,
  noOfLines
}: {
  name: string;
  showTestModeTip: boolean;
  showMultimodalTip?: boolean;
  noOfLines?: ResponsiveValue<number>;
}) {
  return (
    <Flex alignItems={'center'} flex={'1 1 0'} w={'100%'} minW={0} overflow={'hidden'}>
      <Box noOfLines={noOfLines ?? 1} flex={'1 1 0'} minW={0} overflow={'hidden'}>
        {name}
      </Box>
      {showTestModeTip && (
        <Box ml={1} flexShrink={0} pointerEvents={'auto'}>
          <TestModeBetaTag />
        </Box>
      )}
      {showMultimodalTip && (
        <Box ml={1} flexShrink={0} pointerEvents={'auto'}>
          <MultimodalTag />
        </Box>
      )}
    </Flex>
  );
});

const AIModelSelector = ({
  type,
  list,
  value,
  onChange,
  disableTip,
  noOfLines,
  canBeUnset = false,
  unsetLabel,
  autoSelectDefault = false,
  defaultKey,
  resourceContext,
  customOnOpen,
  customOnClose,
  ...selectProps
}: Props) => {
  const { t } = useTranslation(['common', 'account']);
  const { getModelProvider } = useSystemStore();

  const avatarSize = useMemo(() => getModelAvatarSize(selectProps.size), [selectProps.size]);

  // 1. Paginated model list: first page loads on mount, scroll loads more (design §2.1)
  const [search, setSearch] = useState('');
  const searchRef = useRef('');
  const {
    ScrollData,
    isLoading,
    data: loadedModels,
    fetchData
  } = useScrollPagination(
    (params: ListModelsBody) =>
      getModelListPage({
        ...params,
        type,
        isActive: 'active',
        search: searchRef.current,
        resourceContext
      }),
    {
      pageSize: PAGE_SIZE,
      params: {
        type,
        isActive: 'active' as const
      }
    }
  );

  // 2. Search: debounce 300ms then refresh the first page silently (no menu flicker)
  const { run: onDebouncedSearch } = useDebounceFn(
    () => {
      fetchData({ init: true, silent: true });
    },
    {
      wait: 300
    }
  );

  // Reload when the model type changes (type is fixed for a given call site)
  const prevTypeRef = useRef(type);
  useEffect(() => {
    if (prevTypeRef.current === type) return;
    prevTypeRef.current = type;
    fetchData({ init: true, silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // 3. Selected model echo: if the value is not in the loaded list, fetch it by detail (design §16.4)
  const selectedFromList = useMemo(
    () => loadedModels.find((model) => model.id === value),
    [loadedModels, value]
  );
  const needDetail = !!value && !selectedFromList;
  const {
    data: detailModel,
    loading: detailLoading,
    error: detailError
  } = useRequest(() => getModelDetail({ id: value as string, ...resourceContext }), {
    manual: false,
    ready: needDetail,
    refreshDeps: [needDetail, value, resourceContext?.appId, resourceContext?.datasetId],
    errorToast: ''
  });

  const selectedModel = selectedFromList ?? detailModel;
  // detail fetch failed: model may have been deleted (design §16.4)
  const isDeletedModel = needDetail && !!detailError;

  // 4. Auto select the system default model when value is empty (design §3.2)
  const { data: systemDefault } = useRequest(getSystemDefault, {
    manual: false,
    ready: autoSelectDefault,
    refreshDeps: [autoSelectDefault],
    errorToast: ''
  });
  useEffect(() => {
    if (!autoSelectDefault || !!value || !systemDefault) return;
    if (isLoading || loadedModels.length === 0) return;
    // Respect the business-filtered candidate set (`list` prop) when picking the default
    const candidateIds = list ? new Set(list.map((item) => item.value)) : null;
    const filteredModels = candidateIds
      ? loadedModels.filter((model) => candidateIds.has(model.id))
      : loadedModels;
    const configuredDefaultId = systemDefault[defaultKey ?? defaultModelKeyMap[type]]?.id;
    const defaultId =
      configuredDefaultId && (!candidateIds || candidateIds.has(configuredDefaultId))
        ? configuredDefaultId
        : (filteredModels.find((model) => model.isSystem)?.id ?? filteredModels[0]?.id);
    if (defaultId) {
      onChange?.(
        defaultId,
        loadedModels.find((model) => model.id === defaultId)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelectDefault, value, systemDefault, isLoading, loadedModels, type, list, defaultKey]);

  const selectedUnset = canBeUnset && value === UNSET_MODEL_VALUE;

  // Options: intersect the paginated list with the business-filtered candidates (if any)
  const options = useMemo(() => {
    const candidateIds = list ? new Set(list.map((item) => item.value)) : null;
    const models = candidateIds
      ? loadedModels.filter((model) => candidateIds.has(model.id))
      : loadedModels;

    const modelOptions = models.map<{ value: string; alias?: string; label: React.ReactNode }>(
      (model) => ({
        value: model.id,
        // alias powers the local search filter (labels are React nodes)
        alias: model.name,
        label: (
          <Flex alignItems={'center'} py={1} w={'100%'} minW={0}>
            <Avatar
              borderRadius={'0'}
              mr={2}
              src={getModelProvider(model.provider)?.avatar || HUGGING_FACE_ICON}
              w={avatarSize}
              fallbackSrc={HUGGING_FACE_ICON}
            />
            <ModelOptionLabel
              name={model.name}
              noOfLines={noOfLines}
              showTestModeTip={isTestModeModel(model)}
              showMultimodalTip={isMultimodalEmbeddingModel(model)}
            />
          </Flex>
        )
      })
    );

    if (!canBeUnset) return modelOptions;

    return [
      {
        value: UNSET_MODEL_VALUE,
        label: <UnsetOptionLabel label={unsetLabel ?? t('common:not_model_config')} />
      },
      ...modelOptions
    ];
  }, [list, loadedModels, getModelProvider, avatarSize, noOfLines, canBeUnset, unsetLabel, t]);

  const valueLabel = useMemo(() => {
    if (isDeletedModel) {
      return (
        <Flex alignItems={'center'} py={1} minW={0} overflow={'hidden'}>
          <Box noOfLines={1} color={'red.500'} fontSize={'sm'}>
            {t('common:model_deleted')} (ID: {value.slice(0, 8)}...)
          </Box>
        </Flex>
      );
    }
    if (selectedUnset) {
      return <UnsetOptionLabel label={unsetLabel ?? t('common:not_model_config')} />;
    }
    if (!selectedModel) {
      return needDetail && detailLoading ? <>{t('common:model_loading')}</> : undefined;
    }

    return (
      <Flex alignItems={'center'} py={1} minW={0} overflow={'hidden'}>
        <Avatar
          borderRadius={'0'}
          mr={2}
          src={getModelProvider(selectedModel.provider)?.avatar || HUGGING_FACE_ICON}
          w={avatarSize}
          fallbackSrc={HUGGING_FACE_ICON}
        />
        <ModelOptionLabel
          name={selectedModel.name}
          noOfLines={noOfLines}
          showTestModeTip={false}
          showMultimodalTip={false}
        />
      </Flex>
    );
  }, [
    isDeletedModel,
    value,
    selectedUnset,
    unsetLabel,
    t,
    selectedModel,
    needDetail,
    detailLoading,
    getModelProvider,
    avatarSize,
    noOfLines
  ]);

  return (
    <Box
      position={'relative'}
      css={{
        span: {
          display: 'block'
        }
      }}
    >
      <MyTooltip label={disableTip}>
        <MySelect
          className="nowheel"
          isDisabled={!!disableTip}
          list={options}
          isSearch
          onSearchChange={(keyword) => {
            searchRef.current = keyword;
            setSearch(keyword);
            onDebouncedSearch();
          }}
          ScrollData={ScrollData}
          isLoading={isLoading}
          value={value}
          valueLabel={valueLabel}
          placeholder={isLoading ? t('common:model_loading') : t('common:not_model_config')}
          h={'40px'}
          whiteSpace={'nowrap'}
          customOnOpen={() => {
            fetchData({ init: true, silent: true });
            customOnOpen?.();
          }}
          customOnClose={() => {
            if (search) {
              searchRef.current = '';
              setSearch('');
              fetchData({ init: true, silent: true });
            }
            customOnClose?.();
          }}
          {...selectProps}
          onChange={(e) => {
            const modelData = loadedModels.find((model) => model.id === e);
            return onChange?.(e, modelData);
          }}
        />
      </MyTooltip>
      <SelectorActiveModelTags model={selectedModel} />
    </Box>
  );
};

export default AIModelSelector;
