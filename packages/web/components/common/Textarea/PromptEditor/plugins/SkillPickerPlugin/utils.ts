import type {
  EditorSkillPickerType,
  SkillOptionType,
  SkillToolItem,
  SkillSubToolItem
} from './type';

export const buildSkillOptions = (
  skills: EditorSkillPickerType[],
  toolSubItemsCache: {
    [toolKey: string]: SkillSubToolItem[];
  }
): SkillOptionType[] => {
  const skillOptions: SkillOptionType[] = [];

  skills.forEach((skill) => {
    const skillOption: SkillOptionType = {
      key: skill.key,
      label: skill.label,
      level: 'primary',
      skillType: skill
    };
    skillOptions.push(skillOption);
  });

  skills.forEach((skill) => {
    skill.toolCategories?.forEach((category) => {
      category.list.forEach((toolItem: SkillToolItem) => {
        const toolOption: SkillOptionType = {
          key: toolItem.key,
          label: toolItem.name,
          level: 'secondary',
          parentKey: skill.key,
          toolItem
        };
        skillOptions.push(toolOption);
      });
    });
  });

  skills.forEach((skill) => {
    skill.toolCategories?.forEach((category) => {
      category.list.forEach((toolItem: SkillToolItem) => {
        const subItems = toolSubItemsCache[toolItem.key];

        if (subItems && subItems.length > 0) {
          subItems.forEach((subItem) => {
            const subOption: SkillOptionType = {
              key: subItem.key,
              label: subItem.label,
              level: 'tertiary',
              parentKey: toolItem.key,
              subItem
            };
            skillOptions.push(subOption);
          });
        }
      });
    });
  });

  return skillOptions;
};

export const getSkillDisplayState = ({
  selectedKey,
  skillOptionList,
  skillOption
}: {
  selectedKey: string;
  skillOptionList: SkillOptionType[];
  skillOption: SkillOptionType;
}) => {
  const isCurrentFocus = selectedKey === skillOption.key;
  const hasSelectedChild = skillOptionList.some(
    (item) =>
      item.parentKey === skillOption.key &&
      (selectedKey === item.key ||
        (item.level === 'secondary' &&
          skillOptionList.some(
            (subItem) => subItem.parentKey === item.key && selectedKey === subItem.key
          )))
  );

  return {
    isCurrentFocus,
    hasSelectedChild,
    shouldShowSecondary: hasSelectedChild || isCurrentFocus
  };
};

export const getToolDisplayState = ({
  selectedKey,
  skillOptionList,
  toolOption
}: {
  selectedKey: string;
  skillOptionList: SkillOptionType[];
  toolOption: SkillOptionType;
}) => {
  const isCurrentFocus = selectedKey === toolOption.key;
  const hasSelectedChild = skillOptionList.some(
    (item) => item.parentKey === toolOption.key && selectedKey === item.key
  );

  return {
    isCurrentFocus,
    hasSelectedChild,
    shouldShowTertiary: hasSelectedChild || isCurrentFocus
  };
};
