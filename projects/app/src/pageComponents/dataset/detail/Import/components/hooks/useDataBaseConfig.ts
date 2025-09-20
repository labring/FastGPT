import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import type {
  UseFormGetValues,
  UseFormSetValue,
  UseFormWatch,
  UseFormReset
} from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  postGetDatabaseConfiguration,
  postDetectDatabaseChanges,
  postCreateDatabaseCollections,
  postUpdateDatasetCollectionConfigByDatabase
} from '@/web/core/dataset/api';
import type { DetectChangesResponse } from '@/web/core/dataset/temp.d';
import type {
  UIColumn,
  UITableData,
  TableInfo,
  CurrentTableFormData,
  TableChangeSummary,
  CurrentTableColumnChanges
} from './utils';
import {
  transformBackendToUI,
  transformChangesToUI,
  transformUIToBackend,
  getProblematicTableNames,
  StatusEnum
} from './utils';

interface FormMethods {
  getValues: UseFormGetValues<CurrentTableFormData>;
  setValue: UseFormSetValue<CurrentTableFormData>;
  watch: UseFormWatch<CurrentTableFormData>;
  reset: UseFormReset<CurrentTableFormData>;
}

export const useDataBaseConfig = (
  datasetId: string,
  isEditMode: boolean = false,
  formMethods: FormMethods
) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { getValues, setValue, watch, reset } = formMethods;

  const [uiTables, setUITables] = useState<UITableData[]>([]);
  const [currentTableIndex, setCurrentTableIndex] = useState(0);
  const [changesSummary, setChangesSummary] = useState<DetectChangesResponse['summary'] | null>(
    null
  );
  const [tableChangeSummary, setTableChangeSummary] = useState<TableChangeSummary>({
    modifiedTables: { count: 0, tableNames: [] },
    deletedTables: { count: 0, tableNames: [] },
    addedTables: { count: 0, tableNames: [] },
    hasChanges: false,
    hasBannerTip: false
  });

  // 监听表单数据变化
  const watchedCurrentTable = watch();

  // 获取当前表
  const currentTable = useMemo(() => {
    const data = uiTables[currentTableIndex];
    if (data?.hasOwnProperty('exist')) {
      return uiTables[currentTableIndex]?.exist ? uiTables[currentTableIndex] : null;
    }
    return uiTables[currentTableIndex] || null;
  }, [uiTables, currentTableIndex]);

  // 获取数据配置
  const { runAsync: getConfiguration, loading: getConfigLoading } = useRequest2(
    postGetDatabaseConfiguration
  );

  // 检测变更
  const { runAsync: detectChanges, loading: detectChangesLoading } =
    useRequest2(postDetectDatabaseChanges);

  // 创建数据库知识库数据集
  const { runAsync: createCollections, loading: isCreating } = useRequest2(
    postCreateDatabaseCollections,
    {
      onSuccess: () => {
        router.push(`/dataset/detail?datasetId=${datasetId}&forceUpdate=true`);
      }
    }
  );

  // 更新数据库配置
  const { runAsync: updateDatabaseConfig, loading: isUpdating } = useRequest2(
    postUpdateDatasetCollectionConfigByDatabase,
    {
      onSuccess: () => {
        router.push(`/dataset/detail?datasetId=${datasetId}`);
      },
      successToast: t('common:update_success')
    }
  );

  // 动态计算表信息
  const tableInfos = useMemo<TableInfo[]>(() => {
    return uiTables.map((table, index) => ({
      tableData: table,
      isCurrentTable: index === currentTableIndex
    }));
  }, [uiTables, currentTableIndex]);

  // 动态计算loading状态
  const loading = useMemo(() => {
    return getConfigLoading || detectChangesLoading;
  }, [getConfigLoading, detectChangesLoading]);

  // 动态计算提交按钮loading状态
  const isSubmitting = useMemo(() => {
    return isCreating || isUpdating;
  }, [isCreating, isUpdating]);

  // 动态计算存在问题的表名（表已勾选且表描述为空或列启用但描述为空）
  const problematicTableNames = useMemo(() => {
    return getProblematicTableNames(uiTables);
  }, [JSON.stringify(uiTables), uiTables]);

  // 计算当前表格的列变更信息
  const currentTableColumnChanges = useMemo<CurrentTableColumnChanges>(() => {
    if (!currentTable) {
      return {
        addedColumns: { count: 0, columnNames: [] },
        deletedColumns: { count: 0, columnNames: [] },
        hasColumnChanges: false
      };
    }

    const addedColumnNames: string[] = [];
    const deletedColumnNames: string[] = [];

    currentTable.columns.forEach((column) => {
      if (column.status === StatusEnum.add) {
        addedColumnNames.push(column.columnName);
      } else if (column.status === StatusEnum.delete) {
        deletedColumnNames.push(column.columnName);
      }
    });

    return {
      addedColumns: {
        count: addedColumnNames.length,
        columnNames: addedColumnNames
      },
      deletedColumns: {
        count: deletedColumnNames.length,
        columnNames: deletedColumnNames
      },
      hasColumnChanges: addedColumnNames.length > 0 || deletedColumnNames.length > 0
    };
  }, [currentTable]);

  // 同步当前表单数据到uiTables
  const syncCurrentTableToUITables = useCallback(() => {
    if (!currentTable) return;

    const formData = getValues();
    const updatedTables = [...uiTables];
    const newTableData = {
      ...currentTable,
      description: formData.description,
      columns: formData.columns
    };

    // 只有数据真正发生变化时才更新状态
    if (JSON.stringify(updatedTables[currentTableIndex]) !== JSON.stringify(newTableData)) {
      updatedTables[currentTableIndex] = newTableData as any;
      setUITables(updatedTables);
    }
  }, [currentTable, currentTableIndex, uiTables, getValues]);

  // 初始化数据
  useEffect(() => {
    const initData = async () => {
      try {
        let uiData: UITableData[] = [];

        if (isEditMode) {
          // 编辑模式：只检测变更
          const changesResult = await detectChanges({ datasetId });
          const changesUIData = transformChangesToUI(changesResult.tables);

          uiData = changesUIData.map((table) => ({
            ...table,
            // 新增表默认不勾选
            enabled: table.status === StatusEnum.add ? false : true,
            columns: table.columns.map((col) => ({
              ...col,
              // 新增列默认不启用
              enabled: col.status === StatusEnum.add ? false : col.enabled
            }))
          }));

          setChangesSummary(changesResult.summary);
          if (changesResult.hasChanges) {
            // 只有编辑模式才计算表格变更汇总信息并设置hasColumnChanges字段
            const modifiedTableNames: string[] = [];
            const deletedTableNames: string[] = [];
            const addedTableNames: string[] = [];

            uiData = uiData.map((table) => {
              // 检查是否有列变更
              const hasColumnChanges = table.columns.some(
                (col) => col.status === StatusEnum.add || col.status === StatusEnum.delete
              );

              if (table.status === StatusEnum.delete) {
                deletedTableNames.push(table.tableName);
              } else if (table.status === StatusEnum.add) {
                addedTableNames.push(table.tableName);
              } else if (hasColumnChanges) {
                modifiedTableNames.push(table.tableName);
              }

              return {
                ...table,
                hasColumnChanges
              };
            });

            setTableChangeSummary({
              modifiedTables: {
                count: modifiedTableNames.length,
                tableNames: modifiedTableNames
              },
              deletedTables: {
                count: deletedTableNames.length,
                tableNames: deletedTableNames
              },
              addedTables: {
                count: addedTableNames.length,
                tableNames: addedTableNames
              },
              hasChanges:
                modifiedTableNames.length > 0 ||
                deletedTableNames.length > 0 ||
                addedTableNames.length > 0,
              hasBannerTip: modifiedTableNames.length > 0 || deletedTableNames.length > 0
            });
          }
        } else {
          // 创建模式：获取数据配置
          const configResult = await getConfiguration({ datasetId });
          uiData = transformBackendToUI(configResult.tables);
          // 创建模式：设置默认的表格变更汇总信息
          setTableChangeSummary({
            modifiedTables: { count: 0, tableNames: [] },
            deletedTables: { count: 0, tableNames: [] },
            addedTables: { count: 0, tableNames: [] },
            hasChanges: false,
            hasBannerTip: false
          });
        }
        setUITables(uiData);

        // 检查地址栏中是否存在 databaseName 参数
        const urlParams = new URLSearchParams(window.location.search);
        const databaseName = urlParams.get('databaseName');

        let targetTableIndex = -1;

        if (databaseName) {
          // 查找匹配的表索引
          targetTableIndex = uiData.findIndex(
            (table) => table.tableName === databaseName && table.status !== StatusEnum.delete
          );
        }

        // 如果没有找到指定的表或没有 databaseName 参数，则找到第一个未删除的表作为默认选中
        if (targetTableIndex === -1) {
          targetTableIndex = uiData.findIndex((table) => table.status !== StatusEnum.delete);
        }

        setCurrentTableIndex(targetTableIndex >= 0 ? targetTableIndex : 0);

        // 初始化表单数据
        const targetTable = uiData[targetTableIndex >= 0 ? targetTableIndex : 0];
        if (targetTable) {
          reset({
            description: targetTable.description,
            columns: targetTable.columns.filter((col) => col.status !== StatusEnum.delete)
          });

          // 标记初始化完成
          isInitializedRef.current = true;
          lastSyncDataRef.current = JSON.stringify({
            description: targetTable.description,
            columns: targetTable.columns.filter((col) => col.status !== StatusEnum.delete)
          });
        }
      } catch (error) {
        console.error('init_data_failed', error);
      }
    };

    if (datasetId) {
      initData();
    }
  }, [datasetId, isEditMode, reset, t]);

  // 使用 ref 来避免不必要的重新渲染
  const isInitializedRef = useRef(false);
  const lastSyncDataRef = useRef<string>('');

  // 监听表单数据变化，同步到uiTables
  useEffect(() => {
    if (!currentTable || !isInitializedRef.current) return;

    const currentSyncData = JSON.stringify(watchedCurrentTable);
    if (lastSyncDataRef.current !== currentSyncData) {
      lastSyncDataRef.current = currentSyncData;
      syncCurrentTableToUITables();
    }
  }, [watchedCurrentTable, currentTable, syncCurrentTableToUITables]);

  // 切换表的启用状态
  const handleTableSelect = (index: number) => {
    // 先同步当前表单数据
    syncCurrentTableToUITables();

    const updatedTables = [...uiTables];
    updatedTables[index].enabled = !updatedTables[index].enabled;
    setUITables(updatedTables);

    // 如果是当前表，同步到表单
    if (index === currentTableIndex) {
      setValue('description', updatedTables[index].description);
    }
  };

  // 切换当前编辑的表
  const handleChangeTab = useCallback(
    (index: number) => {
      if (currentTableIndex === index) return;

      // 先同步当前表单数据
      syncCurrentTableToUITables();

      // 切换到新表
      setCurrentTableIndex(index);

      // 同步新表数据到表单（过滤掉删除的列）
      if (uiTables[index]) {
        const newFormData = {
          description: uiTables[index].description,
          columns: uiTables[index].columns.filter((col) => col.status !== StatusEnum.delete)
        };
        reset(newFormData);
        lastSyncDataRef.current = JSON.stringify(newFormData);
      }
    },
    [currentTableIndex, syncCurrentTableToUITables, uiTables, reset]
  );

  // 修改表描述
  const handleChangeTableDesc = (value: string) => {
    setValue('description', value);
  };

  // 修改列信息
  const handleChangeColumnData = <K extends keyof UIColumn>(
    key: K,
    columnIndex: number,
    value: UIColumn[K]
  ) => {
    const currentColumns = getValues('columns');
    const updatedColumns = [...currentColumns];
    updatedColumns[columnIndex] = {
      ...updatedColumns[columnIndex],
      [key]: value
    };
    setValue('columns', updatedColumns);
  };

  // 切换列的启用状态
  const handleColumnToggle = (columnIndex: number) => {
    const currentColumn = getValues(`columns.${columnIndex}`);
    setValue(`columns.${columnIndex}.enabled`, !currentColumn.enabled);
  };

  // 切换列的索引状态
  const handleValueIndexToggle = (columnIndex: number) => {
    const currentColumn = getValues(`columns.${columnIndex}`);
    setValue(`columns.${columnIndex}.valueIndex`, !currentColumn.valueIndex);
  };

  // 表单提交处理
  const onSubmit = async () => {
    // 先同步当前表单数据
    syncCurrentTableToUITables();
    // 校验是否存在问题表
    if (problematicTableNames.length > 0) {
      // 找到第一个有问题的表的索引
      const firstProblematicTableIndex = uiTables.findIndex((table) =>
        problematicTableNames.includes(table.tableName)
      );

      if (firstProblematicTableIndex !== -1) {
        // 自动切换到第一个不满足的表
        handleChangeTab(firstProblematicTableIndex);
      }

      return; // 阻止提交
    }

    // 转换为后端格式
    const backendData = transformUIToBackend(uiTables);

    if (isEditMode) {
      // 编辑模式：调用更新数据库配置接口
      await updateDatabaseConfig({ datasetId, ...backendData });
    } else {
      // 创建模式：调用创建数据库知识库数据集接口
      await createCollections({ datasetId, ...backendData });
    }
  };

  return {
    // 状态
    currentTable,
    currentTableIndex,
    uiTables,
    tableInfos,
    loading,
    isCreating,
    isUpdating,
    isSubmitting,
    changesSummary,
    problematicTableNames,
    tableChangeSummary,
    currentTableColumnChanges,

    // 方法
    handleTableSelect,
    handleChangeTab,
    handleChangeTableDesc,
    handleChangeColumnData,
    handleColumnToggle,
    handleValueIndexToggle,
    onSubmit
  };
};
