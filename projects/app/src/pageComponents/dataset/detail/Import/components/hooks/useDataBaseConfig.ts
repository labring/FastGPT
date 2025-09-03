import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { mockData } from '../const';

// 后端数据结构定义
interface BackendColumn {
  columnName: string;
  columnType: string;
  description: string;
  examples: string[];
  enabled: boolean;
  valueIndex: boolean;
}

interface BackendTableData {
  tableName: string;
  description: string;
  enabled: boolean;
  columns: Record<string, BackendColumn>;
}

// 前端UI使用的数据结构
interface UIColumn {
  columnName: string;
  columnType: string;
  description: string;
  examples: string[];
  enabled: boolean;
  valueIndex: boolean;
}

interface UITableData {
  tableName: string;
  description: string;
  enabled: boolean;
  columns: UIColumn[];
}

interface TableInfo {
  tableData: UITableData;
  isCurrentTable: boolean;
}

// 数据预处理函数：将后端数据转换为UI数据
const transformBackendToUI = (backendTables: BackendTableData[]): UITableData[] => {
  return backendTables.map((table) => ({
    tableName: table.tableName,
    description: table.description,
    enabled: table.enabled,
    columns: Object.values(table.columns).map((column) => ({
      columnName: column.columnName,
      columnType: column.columnType,
      description: column.description,
      enabled: column.enabled,
      examples: column.examples,
      valueIndex: column.valueIndex
    }))
  }));
};

// 数据转换函数：将UI数据转换为后端数据
const transformUIToBackend = (uiTables: UITableData[]): BackendTableData[] => {
  return uiTables.map((table) => ({
    tableName: table.tableName,
    description: table.description,
    enabled: table.enabled,
    columns: table.columns.reduce(
      (acc, column) => {
        acc[column.columnName] = {
          columnName: column.columnName,
          columnType: column.columnType,
          description: column.description,
          enabled: column.enabled,
          examples: column.examples,
          valueIndex: column.valueIndex
        };
        return acc;
      },
      {} as Record<string, BackendColumn>
    )
  }));
};

export const useDataBaseConfig = () => {
  const { t } = useTranslation();

  // 模拟后端数据
  const mockBackendData: BackendTableData[] = mockData as BackendTableData[];

  // 初始化UI数据
  const [uiTables, setUITables] = useState<UITableData[]>(() =>
    transformBackendToUI(mockBackendData)
  );

  const [tableInfos, setTableInfos] = useState<TableInfo[]>(() =>
    uiTables.map((table, index) => ({
      tableData: table,
      isCurrentTable: index === 0
    }))
  );

  const [currentTable, setCurrentTable] = useState<UITableData>(uiTables[0]);

  // 验证错误状态
  const [validationErrors, setValidationErrors] = useState<{
    tableDescription: string;
    columnDescriptions: Record<number, string>;
  }>({
    tableDescription: '',
    columnDescriptions: {}
  });

  // 验证表描述
  const validateTableDescription = (table: UITableData) => {
    if (table.enabled && !table.description.trim()) {
      return t('dataset:table_description_required');
    }
    return '';
  };

  // 验证列描述
  const validateColumnDescription = (column: UIColumn) => {
    if (column.enabled && !column.description.trim()) {
      return t('dataset:column_description_required');
    }
    return '';
  };

  // 切换表的启用状态
  const handleTableSelect = (index: number) => {
    const updatedTables = [...uiTables];
    updatedTables[index].enabled = !updatedTables[index].enabled;
    setUITables(updatedTables);

    const updatedTableInfos = [...tableInfos];
    updatedTableInfos[index].tableData = updatedTables[index];
    setTableInfos(updatedTableInfos);

    // 如果当前编辑的是这个表，更新当前表数据并验证
    if (tableInfos[index].isCurrentTable) {
      setCurrentTable(updatedTables[index]);

      // 验证表描述
      const tableDescError = validateTableDescription(updatedTables[index]);
      setValidationErrors((prev) => ({
        ...prev,
        tableDescription: tableDescError
      }));
    }
  };

  // 切换当前编辑的表
  const handleChangeTab = (index: number) => {
    const currentTableIndex = tableInfos.findIndex((info) => info.isCurrentTable);
    if (index === currentTableIndex) return;

    // 保存当前表的修改
    const updatedTables = [...uiTables];
    updatedTables[currentTableIndex] = currentTable;
    setUITables(updatedTables);

    // 更新表信息
    const updatedTableInfos = tableInfos.map((info, i) => ({
      ...info,
      isCurrentTable: i === index,
      tableData: updatedTables[i]
    }));
    setTableInfos(updatedTableInfos);

    // 设置新的当前表
    setCurrentTable(updatedTables[index]);
  };

  // 修改表描述
  const handleChangeTableDesc = (value: string) => {
    const updatedTable = {
      ...currentTable,
      description: value
    };
    setCurrentTable(updatedTable);

    // 验证表描述
    const error = validateTableDescription(updatedTable);
    setValidationErrors((prev) => ({
      ...prev,
      tableDescription: error
    }));
  };

  // 修改列信息
  const handleChangeColumnData = <K extends keyof UIColumn>(
    key: K,
    index: number,
    value: UIColumn[K]
  ) => {
    const updatedColumns = [...currentTable.columns];
    updatedColumns[index][key] = value;
    const updatedTable = {
      ...currentTable,
      columns: updatedColumns
    };
    setCurrentTable(updatedTable);

    // 如果修改的是描述字段，需要验证
    if (key === 'description') {
      const error = validateColumnDescription(updatedColumns[index]);
      console.log(error);
      setValidationErrors((prev) => ({
        ...prev,
        columnDescriptions: {
          ...prev.columnDescriptions,
          [index]: error
        }
      }));
    }
  };

  // 切换列的启用状态
  const handleColumnToggle = (index: number) => {
    const newEnabledState = !currentTable.columns[index].enabled;
    handleChangeColumnData('enabled', index, newEnabledState);

    // 验证列描述
    const updatedColumn = { ...currentTable.columns[index], enabled: newEnabledState };
    const error = validateColumnDescription(updatedColumn);
    setValidationErrors((prev) => ({
      ...prev,
      columnDescriptions: {
        ...prev.columnDescriptions,
        [index]: error
      }
    }));
  };

  // 切换列的索引状态
  const handleValueIndexToggle = (index: number) => {
    handleChangeColumnData('valueIndex', index, !currentTable.columns[index].valueIndex);
  };

  const handleConfirm = () => {
    // 保存当前表的修改
    const finalTables = [...uiTables];
    const currentTableIndex = tableInfos.findIndex((info) => info.isCurrentTable);
    finalTables[currentTableIndex] = currentTable;

    // 转换为后端格式
    const backendData = transformUIToBackend(finalTables);
    console.log('Database config confirmed:', backendData);

    // 这里可以调用API提交数据
    // await submitDatabaseConfig(backendData);
  };

  return {
    // 状态
    currentTable,
    tableInfos,
    validationErrors,

    handleTableSelect,
    handleChangeTab,
    handleChangeTableDesc,
    handleChangeColumnData,
    handleColumnToggle,
    handleValueIndexToggle,
    handleConfirm
  };
};

// 导出类型定义
export type { UIColumn, UITableData, BackendColumn, BackendTableData, TableInfo };
