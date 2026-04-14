/** Generic message response */
export type MessageResponse = { message: string };

/** Query parameter type with trainsetId */
export type TrainsetIdQuery = { trainsetId: string };

/** Query parameter type with taskId */
export type TaskIdQuery = { taskId: string };

/** Query parameter type with dataId */
export type DataIdQuery = { dataId: string };

/** Sort order */
export type SortOrder = 'asc' | 'desc';

/** Sort parameters */
export type SortParams<T extends string> = {
  sortField?: T;
  sortOrder?: SortOrder;
};
