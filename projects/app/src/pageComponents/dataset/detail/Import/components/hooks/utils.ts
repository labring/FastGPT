import type {
  CreateDatabaseCollectionsBody,
  DBTableChange,
  TableStatusEnum
} from '@/web/core/dataset/temp.d';
import { i18nT } from '@fastgpt/web/i18n/utils';
import type {
  DatabaseCollectionsTable,
  DatabaseCollectionsBody,
  DetectChangesResponse
} from '@fastgpt/global/core/dataset/database/api';

import type { ColumnSchemaType } from '@fastgpt/global/core/dataset/type';

export enum StatusEnum {
  add = 'add',
  delete = 'delete',
  available = 'available'
}

// 后端数据结构定义
export interface BackendColumn {
  columnName: string;
  columnType: string;
  description: string;
  examples: string[];
  forbid: boolean;
  valueIndex: boolean;
}

export interface BackendTableData {
  tableName: string;
  description: string;
  forbid: boolean;
  columns: Record<string, BackendColumn>;
}

// 前端UI使用的数据结构
export interface UIColumn {
  columnName: string;
  columnType: string;
  description: string;
  examples: string[];
  enabled: boolean;
  valueIndex: boolean;
  status: StatusEnum;
}

export type UITableData = Omit<DatabaseCollectionsTable, 'columns'> & {
  tableName: string;
  description: string;
  enabled: boolean;
  columns: (ColumnSchemaType & { enabled: boolean; status: StatusEnum })[];
  status: StatusEnum;
  hasColumnChanges: boolean;
};

export interface TableInfo {
  tableData: UITableData;
  isCurrentTable: boolean;
}

// 表单数据结构 - 只包含当前表的数据
export interface CurrentTableFormData {
  description: string;
  columns: UIColumn[];
}

// 表格变更汇总信息
export interface TableChangeSummary {
  // 存在列变更的表
  modifiedTables: {
    count: number;
    tableNames: string[];
  };
  // 已删除的表
  deletedTables: {
    count: number;
    tableNames: string[];
  };
  // 新增的表
  addedTables: {
    count: number;
    tableNames: string[];
  };
  // 是否有任何变更
  hasChanges: boolean;
  // 是否需要横幅提示(新增不需要提示)
  hasBannerTip: boolean;
}

// 当前表格的列变更信息
export interface CurrentTableColumnChanges {
  // 新增列
  addedColumns: {
    count: number;
    columnNames: string[];
  };
  // 删除列
  deletedColumns: {
    count: number;
    columnNames: string[];
  };
  // 是否有列变更
  hasColumnChanges: boolean;
}

// 原有的完整表单数据结构（保留用于兼容）
export interface DatabaseFormData {
  tables: UITableData[];
  currentTableIndex: number;
}

// 数据预处理函数：将后端数据转换为UI数据
export const transformBackendToUI = (
  backendTables: DatabaseCollectionsBody['tables']
): UITableData[] => {
  return backendTables.map((table) => ({
    ...table,
    tableName: table.tableName,
    description: table.description,
    enabled: !table.forbid,
    status: StatusEnum.available,
    hasColumnChanges: false,
    columns: Object.values(table.columns).map((column) => ({
      ...column,
      columnName: column.columnName,
      columnType: column.columnType,
      description: column.description,
      enabled: !column.forbid,
      examples: column.examples,
      valueIndex: column.valueIndex,
      status: StatusEnum.available
    }))
  }));
};

// 数据转换函数：将变更检测数据转换为UI数据
export const transformChangesToUI = (
  backendTables: DetectChangesResponse['tables']
): UITableData[] => {
  return backendTables.map((table) => {
    const columns = Object.values(table.columns).map((column: any) => ({
      ...column,
      columnName: column.columnName,
      columnType: column.columnType,
      description: column.description,
      examples: column.examples,
      enabled: !column.forbid,
      valueIndex: column.valueIndex,
      status: column.status
    }));

    // 检查是否有列变更
    const hasColumnChanges = columns.some(
      (col) => col.status === StatusEnum.add || col.status === StatusEnum.delete
    );

    return {
      ...table,
      tableName: table.tableName,
      description: table.description,
      enabled: table.enabled,
      columns,
      status: table.status,
      hasColumnChanges
    };
  }) as unknown as UITableData[];
};

// 数据转换函数：将UI数据转换为后端数据
export const transformUIToBackend = (uiTables: UITableData[]): DatabaseCollectionsBody => {
  return {
    tables: uiTables
      .filter((table) => table.enabled && table.status !== StatusEnum.delete)
      .map((table) => ({
        ...table,
        tableName: table.tableName,
        description: table.description,
        forbid: table.forbid,
        columns: table.columns
          .filter((column) => column.status !== StatusEnum.delete)
          .reduce(
            (acc, column) => {
              acc[column.columnName] = {
                ...column,
                columnName: column.columnName,
                columnType: column.columnType,
                description: column.description,
                examples: column.examples,
                forbid: !column.enabled,
                valueIndex: column.valueIndex
              };
              return acc;
            },
            {} as Record<string, BackendColumn>
          )
      }))
  };
};

// 数据转换函数：将表单数据转换为后端数据（保留用于兼容）
export const transformFormDataToBackend = (formData: DatabaseFormData): DatabaseCollectionsBody => {
  return transformUIToBackend(formData.tables);
};

// 计算存在问题的表名（表已勾选且表描述为空或列启用但描述为空）
export const getProblematicTableNames = (uiTables: UITableData[]): string[] => {
  return uiTables
    .filter((table) => {
      // 条件1：表已勾选
      if (!table.enabled) return false;

      // 条件2：表描述为空 或者 数据列配置中启用状态为true但是描述为空
      const hasEmptyTableDesc = !table.description.trim();
      const hasEnabledColumnsWithEmptyDesc = table.columns.some(
        (column) => column.enabled && !column.description.trim()
      );

      return hasEmptyTableDesc || hasEnabledColumnsWithEmptyDesc;
    })
    .map((table) => table.tableName);
};
