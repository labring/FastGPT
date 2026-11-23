/**
 * 日志域双态（`shared` / `separate`）物理隔离标准用例名称常量，由 DAL 测试注册器与 CLI 运行验收共享唯一权威来源。
 */
export const LOG_TOPOLOGY_CASE_TITLES = Object.freeze({
  shared: 'routes log reads/writes through main physical DB in shared mode',
  separate: 'isolates log reads/writes into separate log physical DB without touching main DB'
});

/**
 * 构造绑定目标物理集合或表身份的日志拓扑套件标题，避免多日志域共享同名套件标题而互代。
 */
export const formatLogTopologySuiteTitle = ({ family, targetName }) =>
  family === 'mongodb'
    ? `[Log Topology: MongoDB (shared + separate) | ${targetName}]`
    : `[Log Topology: SQL PGlite (shared + separate) | ${targetName}]`;

/**
 * 按物理集合/表身份构造日志域双态 4 个必需拓扑用例身份描述符。
 */
export const buildRequiredLogTopologyCases = ({ mongoCollectionName, sqlTableName }) => [
  {
    family: 'mongodb',
    mode: 'shared',
    targetName: mongoCollectionName,
    suiteTitle: formatLogTopologySuiteTitle({
      family: 'mongodb',
      targetName: mongoCollectionName
    }),
    caseTitle: LOG_TOPOLOGY_CASE_TITLES.shared
  },
  {
    family: 'mongodb',
    mode: 'separate',
    targetName: mongoCollectionName,
    suiteTitle: formatLogTopologySuiteTitle({
      family: 'mongodb',
      targetName: mongoCollectionName
    }),
    caseTitle: LOG_TOPOLOGY_CASE_TITLES.separate
  },
  {
    family: 'sql_pglite',
    mode: 'shared',
    targetName: sqlTableName,
    suiteTitle: formatLogTopologySuiteTitle({
      family: 'sql_pglite',
      targetName: sqlTableName
    }),
    caseTitle: LOG_TOPOLOGY_CASE_TITLES.shared
  },
  {
    family: 'sql_pglite',
    mode: 'separate',
    targetName: sqlTableName,
    suiteTitle: formatLogTopologySuiteTitle({
      family: 'sql_pglite',
      targetName: sqlTableName
    }),
    caseTitle: LOG_TOPOLOGY_CASE_TITLES.separate
  }
];
