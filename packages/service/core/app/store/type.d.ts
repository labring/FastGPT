export type PluginGroupSchemaType = {
  groupId: string;
  groupAvatar: string;
  groupName: string;
  groupTypes: TGroupType[];
  groupOrder: number;
};

export type TGroupType = {
  typeName: string;
  typeId: string;
};
