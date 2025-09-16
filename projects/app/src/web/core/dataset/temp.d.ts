/**
 * TODO-lyx-临时文件后面删除用后端定义的
 */
type Query = {
  datasetId: string;
};
export type CreateDatabaseCollectionsBody = {
  tables: Array<{
    tableName: string;
    description: string;
    forbid: boolean;
    columns: Record<
      string,
      {
        columnName: string;
        columnType: string;
        description: string;
        examples: string[];
        forbid: boolean;
        valueIndex: boolean;
      }
    >;
    foreignKeys?: Array<{
      constrainedColumns: string[];
      referredSchema: string | null;
      referredTable: string;
      referredColumns: string[];
    }>;
    primaryKeys?: string[];
  }>;
};

export type CreateDatabaseCollectionsResponse = {
  collectionIds: string[];
};

export enum ColumnStatusEnum {
  add = 'add',
  delete = 'delete',
  available = 'available'
}

export enum TableStatusEnum {
  add = 'add',
  delete = 'delete',
  available = 'available'
}

export type TableColumn = {
  columnName: string;
  columnType: string;
  description: string;
  examples: string[];
  status: ColumnStatusEnum;
  enabled: boolean;
  valueIndex: boolean;
};

export type DBTableChange = {
  tableName: string;
  description: string;
  enabled: boolean;
  columns: Record<string, TableColumn>;
  status: TableStatusEnum;
};

export type DetectChangesQuery = {
  datasetId: string;
};

export type DetectChangesResponse = {
  tables: DBTableChange[];
  hasChanges: boolean;
  summary: {
    addedTables: number;
    deletedTables: number;
    modifiedTables: number;
    addedColumns: number;
    deletedColumns: number;
  };
};

export type GetConfigurationResponse = {
  tables: Array<{
    tableName: string;
    description: string;
    forbid: boolean;
    columns: Record<
      string,
      {
        columnName: string;
        columnType: string;
        description: string;
        examples: string[];
        forbid: boolean;
        valueIndex: boolean;
      }
    >;
    foreignKeys: Array<{
      constrainedColumns: string[];
      referredSchema: string | null;
      referredTable: string;
      referredColumns: string[];
    }>;
    primaryKeys: string[];
  }>;
};

export type UpdateDatasetCollectionParams = {
  id?: string;
  parentId?: string;
  name?: string;
  tags?: string[]; // Not tag id, is tag label
  forbid?: boolean;
  createTime?: Date;

  // External file id
  datasetId?: string;
  externalFileId?: string;
};
