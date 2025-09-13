export type EditorSkillPickerType = {
  key: string;
  label: string;
  description?: string;
  icon?: string;
  toolCategories?: SkillToolCategory[];
};

export type SkillToolItem = {
  key: string;
  name: string;
  avatar: string;
  canOpen?: boolean;
  subItems?: SkillSubToolItem[];
};

export type SkillSubToolItem = {
  key: string;
  label: string;
  description?: string;
};

export type SkillOptionType = {
  key: string;
  label: string;
  level: 'primary' | 'secondary' | 'tertiary';

  index: number;
  parentIndex?: number;

  skillType?: EditorSkillPickerType;
  toolItem?: SkillToolItem;
  subItem?: SkillSubToolItem;
};
