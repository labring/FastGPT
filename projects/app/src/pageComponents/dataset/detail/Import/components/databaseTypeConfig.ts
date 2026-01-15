/**
 * @file 数据库类型配置
 * 定义支持的数据库类型、图标、名称和默认配置
 */
import { DatabaseTypeEnum } from '@fastgpt/global/core/dataset/constants';

export interface DatabaseTypeConfig {
  type: DatabaseTypeEnum;
  name: string;
  icon: string;
  defaultPort: number;
  descriptionKey: string;
  // 特有字段标识
  hasSchema?: boolean;
  schemaPlaceholderKey?: string;
  schemaTooltipKey?: string;
  // 数据库名字段自定义提示（用于 Oracle ServiceName 模式）
  databasePlaceholderKey?: string;
  databaseTooltipKey?: string;
  defaultDatabase?: string;
}

export const databaseTypeConfigs: DatabaseTypeConfig[] = [
  {
    type: DatabaseTypeEnum.mysql,
    name: 'MySQL',
    icon: 'mysql',
    defaultPort: 3306,
    descriptionKey: 'dataset:mysql_description'
  },
  {
    type: DatabaseTypeEnum.postgresql,
    name: 'PostgreSQL',
    icon: 'pgsql',
    defaultPort: 5432,
    descriptionKey: 'dataset:postgresql_description',
    hasSchema: true,
    schemaPlaceholderKey: 'dataset:pgsql_schema_placeholder',
    schemaTooltipKey: 'dataset:pgsql_schema_tooltip'
  },
  {
    type: DatabaseTypeEnum.mssql,
    name: 'SQL Server',
    icon: 'mssql',
    defaultPort: 1433,
    descriptionKey: 'dataset:mssql_description',
    hasSchema: true,
    schemaPlaceholderKey: 'dataset:mssql_schema_placeholder',
    schemaTooltipKey: 'dataset:mssql_schema_tooltip'
  },
  {
    type: DatabaseTypeEnum.oracle,
    name: 'Oracle',
    icon: 'oracle',
    defaultPort: 1521,
    descriptionKey: 'dataset:oracle_description',
    hasSchema: true,
    schemaPlaceholderKey: 'dataset:oracle_schema_placeholder',
    schemaTooltipKey: 'dataset:oracle_schema_tooltip',
    // Oracle 使用 ServiceName 模式，数据库名字段即为 ServiceName
    databasePlaceholderKey: 'dataset:oracle_database_placeholder',
    databaseTooltipKey: 'dataset:oracle_database_tooltip',
    defaultDatabase: 'XEPDB1'
  }
];

export const getDatabaseTypeConfig = (type: DatabaseTypeEnum): DatabaseTypeConfig | undefined => {
  return databaseTypeConfigs.find((config) => config.type === type);
};

export const getDefaultPort = (type: DatabaseTypeEnum): number => {
  const config = getDatabaseTypeConfig(type);
  return config?.defaultPort ?? 3306;
};
