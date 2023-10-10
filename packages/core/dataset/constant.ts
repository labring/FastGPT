export enum DatasetSpecialIdEnum {
  manual = 'manual',
  mark = 'mark'
}
export const datasetSpecialIdMap = {
  [DatasetSpecialIdEnum.manual]: {
    name: 'kb.Manual Data',
    sourceName: 'kb.Manual Input'
  },
  [DatasetSpecialIdEnum.mark]: {
    name: 'kb.Mark Data',
    sourceName: 'kb.Manual Mark'
  }
};
export const datasetSpecialIds: string[] = [DatasetSpecialIdEnum.manual, DatasetSpecialIdEnum.mark];
