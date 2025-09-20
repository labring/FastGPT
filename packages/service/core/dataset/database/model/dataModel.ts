import type {ValueTransformer, DataSource, ColumnType} from "typeorm";

export class RequestValidationDiagnosisError extends Error {
}

export class TableColumn {
    public columnName: string;
    public columnType: ColumnType;
    private _description: string = "";
    public examples: Array<string>;
    public forbid: boolean;
    public value_index: boolean;

    constructor(
        columnName: string,
        columnType: ColumnType,
        description: string = "",
        forbid: boolean = true,
        value_index: boolean = true,
        examples: Array<string> = [],
    ) {
        this.columnName = columnName;
        this.columnType = columnType;
        this.description = description; // 会触发 setter 校验
        this.examples = examples;
        this.forbid = forbid;
        this.value_index = value_index;
    }

    set description(value: string) {
        if (value.length > 1024) {
            throw new Error("字段描述长度不能超过1024个字符.");
        }
        this._description = value;
    }

    get description(): string {
        return this._description;
    }
}


export class TableColumnTransformer implements ValueTransformer {

    to(entityValue: TableColumn | null): any {
        if (!entityValue) return null;
        return {
            columnName: entityValue.columnName,
            columnType: entityValue.columnType,
            description: entityValue.description,
            examples: entityValue.examples,
            forbid: entityValue.forbid,
            value_index: entityValue.value_index,
        };
    }


    from(databaseValue: any): TableColumn | null {
        if (!databaseValue) return null;
        return new TableColumn(
            databaseValue.columnName,
            databaseValue.columnType,
            databaseValue.description,
            databaseValue.forbid,
            databaseValue.value_index,
            databaseValue.examples
        );
    }
}

export class TableForeignKey {
    constrained_columns: Array<string>
    referred_schema: string | null
    referred_table: string
    referred_columns: Array<string>

    constructor(
        constrained_columns: Array<string>,
        referred_schema: string | null,
        referred_table: string,
        referred_columns: Array<string>
    ) {
        this.constrained_columns = constrained_columns;
        this.referred_schema = referred_schema
        this.referred_table = referred_table
        this.referred_columns = referred_columns
    }
}

export class TableIndex {
    name: string
    columns: Array<string>
    isUnique: boolean
    isPrimary: boolean
    type: string

    constructor(
        name: string,
        columns: Array<string>,
        isUnique: boolean = false,
        isPrimary: boolean = false,
        type: string = 'btree'
    ) {
        this.name = name;
        this.columns = columns;
        this.isUnique = isUnique;
        this.isPrimary = isPrimary;
        this.type = type;
    }
}

export class TableConstraint {
    name: string
    type: 'unique' | 'check' | 'foreign_key' | 'primary_key'
    columns: Array<string>
    definition?: string

    constructor(
        name: string,
        type: 'unique' | 'check' | 'foreign_key' | 'primary_key',
        columns: Array<string>,
        definition?: string
    ) {
        this.name = name;
        this.type = type;
        this.columns = columns;
        this.definition = definition;
    }
}

export class TableKeyInfo {
    columns: Map<string, TableColumn>;
    foreign_keys: Array<TableForeignKey>;
    primary_keys: Array<string>;

    constructor(
        columns: Map<string, TableColumn>,
        foreign_keys: Array<TableForeignKey>,
        primary_keys: Array<string>
    ) {
        this.columns = columns;
        this.foreign_keys = foreign_keys;
        this.primary_keys = primary_keys;
    }
}

export class DBTable extends TableKeyInfo {
    private _name: string = "";
    private _description: string = "";
    forbid: boolean;
    indexes: Array<TableIndex>;
    constraints: Array<TableConstraint>;
    rowCount?: number;
    estimatedSize?: string;

    constructor(
        name: string,
        description: string = "",
        forbid: boolean = true,
        columns: Map<string, TableColumn>,
        foreign_keys: Array<TableForeignKey>,
        primary_keys: Array<string>,
        indexes: Array<TableIndex> = [],
        constraints: Array<TableConstraint> = []
    ) {
        super(columns, foreign_keys, primary_keys)
        this.name = name
        this.description = description
        this.forbid = forbid
        this.indexes = indexes;
        this.constraints = constraints;
    }

    set name(value: string) {
        if (!value) {
            throw new RequestValidationDiagnosisError("表名不能为空.")
        }
        if (value.length > 100) {
            throw new RequestValidationDiagnosisError("表名长度不能超过100个字符.")
        }
        this._name = value
    }

    get name() {
        return this._name
    }

    set description(value: string) {
        if (value.length > 1024) {
            throw new Error("字段描述长度不能超过1024个字符.");
        }
        this._description = value
    }

    get description() {
        return this._description
    }
}


export class DBIntrospector {
    constructor(private readonly dataSource: DataSource) {}

    async aget_table_info(
        tableName: string,
        getExamples: boolean = false
    ): Promise<DBTable> {
        const metadata = this.dataSource.getMetadata(tableName);

        // 表注释
        const tableComment = metadata.tableMetadataArgs?.comment ?? "";

        // 收集字段
        const columns = new Map<string, TableColumn>();
        for (const col of metadata.columns) {
            const name = col.propertyName;
            const type = col.type as ColumnType;
            const comment = col.comment ?? "";

            columns.set(name, new TableColumn(name, type, comment));
        }

        // 主键
        const primaryKeys = metadata.primaryColumns.map((col) => col.propertyName);

        // 外键
        const foreignKeys: TableForeignKey[] = metadata.foreignKeys.map((fk) =>
            new TableForeignKey(
                fk.columns.map((c) => c.propertyName),
                fk.referencedEntityMetadata.schema ?? null,
                fk.referencedEntityMetadata.tableName,
                fk.referencedColumns.map((c) => c.propertyName),
            )
        );


        return new DBTable(
            tableName,
            tableComment,
            false,
            columns,
            foreignKeys,
            primaryKeys
        );
    }
}