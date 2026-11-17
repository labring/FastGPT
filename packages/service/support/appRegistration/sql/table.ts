import { defineSqlTable } from '@fastgpt/dal/db/sql/ddl';

export type AppRegistrationSqlRow = {
  _id: string;
  team_id: string;
  tmb_id: string;
  app_id: string | null;
  created_at: Date | null;
};

export type AppRegistrationDatabase = {
  app_registrations: AppRegistrationSqlRow;
};

/** 跨 PostgreSQL 与 OceanBase/MySQL 可移植的 AppRegistration 表定义（纯 B-Tree 索引）。 */
export const appRegistrationSqlTable = defineSqlTable({
  name: 'app_registrations',
  columns: {
    _id: { kind: 'entityId', primaryKey: true },
    team_id: { kind: 'entityId' },
    tmb_id: { kind: 'entityId' },
    app_id: { kind: 'entityId', nullable: true },
    created_at: { kind: 'timestamp', nullable: true }
  },
  indexes: [{ name: 'idx_app_registrations_team', columns: ['team_id'] }]
});
