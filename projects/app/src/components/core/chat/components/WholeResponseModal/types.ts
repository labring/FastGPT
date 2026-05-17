export type SideTabItemType = {
  moduleLogo?: string;
  moduleName: string;
  moduleNameArgs?: Record<string, any>;
  runningTime?: number;
  moduleType: string;
  id: string;
  children: SideTabItemType[];
};
