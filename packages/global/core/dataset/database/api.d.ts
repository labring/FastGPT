import type { ColumnSchemaType,TableSchemaType } from '../type';
import {ConstraintSchemaType,ForeignKeySchemaType } from '../type';

/*-------API Request & Response Types-------*/

export type CheckConnectionBody = {
  datasetId: string;
  databaseConfig: DatabaseConfig;
};

/*-------Create Database Collections Type-------*/
export type DatabaseCollectionsTable = Omit<TableSchemaType, "lastUpdated"> & {forbid: boolean};

export type DatabaseCollectionsBody = {
  tables: DatabaseCollectionsTable[];
};

export type CreateDatabaseCollectionsBody = DatabaseCollectionsBody & {datasetId: string}

export type CreateDatabaseCollectionsResponse = {
  collectionIds: string[];
};

/*-------Detect Changes Type-------*/
export enum StatusEnum {
  add = 'add',
  delete = 'delete',
  available = 'available'
}


export type DBTableColumn  = ColumnSchemaType & {status: StatusEnum;}

export type DBTableChange = Omit<TableSchemaType, "columns","lastUpdated"> & 
{   
    forbid: boolean;
    status: StatusEnum; 
    columns: Record<string, DBTableColumn>
}

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
/*-------Apply Changes Type-------*/
export type ApplyChangesBody = {
  datasetId: string;
  tables: Array<DBTableChange>;
};

export type ApplyChangesResponse = {
  success: boolean;
  processedItems: {
    deletedTables: number;
    updatedTables: number;
    addedTables: number;
    affectedDataRecords: number;
  };
  errors: Array<{
    type: 'table' | 'column' | 'data';
    target: string;
    error: string;
  }>;
  taskId?: string;
};

/*-------Database Search Test Type-------*/
export type DatabaseSearchTestBody = {
  datasetId: string;
  query: string;
  model?: string;
};

/*-------Dativate Retrieval Type-------*/

export type DativeCostraintKey = {
  name: string;
  column: string;
};
export type DativeForeignKey = DativeCostraintKey & {
  referenced_schema: string;
  referenced_table: string;
  referenced_column: string;
};
export type DativeTableColumns = {
  name: string;
  type: string;
  comment: string;
  auto_increment: boolean;
  nullable : boolean;
  default : any;
  examples: Array<any>;
  enabled: boolean;
  value_index: boolean;
};
export type DativeTable = {
  name: string;
  ns_name?: string;
  comment: string;
  columns: Record<string, DativeTableColumns>;
  primary_keys: Array<string>;
  foreign_keys: Array<DativeForeignKey>;
  enable: boolean;
  score: number;
};

export type DativeSchema = {
    name: string; // databaseName
    comments?: string;
    tables: Array<DativeTable>;
};

// SQL Generation types
export type SqlGenerationRequest = {
  source_config: {
    type : string;
    host: string; 
    port: number;
    username: string;
    password: string;
    db_name: string;
  };
  generate_sql_llm: {
    model: string;
    api_key?: string;
    base_url?: string;
  };
  evaluate_sql_llm: {
    model: string;
    api_key?: string;
    base_url?: string;
  };
  query: string;
  result_num_limit: number;
  retrieved_metadata?: DativeSchema;
  evidence?: string;
};

export type SqlGenerationResponse = {
  answer: string;
  sql: string;
  sql_res: {
    data: any[];
    columns: string[];
  };
  input_tokens: number;
  output_tokens: number;
};

