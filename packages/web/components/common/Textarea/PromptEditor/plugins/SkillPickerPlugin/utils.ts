import type { SkillOptionType } from './type';

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
