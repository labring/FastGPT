export enum TrainingModeEnum {
  'qa' = 'qa',
  'index' = 'index'
}
export const TrainingTypeMap = {
  [TrainingModeEnum.qa]: 'qa',
  [TrainingModeEnum.index]: 'index'
};

export const PgDatasetTableName = 'modeldata';
