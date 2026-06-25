export type BuiltinSkillSourceFile = {
  relativePath: string;
  content: Buffer;
};

export type BuiltinSkillSource = {
  name: string;
  files: BuiltinSkillSourceFile[];
};
