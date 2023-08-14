import { AppListItemType } from '@/types/app';

export type AppListResponse = {
  myApps: AppListItemType[];
  myCollectionApps: AppListItemType[];
};
