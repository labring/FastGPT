export enum DatasetFileIdEnum {
  manual = 'manual',
  mark = 'mark'
}
export const datasetSpecialIdMap = {
  [DatasetFileIdEnum.manual]: {
    name: 'kb.Manual Data',
    sourceName: 'kb.Manual Input'
  },
  [DatasetFileIdEnum.mark]: {
    name: 'kb.Mark Data',
    sourceName: 'kb.Manual Mark'
  }
};
export const datasetSpecialIds: string[] = [DatasetFileIdEnum.manual, DatasetFileIdEnum.mark];
