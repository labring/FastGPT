export type TmpDataSchema<T> = {
  dataId: string;
  data: T;
  expireAt: Date;
};
