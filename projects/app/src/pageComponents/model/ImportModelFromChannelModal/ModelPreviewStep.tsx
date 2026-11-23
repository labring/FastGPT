import {
  Box,
  Button,
  Checkbox,
  Flex,
  Spinner,
  Switch,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { AIModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import {
  defaultProvider,
  type ModelProviderItemType
} from '@fastgpt/global/core/ai/model/provider';
import type {
  ImportPreviewItem,
  ModelChannelSummary,
  ModelConfigListItem
} from '@fastgpt/global/openapi/core/ai/model/api';
import Avatar from '@fastgpt/web/components/common/Avatar';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { FixedTableLayout } from '@fastgpt/web/components/common/FixedTable';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MultipleRowSelect from '@fastgpt/web/components/common/MySelect/MultipleRowSelect';
import type { ListItemType } from '@fastgpt/web/components/common/MySelect/type';
import { SingleSelectFilter } from '@fastgpt/web/components/common/TagFilter';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useStaticVirtualList } from '@fastgpt/web/hooks/useVirtualList';
import { enableMapSet, produce, type Draft } from 'immer';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getImportPreviewFromChannel, getModelTemplates } from '@/web/core/ai/model/api';
import {
  buildBlankChannelModelData,
  buildChannelImportOperation,
  filterChannelImportPreviewItems,
  getBlankChannelImportDraft,
  getChannelImportCandidate
} from '../channelImport';
import { useModelChannelTest } from '../useModelChannelTest';
import StepContent from './StepContent';
import type { ChannelImportPlan, ChannelImportPlanRow, ImportPreviewRow } from './types';

enableMapSet();

type PreviewState = {
  items: ImportPreviewRow[] | undefined;
  loading: boolean;
  loadError: unknown;
  templates: AIModelDocumentDataType[];
  templateLoading: boolean;
  templateError: unknown;
  rowSelections: Map<string, RowSelection>;
  modelTypeFilter: ModelTypeEnum | '';
  search: string;
};

type ImportModelTestTarget = Parameters<typeof useModelChannelTest>[0]['target'];
type PreviewModelData = AIModelDocumentDataType | undefined;
type RowSelection = {
  selected?: boolean;
  presetKey?: string;
  modelType?: ModelTypeEnum;
  isActive?: boolean;
};
/** Catalog 不支持是能力限制而非临时故障，展示返回入口而不是让用户重复请求。 */
export const isUnsupportedChannelCatalogError = (error: unknown) =>
  Boolean(
    error &&
    typeof error === 'object' &&
    'statusText' in error &&
    (error as { statusText?: unknown }).statusText === ModelErrEnum.channelCatalogUnsupported
  );
type RowCatalog = {
  availableTemplates: AIModelDocumentDataType[];
  templateMap: Map<string, AIModelDocumentDataType>;
  providerById: Map<string, ModelProviderItemType>;
  availableTypes: { value: ModelTypeEnum; label: string }[];
  createModelData: (type: ModelTypeEnum) => AIModelDocumentDataType;
  channel?: ModelChannelSummary;
  templateLoading: boolean;
};

const noPreviewItems: ImportPreviewRow[] = [];
const blankTemplateValue = '__blank__';
const getTemplateProviderKey = (providerId: string) => `provider:${providerId}`;
const getTemplateKey = ({ type, model }: { type: ModelTypeEnum; model: string }) =>
  [type, model].join(':');
const getTemplateDataForKey = ({
  item,
  key,
  templateMap
}: {
  item: ImportPreviewItem;
  key: string;
  templateMap: Map<string, AIModelDocumentDataType>;
}) => {
  if (key === blankTemplateValue) return;
  if (item.category === 'template' && key === getTemplateKey(item.template)) return item.modelData;
  return templateMap.get(key);
};
const buildBlankModelData = ({
  row,
  item,
  modelType,
  createModelData
}: {
  row: ImportPreviewRow;
  item: ImportPreviewItem;
  modelType?: ModelTypeEnum;
  createModelData: (type: ModelTypeEnum) => AIModelDocumentDataType;
}) => {
  const draft = getBlankChannelImportDraft(item);
  return buildBlankChannelModelData({
    providerModelSlug: row.providerModelSlug,
    modelType,
    modelData: draft.modelData,
    contextLength: row.contextLength ?? draft.contextLength,
    maxCompletionTokens: row.maxCompletionTokens,
    createModelData
  });
};

/** 统一解析行内显示和提交所需的选择，避免两条路径使用不同默认值。 */
export const resolveRowSelection = ({
  row,
  selection,
  catalog
}: {
  row: ImportPreviewRow;
  selection?: RowSelection;
  catalog: Pick<RowCatalog, 'templateMap'>;
}) => {
  const item = getChannelImportCandidate(row);
  const presetKey =
    selection?.presetKey ??
    (item.category === 'template' ? getTemplateKey(item.template) : blankTemplateValue);
  const selectedPresetData = getTemplateDataForKey({
    item,
    key: presetKey,
    templateMap: catalog.templateMap
  });
  const modelType =
    selection?.modelType ??
    (presetKey === blankTemplateValue
      ? getBlankChannelImportDraft(item).modelType
      : selectedPresetData?.type);

  return {
    item,
    presetKey,
    selectedPresetData,
    modelType,
    isActive: selection?.isActive ?? true
  };
};

/** 复用所选配置，并在渠道别名写入前用上游模型 ID 测试。 */
export const resolveModelTestTarget = ({
  row,
  item,
  presetKey,
  selectedPresetData,
  modelType,
  catalog
}: {
  row: ImportPreviewRow;
  item: ImportPreviewItem;
  presetKey: string;
  selectedPresetData: PreviewModelData;
  modelType?: ModelTypeEnum;
  catalog: Pick<RowCatalog, 'createModelData'>;
}): ImportModelTestTarget => {
  const modelData =
    presetKey === blankTemplateValue
      ? buildBlankModelData({ row, item, modelType, createModelData: catalog.createModelData })
      : selectedPresetData;
  return modelData
    ? {
        source: 'draft',
        getModelData: () => ({ ...modelData, model: row.providerModelSlug })
      }
    : undefined;
};

const ImportModelTestButton = ({
  target,
  channelId,
  channelName
}: {
  target: ImportModelTestTarget;
  channelId: number;
  channelName: string;
}) => {
  const { t } = useSafeTranslation();
  const { testingChannelIds, testModelChannel } = useModelChannelTest({
    target,
    channels: [{ id: channelId, name: channelName }],
    channelType: 'system'
  });

  return (
    <MyIconButton
      as="button"
      icon="core/chat/sendLight"
      tip={t('config_model:model.test_model')}
      aria-label={t('config_model:model.test_model')}
      aria-disabled={!target}
      isLoading={testingChannelIds.has(channelId)}
      pointerEvents={!target ? 'none' : undefined}
      opacity={!target ? 0.5 : undefined}
      onClick={() => {
        if (target) void testModelChannel(channelId);
      }}
    />
  );
};

const ModelPreviewRow = memo(function ModelPreviewRow({
  row,
  selection,
  catalog,
  onToggleSelected,
  onModelTypeChange,
  onPresetChange,
  onActiveChange
}: {
  row: ImportPreviewRow;
  selection?: RowSelection;
  catalog: RowCatalog;
  onToggleSelected: (slug: string) => void;
  onModelTypeChange: (params: {
    providerModelSlug: string;
    selectedType: ModelTypeEnum;
    selectedPresetData: PreviewModelData;
  }) => void;
  onPresetChange: (params: {
    providerModelSlug: string;
    selectedKey: string;
    selectedPresetData: PreviewModelData;
  }) => void;
  onActiveChange: (slug: string, isActive: boolean) => void;
}) {
  const { t } = useSafeTranslation();
  const {
    item,
    presetKey: selectedPresetKey,
    selectedPresetData,
    modelType,
    isActive: rowIsActive
  } = resolveRowSelection({ row, selection, catalog });
  const isBlank = selectedPresetKey === blankTemplateValue;
  const blankTemplateLabel = t('config_model:channel_import_blank_template');
  const templateGroups = (() => {
    const templates =
      item.category === 'template' && !catalog.templateMap.has(getTemplateKey(item.template))
        ? [item.modelData, ...catalog.availableTemplates]
        : catalog.availableTemplates;
    const groups = new Map<string, ListItemType[]>();

    for (const template of templates) {
      if (modelType && template.type !== modelType) continue;

      const option = { value: getTemplateKey(template), label: template.name };
      const group = groups.get(template.provider);
      if (group) group.push(option);
      else groups.set(template.provider, [option]);
    }

    return [...groups]
      .sort(
        ([left], [right]) =>
          (catalog.providerById.get(left)?.order ?? defaultProvider.order) -
          (catalog.providerById.get(right)?.order ?? defaultProvider.order)
      )
      .map(([providerId, children]) => {
        const provider = catalog.providerById.get(providerId);
        return {
          value: getTemplateProviderKey(providerId),
          label: (
            <Flex alignItems="center" gap={2}>
              <Avatar w="1rem" src={provider?.avatar || defaultProvider.avatar} />
              <Box>{provider?.name ?? providerId}</Box>
            </Flex>
          ),
          children
        };
      });
  })();
  const candidateProvider = item.modelData?.provider;
  const candidateAvatar = candidateProvider
    ? catalog.providerById.get(candidateProvider)?.avatar
    : undefined;
  const modelTestTarget = resolveModelTestTarget({
    row,
    item,
    presetKey: selectedPresetKey,
    selectedPresetData,
    modelType,
    catalog
  });

  return (
    <Tr
      h="64.5px"
      cursor="pointer"
      onClick={(event) => {
        const target = event.target;
        if (
          !(target instanceof Element) ||
          target.closest('button, label, input, select, [role="menu"]')
        )
          return;
        onToggleSelected(row.providerModelSlug);
      }}
    >
      <Td px={3}>
        <Checkbox
          isChecked={selection?.selected ?? false}
          aria-label={t('config_model:channel_import_model') + ' ' + row.providerModelSlug}
          onChange={() => onToggleSelected(row.providerModelSlug)}
        />
      </Td>
      <Td fontSize="sm">
        <Flex alignItems="center" gap={2} minW={0}>
          <Avatar src={candidateAvatar} w="1.2rem" borderRadius="50%" />
          <Box minW={0}>
            <Box color="myGray.900" fontWeight="500" noOfLines={1}>
              {row.providerModelSlug}
            </Box>
          </Box>
        </Flex>
      </Td>
      <Td>
        <MySelect
          size="sm"
          h="32px"
          width="100%"
          value={modelType}
          list={catalog.availableTypes}
          placeholder={t('config_model:channel_import_select_type')}
          isInvalid={selection?.selected && isBlank && !modelType}
          aria-label={t('common:model.model_type')}
          onChange={(selectedType) =>
            onModelTypeChange({
              providerModelSlug: row.providerModelSlug,
              selectedType,
              selectedPresetData
            })
          }
        />
      </Td>
      <Td>
        <MultipleRowSelect
          label={
            selectedPresetData ? (
              <Flex alignItems="center" gap={2} minW={0} mr={2}>
                <Avatar
                  w="1rem"
                  flexShrink={0}
                  src={
                    catalog.providerById.get(selectedPresetData.provider)?.avatar ||
                    defaultProvider.avatar
                  }
                />
                <Box flex="1 1 auto" minW={0} isTruncated>
                  {selectedPresetData.name}
                </Box>
              </Flex>
            ) : isBlank ? (
              blankTemplateLabel
            ) : undefined
          }
          value={
            selectedPresetData
              ? [getTemplateProviderKey(selectedPresetData.provider), selectedPresetKey]
              : [templateGroups[0]?.value ?? blankTemplateValue]
          }
          list={[{ value: blankTemplateValue, label: blankTemplateLabel }, ...templateGroups]}
          placeholder={t('config_model:select_model_template')}
          rowMinWidth="160px"
          isSearch
          allowDeselect={false}
          ButtonProps={{
            size: 'sm',
            h: '32px',
            width: '100%',
            isDisabled: catalog.templateLoading,
            'aria-label': t('config_model:channel_import_preset_template')
          }}
          onSelect={([providerId, templateKey]) => {
            const selectedKey =
              providerId === blankTemplateValue ? blankTemplateValue : templateKey;
            if (typeof selectedKey !== 'string' || selectedKey === selectedPresetKey) return;
            const nextPresetData = getTemplateDataForKey({
              item,
              key: selectedKey,
              templateMap: catalog.templateMap
            });
            onPresetChange({
              providerModelSlug: row.providerModelSlug,
              selectedKey,
              selectedPresetData: nextPresetData
            });
          }}
        />
      </Td>
      <Td>
        <Switch
          size="sm"
          colorScheme="myBlue"
          isChecked={rowIsActive}
          aria-label={`${t('config_model:model.active')} ${row.providerModelSlug}`}
          onChange={(event) => onActiveChange(row.providerModelSlug, event.target.checked)}
        />
      </Td>
      <Td>
        {catalog.channel && (
          <ImportModelTestButton
            target={modelTestTarget}
            channelId={catalog.channel.id}
            channelName={catalog.channel.name}
          />
        )}
      </Td>
    </Tr>
  );
});

const ModelPreviewStep = ({
  channelId,
  channel,
  installedModels,
  providers,
  createModelData,
  onSubmit,
  onPrevious
}: {
  channelId: number;
  channel?: ModelChannelSummary;
  installedModels: ModelConfigListItem[];
  providers: ModelProviderItemType[];
  createModelData: (type: ModelTypeEnum) => AIModelDocumentDataType;
  onSubmit: (plan: ChannelImportPlan) => void;
  onPrevious: () => void;
}) => {
  const { t } = useSafeTranslation();
  const [state, setState] = useState<PreviewState>(() => ({
    items: undefined,
    loading: false,
    loadError: undefined,
    templates: [],
    templateLoading: false,
    templateError: undefined,
    rowSelections: new Map(),
    modelTypeFilter: '',
    search: ''
  }));
  const previewRequestId = useRef(0);
  const updateState = useCallback(
    (recipe: (draft: Draft<PreviewState>) => void) =>
      setState((current) => produce(current, recipe)),
    []
  );

  const loadPreview = useCallback(async () => {
    const requestId = ++previewRequestId.current;
    const isCurrentRequest = () => requestId === previewRequestId.current;

    updateState((draft) => {
      draft.items = undefined;
      draft.loading = true;
      draft.loadError = undefined;
      draft.templates = [];
      draft.templateError = undefined;
      draft.templateLoading = false;
    });

    try {
      const preview = await getImportPreviewFromChannel({ channelId, channelType: 'system' });
      if (!isCurrentRequest()) return;
      updateState((draft) => {
        draft.items = preview.items;
      });

      if (preview.items.length > 0) {
        updateState((draft) => {
          draft.templateLoading = true;
        });
        try {
          const templateResponse = await getModelTemplates({ channelType: 'system' });
          if (isCurrentRequest()) {
            updateState((draft) => {
              draft.templates = templateResponse.models;
            });
          }
        } catch (error) {
          if (isCurrentRequest()) {
            updateState((draft) => {
              draft.templateError = error;
            });
          }
        } finally {
          if (isCurrentRequest()) {
            updateState((draft) => {
              draft.templateLoading = false;
            });
          }
        }
      }
    } catch (error) {
      if (isCurrentRequest()) {
        updateState((draft) => {
          draft.loadError = error;
        });
      }
    } finally {
      if (isCurrentRequest()) {
        updateState((draft) => {
          draft.loading = false;
        });
      }
    }
  }, [channelId, updateState]);

  useEffect(() => {
    void loadPreview();
    return () => {
      previewRequestId.current += 1;
    };
  }, [loadPreview]);

  const installedModelNames = useMemo(
    () => new Set(installedModels.map((model) => model.model)),
    [installedModels]
  );
  const providerById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider] as const)),
    [providers]
  );
  const availableTemplates = state.templates;
  const templateMap = useMemo(
    () =>
      new Map(availableTemplates.map((template) => [getTemplateKey(template), template] as const)),
    [availableTemplates]
  );
  const availableTypes = useMemo(
    () => [
      { value: ModelTypeEnum.llm, label: t('common:model.type.chat') },
      { value: ModelTypeEnum.embedding, label: t('common:model.type.embedding') },
      { value: ModelTypeEnum.tts, label: t('common:model.type.tts') },
      { value: ModelTypeEnum.stt, label: t('common:model.type.stt') },
      { value: ModelTypeEnum.rerank, label: t('common:model.type.reRank') }
    ],
    [t]
  );
  const catalog = useMemo<RowCatalog>(
    () => ({
      availableTemplates,
      templateMap,
      providerById,
      availableTypes,
      createModelData,
      channel,
      templateLoading: state.templateLoading
    }),
    [
      availableTemplates,
      templateMap,
      providerById,
      availableTypes,
      createModelData,
      channel,
      state.templateLoading
    ]
  );
  const modelTypeFilterOptions = useMemo(
    () => [{ label: t('common:All'), value: '' as const }, ...availableTypes],
    [availableTypes, t]
  );
  const previewItems = useMemo(
    () =>
      state.items?.filter((row) => !installedModelNames.has(row.providerModelSlug)) ??
      noPreviewItems,
    [state.items, installedModelNames]
  );
  const resolveSelection = useCallback(
    (row: ImportPreviewRow) =>
      resolveRowSelection({
        row,
        selection: state.rowSelections.get(row.providerModelSlug),
        catalog
      }),
    [catalog, state.rowSelections]
  );
  const filteredPreviewItems = useMemo(
    () =>
      filterChannelImportPreviewItems({
        items: previewItems,
        modelType: state.modelTypeFilter,
        search: state.search,
        getModelType: (row) => resolveSelection(row).modelType
      }),
    [previewItems, resolveSelection, state.modelTypeFilter, state.search]
  );
  const selectedItems = useMemo(
    () => previewItems.filter((row) => state.rowSelections.get(row.providerModelSlug)?.selected),
    [previewItems, state.rowSelections]
  );

  const resetPreviewSelections = () => {
    updateState((draft) => {
      draft.rowSelections.clear();
    });
  };

  const retryPreview = () => {
    resetPreviewSelections();
    void loadPreview();
  };

  const toggleSelected = useCallback(
    (providerModelSlug: string) => {
      updateState((draft) => {
        const current = draft.rowSelections.get(providerModelSlug);
        draft.rowSelections.set(providerModelSlug, {
          ...current,
          selected: !current?.selected
        });
      });
    },
    [updateState]
  );

  const handleModelTypeChange = useCallback(
    ({
      providerModelSlug,
      selectedType,
      selectedPresetData
    }: {
      providerModelSlug: string;
      selectedType: ModelTypeEnum;
      selectedPresetData: PreviewModelData;
    }) => {
      updateState((draft) => {
        const current = draft.rowSelections.get(providerModelSlug);
        if (selectedPresetData && selectedPresetData.type !== selectedType) {
          draft.rowSelections.set(providerModelSlug, {
            ...current,
            presetKey: blankTemplateValue,
            modelType: selectedType
          });
        } else {
          draft.rowSelections.set(providerModelSlug, { ...current, modelType: selectedType });
        }
      });
    },
    [updateState]
  );

  const handlePresetChange = useCallback(
    ({
      providerModelSlug,
      selectedKey,
      selectedPresetData
    }: {
      providerModelSlug: string;
      selectedKey: string;
      selectedPresetData: PreviewModelData;
    }) => {
      updateState((draft) => {
        draft.rowSelections.set(providerModelSlug, {
          ...draft.rowSelections.get(providerModelSlug),
          presetKey: selectedKey,
          ...(selectedPresetData ? { modelType: selectedPresetData.type } : {})
        });
      });
    },
    [updateState]
  );

  const handleActiveChange = useCallback(
    (providerModelSlug: string, isActive: boolean) => {
      updateState((draft) => {
        draft.rowSelections.set(providerModelSlug, {
          ...draft.rowSelections.get(providerModelSlug),
          isActive
        });
      });
    },
    [updateState]
  );

  const selectedRowsNeedBlankFields = selectedItems.some((row) => {
    const view = resolveSelection(row);
    return view.presetKey === blankTemplateValue && !view.modelType;
  });

  const submitPlan = () => {
    if (
      state.loading ||
      state.templateLoading ||
      selectedItems.length === 0 ||
      selectedRowsNeedBlankFields
    ) {
      return;
    }

    const rows: ChannelImportPlanRow[] = selectedItems.map((row) => {
      const { item, presetKey, modelType, isActive } = resolveSelection(row);
      const operation =
        presetKey === blankTemplateValue
          ? buildChannelImportOperation({
              providerModelSlug: row.providerModelSlug,
              modelData: buildBlankModelData({ row, item, modelType, createModelData }),
              isActive
            })
          : buildChannelImportOperation({
              providerModelSlug: row.providerModelSlug,
              templateData: getTemplateDataForKey({ item, key: presetKey, templateMap }),
              contextLength: row.contextLength,
              maxCompletionTokens: row.maxCompletionTokens,
              isActive
            });
      return { providerModelSlug: row.providerModelSlug, operation };
    });

    onSubmit({ rows });
  };

  const {
    containerRef,
    virtualDataList,
    topPlaceholderHeight,
    bottomPlaceholderHeight,
    scrollToTop
  } = useStaticVirtualList({
    data: filteredPreviewItems,
    itemHeight: 64.5,
    overscan: 8
  });

  useEffect(() => {
    scrollToTop();
  }, [scrollToTop, state.modelTypeFilter, state.search]);

  return (
    <StepContent
      footer={
        <>
          <Box mr="auto" color="myGray.600" fontSize="sm" aria-live="polite">
            {t('config_model:channel_import_selected_count', { count: selectedItems.length })}
          </Box>
          <Button variant="whiteBase" onClick={onPrevious}>
            {t('config_model:previous_step')}
          </Button>
          <Button
            onClick={submitPlan}
            isDisabled={
              state.loading ||
              state.templateLoading ||
              selectedItems.length === 0 ||
              selectedRowsNeedBlankFields
            }
          >
            {t('config_model:next_step')}
          </Button>
        </>
      }
    >
      <Flex direction="column" h="100%" minH={0} minW={0} gap={4}>
        <Flex alignItems="center" gap={2} flexShrink={0}>
          <Box w="240px" minW={0}>
            <SearchInput
              bg="white"
              value={state.search}
              onChange={(event) =>
                updateState((draft) => {
                  draft.search = event.target.value;
                })
              }
              placeholder={t('common:model.search_name_placeholder')}
            />
          </Box>
          <SingleSelectFilter
            title={t('common:model.model_type')}
            value={state.modelTypeFilter}
            options={modelTypeFilterOptions}
            onChange={(modelTypeFilter) =>
              updateState((draft) => {
                draft.modelTypeFilter = modelTypeFilter;
              })
            }
          />
          <Flex ml="auto" alignItems="center" gap={2} minW={0}>
            <Box fontWeight="500" flexShrink={0}>
              {t('config_model:channel_import_channel')}
            </Box>
            <Box color="myGray.700" isTruncated title={channel?.name}>
              {channel?.name}
            </Box>
          </Flex>
        </Flex>

        {state.loading ? (
          <Flex flex="1 1 0" minH={0} alignItems="center" justifyContent="center" gap={3}>
            <Spinner size="sm" />
          </Flex>
        ) : state.loadError ? (
          <Flex
            flex="1 1 0"
            minH={0}
            alignItems="center"
            justifyContent="center"
            direction="column"
            gap={3}
          >
            <Box color="red.500">
              {isUnsupportedChannelCatalogError(state.loadError)
                ? t('config_model:channel_import_unsupported')
                : getErrText(state.loadError, t('config_model:channel_import_load_error'))}
            </Box>
            <Button
              size="sm"
              variant="whiteBase"
              onClick={
                isUnsupportedChannelCatalogError(state.loadError) ? onPrevious : retryPreview
              }
            >
              {isUnsupportedChannelCatalogError(state.loadError)
                ? t('common:back')
                : t('config_model:channel_import_retry')}
            </Button>
          </Flex>
        ) : previewItems.length === 0 ? (
          <Flex flex="1 1 0" minH={0} alignItems="center" justifyContent="center">
            <EmptyTip text={t('config_model:channel_import_empty')} />
          </Flex>
        ) : (
          <>
            {state.templateError && (
              <Flex alignItems="center" gap={2} color="red.500" fontSize="sm">
                <Box>
                  {getErrText(
                    state.templateError,
                    t('config_model:channel_import_template_load_error')
                  )}
                </Box>
                <Button size="xs" variant="whiteBase" onClick={retryPreview}>
                  {t('config_model:channel_import_retry')}
                </Button>
              </Flex>
            )}
            <Flex direction="column" flex="1 1 0" minH={0} minW={0} gap={3}>
              {filteredPreviewItems.length === 0 ? (
                <Flex flex="1 1 0" minH={0} alignItems="center" justifyContent="center">
                  <EmptyTip />
                </Flex>
              ) : (
                <FixedTableLayout
                  scrollMode="virtual"
                  bodyRef={containerRef}
                  rootProps={{ flex: '1 1 0', minH: 0, minW: 0, px: 0 }}
                  bodyProps={{
                    flex: '1 1 0',
                    minH: 0,
                    minW: 0,
                    overflowX: 'auto',
                    overflowY: 'auto'
                  }}
                  renderHeader={({ headerTableWidth }) => (
                    <Table minW="920px" sx={{ tableLayout: 'fixed', width: headerTableWidth }}>
                      <colgroup>
                        <col style={{ width: '48px' }} />
                        <col style={{ width: '300px' }} />
                        <col style={{ width: '152px' }} />
                        <col style={{ width: '292px' }} />
                        <col style={{ width: '64px' }} />
                        <col style={{ width: '64px' }} />
                      </colgroup>
                      <Thead>
                        <Tr>
                          <Th px={3}></Th>
                          <Th fontSize="xs">{t('config_model:channel_import_model')}</Th>
                          <Th fontSize="xs">{t('common:model.model_type')}</Th>
                          <Th fontSize="xs">{t('config_model:channel_import_preset_template')}</Th>
                          <Th fontSize="xs">{t('config_model:model.active')}</Th>
                          <Th fontSize="xs">{t('common:Operation')}</Th>
                        </Tr>
                      </Thead>
                    </Table>
                  )}
                  renderBody={({ headerTableWidth }) => (
                    <Table minW="920px" sx={{ tableLayout: 'fixed', width: headerTableWidth }}>
                      <colgroup>
                        <col style={{ width: '48px' }} />
                        <col style={{ width: '300px' }} />
                        <col style={{ width: '152px' }} />
                        <col style={{ width: '292px' }} />
                        <col style={{ width: '64px' }} />
                        <col style={{ width: '64px' }} />
                      </colgroup>
                      <Tbody>
                        {topPlaceholderHeight > 0 && (
                          <Tr h={topPlaceholderHeight + 'px'} aria-hidden>
                            <Td colSpan={6} h={topPlaceholderHeight + 'px'} p={0} border={0} />
                          </Tr>
                        )}
                        {virtualDataList.map(({ data: row }) => (
                          <ModelPreviewRow
                            key={row.providerModelSlug}
                            row={row}
                            selection={state.rowSelections.get(row.providerModelSlug)}
                            catalog={catalog}
                            onToggleSelected={toggleSelected}
                            onModelTypeChange={handleModelTypeChange}
                            onPresetChange={handlePresetChange}
                            onActiveChange={handleActiveChange}
                          />
                        ))}
                        {bottomPlaceholderHeight > 0 && (
                          <Tr h={bottomPlaceholderHeight + 'px'} aria-hidden>
                            <Td colSpan={6} h={bottomPlaceholderHeight + 'px'} p={0} border={0} />
                          </Tr>
                        )}
                      </Tbody>
                    </Table>
                  )}
                />
              )}
            </Flex>
          </>
        )}
      </Flex>
    </StepContent>
  );
};

export default ModelPreviewStep;
