import type {
  EditorSkillPickerType,
  SkillOptionType,
  SkillToolItem,
  SkillSubToolItem
} from './type';

export const getLevel = (
  index: number,
  levelRanges: {
    primary: { start: number; end: number };
    secondary: { start: number; end: number };
    tertiary: { start: number; end: number };
  }
) => {
  if (index >= levelRanges.primary.start && index <= levelRanges.primary.end) {
    return 'primary';
  } else if (index >= levelRanges.secondary.start && index <= levelRanges.secondary.end) {
    return 'secondary';
  } else if (index >= levelRanges.tertiary.start && index <= levelRanges.tertiary.end) {
    return 'tertiary';
  }
  return null;
};

export const buildIndexedOptions = (
  skills: EditorSkillPickerType[],
  toolSubItemsCache: {
    [toolKey: string]: SkillSubToolItem[];
  }
): {
  skillOptions: Map<number, SkillOptionType>;
  levelRanges: {
    primary: { start: number; end: number };
    secondary: { start: number; end: number };
    tertiary: { start: number; end: number };
  };
} => {
  const skillOptions: Map<number, SkillOptionType> = new Map();
  const levelRanges = {
    primary: { start: 0, end: -1 },
    secondary: { start: 1000, end: 999 },
    tertiary: { start: 2000, end: 1999 }
  };

  let currentIndex = 0;

  skills.forEach((skill) => {
    const skillOption: SkillOptionType = {
      key: skill.key,
      label: skill.label,
      level: 'primary',
      skillType: skill,
      index: currentIndex
    };
    skillOptions.set(currentIndex, skillOption);
    currentIndex++;
  });
  levelRanges.primary.end = currentIndex - 1;

  currentIndex = 1000;
  skills.forEach((skill) => {
    const skillIndex =
      Array.from(skillOptions.values()).find(
        (opt) => opt.level === 'primary' && opt.skillType?.key === skill.key
      )?.index || 0;

    skill.toolCategories?.forEach((category) => {
      category.list.forEach((toolItem: SkillToolItem) => {
        const toolOption: SkillOptionType = {
          key: toolItem.key,
          label: toolItem.name,
          level: 'secondary',
          toolItem,
          index: currentIndex,
          parentIndex: skillIndex
        };
        skillOptions.set(currentIndex, toolOption);
        currentIndex++;
      });
    });
  });
  levelRanges.secondary.end = currentIndex - 1;

  currentIndex = 2000;
  skills.forEach((skill) => {
    skill.toolCategories?.forEach((category) => {
      category.list.forEach((toolItem: SkillToolItem) => {
        const parentIndex =
          Array.from(skillOptions.values()).find(
            (item) => item.level === 'secondary' && item.toolItem?.key === toolItem.key
          )?.index || 1000;
        const subItems = toolSubItemsCache[toolItem.key];

        if (subItems && subItems.length > 0) {
          subItems.forEach((subItem) => {
            const subOption: SkillOptionType = {
              key: subItem.key,
              label: subItem.label,
              level: 'tertiary',
              subItem,
              index: currentIndex,
              parentIndex
            };
            skillOptions.set(currentIndex, subOption);
            currentIndex++;
          });
        }
      });
    });
  });
  levelRanges.tertiary.end = currentIndex - 1;

  return { skillOptions, levelRanges };
};

export const getSkillDisplayState = ({
  selectedIndex,
  skillOptionList,
  skillOption
}: {
  selectedIndex: number;
  skillOptionList: SkillOptionType[];
  skillOption: SkillOptionType;
}) => {
  const isCurrentFocus = selectedIndex === skillOption.index;
  const hasSelectedChild = skillOptionList.some(
    (item) =>
      item.parentIndex === skillOption.index &&
      (selectedIndex === item.index ||
        (item.level === 'secondary' &&
          skillOptionList.some(
            (subItem) => subItem.parentIndex === item.index && selectedIndex === subItem.index
          )))
  );

  return {
    isCurrentFocus,
    hasSelectedChild,
    shouldShowSecondary: hasSelectedChild || isCurrentFocus
  };
};

export const getToolDisplayState = ({
  selectedIndex,
  skillOptionList,
  toolOption
}: {
  selectedIndex: number;
  skillOptionList: SkillOptionType[];
  toolOption: SkillOptionType;
}) => {
  const isCurrentFocus = selectedIndex === toolOption.index;
  const hasSelectedChild = skillOptionList.some(
    (item) => item.parentIndex === toolOption.index && selectedIndex === item.index
  );

  return {
    isCurrentFocus,
    hasSelectedChild,
    shouldShowTertiary: hasSelectedChild || isCurrentFocus
  };
};
