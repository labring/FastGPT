import type { ColumnType } from 'typeorm';
import { truncateText } from './utils';
import type { DatabaseCollectionsTable } from '@fastgpt/global/core/dataset/database/api';
import type { ColumnSchemaType } from '@fastgpt/global/core/dataset/type';

export class RequestValidationDiagnosisError extends Error {}

export class TableColumn {
  columnName: string;
  columnType: ColumnType;
  description: string;
  examples: Array<string>;
  forbid: boolean;
  valueIndex: boolean;

  // Database attributes
  isNullable?: boolean;
  defaultValue?: string | null;
  isAutoIncrement?: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  relatedColumns?: string[];

  constructor(
    columnName: string,
    columnType: ColumnType,
    description: string = '',
    forbid: boolean = true,
    value_index: boolean = true,
    examples: Array<string> = [],
    isNullable: boolean = true,
    defaultValue?: string | null,
    isAutoIncrement: boolean = false,
    isPrimaryKey: boolean = false,
    isForeignKey: boolean = false,
    relatedColumns?: string[]
  ) {
    this.columnName = columnName;
    this.columnType = columnType;
    this.description = description; // 会触发 setter 校验
    this.examples = examples;
    this.forbid = forbid;
    this.valueIndex = value_index;
    // Database constraints
    this.isNullable = isNullable;
    this.defaultValue = defaultValue;
    this.isAutoIncrement = isAutoIncrement;
    this.isPrimaryKey = isPrimaryKey;
    this.isForeignKey = isForeignKey;
    this.relatedColumns = relatedColumns;
  }
}

export class TableConstraint {
  name: string; // constraint name
  column: string; // constrained column

  constructor(name: string, column: string) {
    this.name = name;
    this.column = column;
  }
}

export class TableForeignKey extends TableConstraint {
  referredSchema: string | null;
  referredTable: string | null;
  referredColumns: string | null;
  constructor(
    name: string, // constraint name
    column: string, // constrained column
    referredSchema: string | null,
    referredTable: string | null,
    referredColumns: string | null
  ) {
    super(name, column);
    this.referredSchema = referredSchema;
    this.referredTable = referredTable;
    this.referredColumns = referredColumns;
  }
}

export class TableKeyInfo {
  columns: Map<string, TableColumn>;
  foreignKeys: Array<TableForeignKey>;
  primaryKeys: Array<string>;

  constructor(
    columns: Map<string, TableColumn>,
    foreignKeys: Array<TableForeignKey>,
    primaryKeys: Array<string>
  ) {
    this.columns = columns;
    this.foreignKeys = foreignKeys;
    this.primaryKeys = primaryKeys;
  }
}

export class DBTable extends TableKeyInfo {
  tableName: string;
  description: string;
  forbid: boolean;
  constraints: Array<TableConstraint>;
  rowCount?: number;
  estimatedSize?: string;

  constructor(
    tableName: string,
    description: string,
    forbid: boolean = true,
    columns: Map<string, TableColumn>,
    foreignKeys: Array<TableForeignKey>,
    primaryKeys: Array<string>,
    constraints: Array<TableConstraint> = []
  ) {
    super(columns, foreignKeys, primaryKeys);
    this.tableName = tableName;
    this.description = description;
    this.forbid = forbid;
    this.constraints = constraints;
  }
}

export class TableColumnTransformer {
  /**
   * Convert TableColumn Object to plain object
   * @param tableColumn TableColumn Object
   * @returns plain object
   */
  static toPlainObject(tableColumn: TableColumn): any {
    if (!tableColumn) return null;
    console.debug('[TableColumnTransformer toPlainObject] tableColumn', tableColumn.defaultValue);
    return {
      columnName: tableColumn.columnName,
      columnType: String(tableColumn.columnType),
      description: tableColumn.description,
      examples: tableColumn.examples,
      forbid: tableColumn.forbid,
      valueIndex: tableColumn.valueIndex,
      // Database attributes
      isNullable: tableColumn.isNullable,
      defaultValue: tableColumn.defaultValue,
      isAutoIncrement: tableColumn.isAutoIncrement,
      isPrimaryKey: tableColumn.isPrimaryKey,
      isForeignKey: tableColumn.isForeignKey,
      relatedColumns: tableColumn.relatedColumns
    };
  }

  static fromPlainObject(col: ColumnSchemaType): TableColumn {
    return new TableColumn(
      col.columnName,
      col.columnType as ColumnType,
      col.description,
      col.forbid,
      col.valueIndex,
      col.examples,
      col.isNullable,
      col.defaultValue,
      col.isAutoIncrement,
      col.isPrimaryKey,
      col.isForeignKey,
      col.relatedColumns
    );
  }
}

export class TableTransformer {
  static toPlainObject(table: DBTable, extra: Record<string, any> = {}): any {
    const columnObj: Record<string, ColumnSchemaType> = {};
    table.columns.forEach((value, key) => {
      columnObj[key] = TableColumnTransformer.toPlainObject(value);
    });

    return {
      tableName: table.tableName,
      description: table.description,
      columns: columnObj,
      foreignKeys: table.foreignKeys,
      primaryKeys: table.primaryKeys,
      constraints: table.constraints,
      ...extra
    };
  }

  static fromPlainObject(table: DatabaseCollectionsTable): DBTable {
    return new DBTable(
      table.tableName,
      table.description,
      table.forbid,
      new Map(
        Object.entries(table.columns).map(([key, value]) => [
          key,
          TableColumnTransformer.fromPlainObject(value)
        ])
      ),
      table.foreignKeys,
      table.primaryKeys,
      table.constraints
    );
  }
}
