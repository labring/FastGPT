export const AppRegistrationTableName = 'app_registrations';

export type AppRegistrationOceanBaseRow = {
  _id: string;
  team_id: string;
  tmb_id: string;
  app_id: string | null;
  created_at: Date | null;
};

export type AppRegistrationDatabase = {
  app_registrations: AppRegistrationOceanBaseRow;
};

/**
 * AppRegistration 表的 OceanBase（MySQL 兼容模式）原生建表 DDL。
 *
 * 显式声明 `utf8mb4_bin` 保持与 MongoDB 一致的区分大小写等值语义，托管索引以 `fg_` 命名。
 */
export const APP_REGISTRATION_OCEANBASE_DDL = `CREATE TABLE IF NOT EXISTS \`app_registrations\` (
  \`_id\` VARCHAR(24) NOT NULL,
  \`team_id\` VARCHAR(24) NOT NULL,
  \`tmb_id\` VARCHAR(24) NOT NULL,
  \`app_id\` VARCHAR(24) NULL,
  \`created_at\` DATETIME(3) NULL,
  PRIMARY KEY (\`_id\`),
  KEY \`fg_app_reg_team\` (\`team_id\`)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;`;
