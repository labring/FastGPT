export type postCreateGroupData = {
  name: string;
  avatar?: string;
  memberIdList?: string[];
};

export type putUpdateGroupData = {
  groupId: string;
  name?: string;
  avatar?: string;
  memberIdList?: string[];
};
