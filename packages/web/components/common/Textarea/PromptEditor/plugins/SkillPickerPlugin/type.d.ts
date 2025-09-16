export type EditorSkillPickerType = {
  key: string;
  label: string;
  icon: string;
  toolCategories?: {
    type: string;
    label: string;
    list: SkillToolItem[];
  }[];
};

export type SkillToolItem = {
  key: string;
  name: string;
  avatar: string;
  canOpen?: boolean;
  subItems?: {
    key: string;
    label: string;
  }[];
};

export type SkillOptionType = {
  key: string;
  label: string;
  icon?: string;
  level: 'primary' | 'secondary' | 'tertiary';
  parentKey?: string;
  canOpen?: boolean;
};
