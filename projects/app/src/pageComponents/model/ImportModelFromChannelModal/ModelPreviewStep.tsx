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
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { AIModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import type { ModelProviderItemType } from '@fastgpt/global/core/ai/model/provider';
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
import StepModal from './StepModal';
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
type PreviewModelData = AIModelDocumentDataType | ModelConfigListItem | undefined;
type RowSelection = {
  selected?: boolean;
  presetKey?: string;
  modelType?: ModelTypeEnum;
  isActive?: boolean;
};
type RowCatalog = {
  availableTemplates: AIModelDocumentDataType[];
  templateMap: Map<string, AIModelDocumentDataType>;
  providerById: Map<string, ModelProviderItemType>;
  installedModelById: Map<string, ModelConfigListItem>;
  availableTypes: { value: ModelTypeEnum; label: string }[];
  createModelData: (type: ModelTypeEnum) => AIModelDocumentDataType;
  channel?: ModelChannelSummary;
  templateLoading: boolean;
};

const noPreviewItems: ImportPreviewRow[] = [];
const blankTemplateValue = '__blank__';
const getTemplateKey = ({ type, model }: { type: ModelTypeEnum; model: string }) =>
  [type, model].join(':');
const getCurrentModelKey = (modelId: string) => `__current__:${modelId}`;
const getDefaultPresetKey = (item: ImportPreviewItem) => {
  if (item.category === 'blank') return blankTemplateValue;
  if (item.category === 'template') return getTemplateKey(item.template);
  return getCurrentModelKey(item.modelId);
};
const isCurrentModelSelection = (item: ImportPreviewItem, key: string) =>
  'modelId' in item && key === getCurrentModelKey(item.modelId);
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
const getModelDisplayLabel = (modelData: AIModelDocumentDataType | ModelConfigListItem) =>
  modelData.name?.trim() ?? '';
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
  const draft =
    item.category === 'blank' || item.category === 'template'
      ? getBlankChannelImportDraft(item)
      : undefined;
  return buildBlankChannelModelData({
    providerModelSlug: row.providerModelSlug,
    modelType,
    modelData: draft?.modelData,
    contextLength: row.contextLength ?? draft?.contextLength,
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
  catalog: Pick<RowCatalog, 'installedModelById' | 'templateMap'>;
}) => {
  const item = getChannelImportCandidate(row);
  const candidateModelData =
    item.category === 'template'
      ? item.modelData
      : 'modelId' in item
        ? catalog.installedModelById.get(item.modelId)
        : undefined;
  const presetKey = selection?.presetKey ?? getDefaultPresetKey(item);
  const selectedPresetData =
    isCurrentModelSelection(item, presetKey) && 'modelId' in item
      ? catalog.installedModelById.get(item.modelId)
      : getTemplateDataForKey({ item, key: presetKey, templateMap: catalog.templateMap });
  const modelType = (() => {
    if (selection?.modelType) return selection.modelType;
    if (presetKey !== blankTemplateValue) return selectedPresetData?.type;
    if (item.category === 'blank' || item.category === 'template') {
      return getBlankChannelImportDraft(item).modelType;
    }
    return candidateModelData?.type;
  })();
  const isActive = (() => {
    if (selection?.isActive !== undefined) return selection.isActive;
    if (item.category === 'associated' && isCurrentModelSelection(item, presetKey)) {
      return Boolean(
        candidateModelData && 'isActive' in candidateModelData && candidateModelData.isActive
      );
    }
    return true;
  })();

  return { item, candidateModelData, presetKey, selectedPresetData, modelType, isActive };
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
      icon="core/chat/sendLight"
      tip={t('config_model:model.test_model')}
      aria-label={t('config_model:model.test_model')}
      aria-disabled={!target}
      isLoading={testingChannelIds.has(channelId)}
      pointerEvents={!target ? 'none' : undefined}
      opacity={!target ? 0.5 : undefined}
      onClick={() => void testModelChannel(channelId)}
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
  onModelTypeChange: (
    slug: string,
    selectedType: ModelTypeEnum,
    selectedPresetData: PreviewModelData
  ) => void;
  onPresetChange: (slug: string, selectedKey: string, selectedPresetData: PreviewModelData) => void;
  onActiveChange: (slug: string, isActive: boolean) => void;
}) {
  const { t } = useSafeTranslation();
  const {
    item,
    candidateModelData,
    presetKey: selectedPresetKey,
    selectedPresetData,
    modelType,
    isActive: rowIsActive
  } = resolveRowSelection({ row, selection, catalog });
  const isBlank = selectedPresetKey === blankTemplateValue;
  const templateOptions = [...catalog.availableTemplates];
  if (
    item.category === 'template' &&
    !templateOptions.some((template) => getTemplateKey(template) === getTemplateKey(item.template))
  ) {
    templateOptions.unshift(item.modelData);
  }
  const templateSelectOptions = [
    {
      value: blankTemplateValue,
      label: t('config_model:channel_import_blank_template')
    },
    ...('modelId' in item &&
    candidateModelData &&
    (!modelType || candidateModelData.type === modelType)
      ? [
          {
            value: getCurrentModelKey(item.modelId),
            label: getModelDisplayLabel(candidateModelData),
            icon: catalog.providerById.get(candidateModelData.provider)?.avatar
          }
        ]
      : []),
    ...templateOptions
      .filter((template) => !modelType || template.type === modelType)
      .map((template) => ({
        value: getTemplateKey(template),
        label: getModelDisplayLabel(template),
        icon: catalog.providerById.get(template.provider)?.avatar
      }))
  ];
  const candidateAvatar = candidateModelData
    ? catalog.providerById.get(candidateModelData.provider)?.avatar
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
    <Tr h="64.5px">
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
          <Box color="myGray.900" fontWeight="500" noOfLines={1} minW={0}>
            {row.providerModelSlug}
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
            onModelTypeChange(row.providerModelSlug, selectedType, selectedPresetData)
          }
        />
      </Td>
      <Td>
        <MySelect
          size="sm"
          h="32px"
          width="100%"
          value={selectedPresetKey}
          list={templateSelectOptions}
          placeholder={t('config_model:select_model_template')}
          isSearch
          isDisabled={catalog.templateLoading}
          aria-label={t('config_model:channel_import_preset_template')}
          onChange={(selectedKey) => {
            if (selectedKey === selectedPresetKey) return;
            const nextPresetData = isCurrentModelSelection(item, selectedKey)
              ? candidateModelData
              : getTemplateDataForKey({
                  item,
                  key: selectedKey,
                  templateMap: catalog.templateMap
                });
            onPresetChange(row.providerModelSlug, selectedKey, nextPresetData);
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
  isOpen,
  channelId,
  channel,
  installedModels,
  providers,
  createModelData,
  onSubmit,
  onPrevious,
  onClose
}: {
  isOpen: boolean;
  channelId: number;
  channel?: ModelChannelSummary;
  installedModels: ModelConfigListItem[];
  providers: ModelProviderItemType[];
  createModelData: (type: ModelTypeEnum) => AIModelDocumentDataType;
  onSubmit: (plan: ChannelImportPlan) => void;
  onPrevious: () => void;
  onClose: () => void;
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
  const installedModelById = useMemo(
    () => new Map(installedModels.map((model) => [model.modelId, model] as const)),
    [installedModels]
  );
  const providerById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider] as const)),
    [providers]
  );
  const availableTemplates = useMemo(
    () => state.templates.filter((template) => !installedModelNames.has(template.model)),
    [installedModelNames, state.templates]
  );
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
      installedModelById,
      availableTypes,
      createModelData,
      channel,
      templateLoading: state.templateLoading
    }),
    [
      availableTemplates,
      templateMap,
      providerById,
      installedModelById,
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
  const previewItems = state.items ?? noPreviewItems;
  const filteredPreviewItems = useMemo(
    () =>
      filterChannelImportPreviewItems({
        items: previewItems,
        modelType: state.modelTypeFilter,
        search: state.search,
        installedModels
      }),
    [installedModels, previewItems, state.modelTypeFilter, state.search]
  );
  const selectedItems = useMemo(
    () => previewItems.filter((item) => state.rowSelections.get(item.providerModelSlug)?.selected),
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
    (
      providerModelSlug: string,
      selectedType: ModelTypeEnum,
      selectedPresetData: PreviewModelData
    ) => {
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
    (providerModelSlug: string, selectedKey: string, selectedPresetData: PreviewModelData) => {
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
    const view = resolveRowSelection({
      row,
      selection: state.rowSelections.get(row.providerModelSlug),
      catalog
    });
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
      const { item, presetKey, modelType, isActive } = resolveRowSelection({
        row,
        selection: state.rowSelections.get(row.providerModelSlug),
        catalog
      });
      const category: ImportPreviewItem['category'] =
        presetKey === blankTemplateValue
          ? 'blank'
          : 'modelId' in item && presetKey === getCurrentModelKey(item.modelId)
            ? item.category
            : 'template';

      if (presetKey === blankTemplateValue) {
        const modelData = buildBlankModelData({ row, item, modelType, createModelData })!;
        const operation = buildChannelImportOperation({
          providerModelSlug: row.providerModelSlug,
          item: { category: 'blank' },
          modelData,
          isActive
        })!;
        return { providerModelSlug: row.providerModelSlug, category, operation };
      }

      const templateData = getTemplateDataForKey({ item, key: presetKey, templateMap });
      const operation = buildChannelImportOperation({
        providerModelSlug: row.providerModelSlug,
        item,
        templateData,
        contextLength: row.contextLength,
        maxCompletionTokens: row.maxCompletionTokens,
        isActive
      });
      return { providerModelSlug: row.providerModelSlug, category, operation };
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
    <StepModal
      isOpen={isOpen}
      title={t('config_model:channel_import_plan_step')}
      onClose={onClose}
      footer={
        <>
          <Button variant="whiteBase" onClick={onClose}>
            {t('common:Cancel')}
          </Button>
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
        <Flex alignItems="center" gap={3} flexShrink={0}>
          <Box fontWeight="500">{t('config_model:channel_import_channel')}</Box>
          <Box color="myGray.700">{channel?.name}</Box>
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
              {getErrText(state.loadError, t('config_model:channel_import_load_error'))}
            </Box>
            <Button size="sm" variant="whiteBase" onClick={retryPreview}>
              {t('config_model:channel_import_retry')}
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
              <Flex alignItems="center" gap={2} flexShrink={0}>
                <Box w="240px">
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
              </Flex>
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
    </StepModal>
  );
};

export default ModelPreviewStep;
