export type LogTopologyFamily = 'mongodb' | 'sql_pglite';
export type LogTopologyMode = 'shared' | 'separate';

export type RequiredLogTopologyCase = {
  family: LogTopologyFamily;
  mode: LogTopologyMode;
  targetName: string;
  suiteTitle: string;
  caseTitle: string;
};

export declare const LOG_TOPOLOGY_CASE_TITLES: {
  readonly shared: 'routes log reads/writes through main physical DB in shared mode';
  readonly separate: 'isolates log reads/writes into separate log physical DB without touching main DB';
};

export declare const formatLogTopologySuiteTitle: (params: {
  family: LogTopologyFamily;
  targetName: string;
}) => string;

export declare const buildRequiredLogTopologyCases: (params: {
  mongoCollectionName: string;
  sqlTableName: string;
}) => RequiredLogTopologyCase[];
