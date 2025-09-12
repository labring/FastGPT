import type { LexicalEditor } from 'lexical';
import { $createTextNode, $getSelection, $isRangeSelection } from 'lexical';
import type { SkillSubItem, SkillToolCategory, SkillToolItem } from './index';
import type { OnAddToolFromEditor } from '../../type';

/**
 * 技能选择器键盘导航工具函数
 */

/**
 * 获取工具分类的函数类型
 */
export type GetToolCategoriesFunction = (skillTypeKey: string) => SkillToolCategory[];

/**
 * 键盘事件处理器的参数类型
 */
export type KeyboardHandlerParams = {
  selectedSkillType: string | null;
  secondaryIndex: number; // -1表示焦点在主菜单，>=0表示焦点在二级菜单的对应索引
  tertiaryIndex: number; // -1表示焦点不在三级菜单，>=0表示焦点在三级菜单的对应索引
  editor: LexicalEditor;
  getToolCategories: GetToolCategoriesFunction;
  setSecondaryIndex: (value: number | ((prev: number) => number)) => void;
  setTertiaryIndex: (value: number | ((prev: number) => number)) => void;
  resetMenuState: () => void;
  toolSubItemsCache: {
    [toolKey: string]: {
      loading: boolean;
      data?: SkillSubItem[];
      error?: string;
    };
  };
  onAddToolFromEditor?: OnAddToolFromEditor;
};

/**
 * 计算扁平化后的总项目数
 */
const getFlatItemsCount = (toolCategories: SkillToolCategory[]): number => {
  let count = 0;
  toolCategories.forEach((category) => {
    count += category.list.length;
  });
  return count;
};

/**
 * 获取当前选中的二级菜单项
 */
const getCurrentSecondaryItem = (
  toolCategories: SkillToolCategory[],
  secondaryIndex: number
): SkillToolItem | null => {
  if (secondaryIndex < 0) return null;

  let currentIndex = 0;
  for (const category of toolCategories) {
    for (const item of category.list) {
      if (currentIndex === secondaryIndex) {
        return item;
      }
      currentIndex++;
    }
  }
  return null;
};

/**
 * 上键处理：在二级菜单或三级菜单中向上导航
 */
export const handleArrowUp = (
  event: KeyboardEvent | null,
  params: KeyboardHandlerParams
): boolean => {
  const {
    secondaryIndex,
    tertiaryIndex,
    selectedSkillType,
    getToolCategories,
    setSecondaryIndex,
    setTertiaryIndex
  } = params;

  const isSecondaryFocused = secondaryIndex >= 0 && tertiaryIndex < 0;
  const isTertiaryFocused = tertiaryIndex >= 0;

  if (isTertiaryFocused) {
    // 在三级菜单中导航
    event?.preventDefault();
    event?.stopPropagation();
    const toolGroups = selectedSkillType ? getToolCategories(selectedSkillType) : [];
    const currentItem = getCurrentSecondaryItem(toolGroups, secondaryIndex);

    if (currentItem) {
      const cachedSubItems = params.toolSubItemsCache[currentItem.key];
      const subItemsCount = cachedSubItems?.data?.length || currentItem?.subItems?.length || 0;
      setTertiaryIndex((prev) => (prev > 0 ? prev - 1 : subItemsCount - 1));
    }
    return true;
  } else if (isSecondaryFocused) {
    // 在二级菜单中导航
    event?.preventDefault();
    event?.stopPropagation();
    const toolGroups = selectedSkillType ? getToolCategories(selectedSkillType) : [];
    const totalItems = getFlatItemsCount(toolGroups);
    setSecondaryIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
    // 切换二级菜单项时重置三级菜单索引
    setTertiaryIndex(-1);
    return true; // 阻止默认的typeahead行为
  }
  return false; // 允许主菜单的默认行为
};

/**
 * 下键处理：在二级菜单或三级菜单中向下导航
 */
export const handleArrowDown = (
  event: KeyboardEvent | null,
  params: KeyboardHandlerParams
): boolean => {
  const {
    secondaryIndex,
    tertiaryIndex,
    selectedSkillType,
    getToolCategories,
    setSecondaryIndex,
    setTertiaryIndex
  } = params;

  const isSecondaryFocused = secondaryIndex >= 0 && tertiaryIndex < 0;
  const isTertiaryFocused = tertiaryIndex >= 0;

  if (isTertiaryFocused) {
    // 在三级菜单中导航
    event?.preventDefault();
    event?.stopPropagation();
    const toolGroups = selectedSkillType ? getToolCategories(selectedSkillType) : [];
    const currentItem = getCurrentSecondaryItem(toolGroups, secondaryIndex);

    if (currentItem) {
      const cachedSubItems = params.toolSubItemsCache[currentItem.key];
      const subItemsCount = cachedSubItems?.data?.length || currentItem?.subItems?.length || 0;
      setTertiaryIndex((prev) => (prev < subItemsCount - 1 ? prev + 1 : 0));
    }
    return true;
  } else if (isSecondaryFocused) {
    // 在二级菜单中导航
    event?.preventDefault();
    event?.stopPropagation();
    const toolGroups = selectedSkillType ? getToolCategories(selectedSkillType) : [];
    const totalItems = getFlatItemsCount(toolGroups);
    setSecondaryIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
    // 切换二级菜单项时重置三级菜单索引
    setTertiaryIndex(-1);
    return true; // 阻止默认的typeahead行为
  }
  return false; // 允许主菜单的默认行为
};

/**
 * 右键处理：从主菜单进入二级菜单，或从二级菜单进入三级菜单
 */
export const handleArrowRight = (
  event: KeyboardEvent | null,
  params: KeyboardHandlerParams
): boolean => {
  const {
    secondaryIndex,
    tertiaryIndex,
    selectedSkillType,
    getToolCategories,
    setSecondaryIndex,
    setTertiaryIndex,
    toolSubItemsCache
  } = params;

  const isMainFocused = secondaryIndex < 0;
  const isSecondaryFocused = secondaryIndex >= 0 && tertiaryIndex < 0;

  if (isMainFocused) {
    // 从主菜单进入二级菜单
    const toolGroups = selectedSkillType ? getToolCategories(selectedSkillType) : [];
    const totalItems = getFlatItemsCount(toolGroups);
    if (totalItems > 0) {
      event?.preventDefault();
      event?.stopPropagation();
      setSecondaryIndex(0); // 设置为0表示进入二级菜单并选中第一项
      return true;
    }
  } else if (isSecondaryFocused) {
    // 从二级菜单进入三级菜单
    const toolGroups = selectedSkillType ? getToolCategories(selectedSkillType) : [];
    const currentItem = getCurrentSecondaryItem(toolGroups, secondaryIndex);

    if (currentItem) {
      const cachedSubItems = toolSubItemsCache[currentItem.key];

      // 检查缓存中的数据或 canOpen 属性
      const hasSubItems =
        (cachedSubItems?.data?.length && cachedSubItems?.data?.length > 0) ||
        (currentItem.canOpen && !cachedSubItems?.error);

      if (hasSubItems) {
        event?.preventDefault();
        event?.stopPropagation();
        setTertiaryIndex(0); // 设置为0表示进入三级菜单并选中第一项
        return true;
      }
    }
  }
  return false;
};

/**
 * 左键处理：从三级菜单返回二级菜单，或从二级菜单返回主菜单
 */
export const handleArrowLeft = (
  event: KeyboardEvent | null,
  params: KeyboardHandlerParams
): boolean => {
  const { secondaryIndex, tertiaryIndex, setSecondaryIndex, setTertiaryIndex } = params;
  const isSecondaryFocused = secondaryIndex >= 0 && tertiaryIndex < 0;
  const isTertiaryFocused = tertiaryIndex >= 0;

  if (isTertiaryFocused) {
    // 从三级菜单返回二级菜单
    event?.preventDefault();
    event?.stopPropagation();
    setTertiaryIndex(-1); // 设置为-1表示返回二级菜单
    return true;
  } else if (isSecondaryFocused) {
    // 从二级菜单返回主菜单
    event?.preventDefault();
    event?.stopPropagation();
    setSecondaryIndex(-1); // 设置为-1表示返回主菜单
    return true;
  }
  return false;
};

/**
 * 根据扁平化索引获取对应的选项
 */
const getFlatItemByIndex = (
  toolGroups: SkillToolCategory[],
  targetIndex: number
): { key: string; name: string; avatar: string; canOpen?: boolean } | null => {
  let currentIndex = 0;

  for (const group of toolGroups) {
    for (const item of group.list) {
      if (currentIndex === targetIndex) {
        return item;
      }
      currentIndex++;
    }
  }

  return null;
};

/**
 * 回车键处理：选择二级菜单或三级菜单中的选项
 */
export const handleEnter = (
  event: KeyboardEvent | null,
  params: KeyboardHandlerParams
): boolean => {
  const {
    secondaryIndex,
    tertiaryIndex,
    selectedSkillType,
    editor,
    getToolCategories,
    resetMenuState
  } = params;

  const isSecondaryFocused = secondaryIndex >= 0 && tertiaryIndex < 0;
  const isTertiaryFocused = tertiaryIndex >= 0;

  if (isTertiaryFocused) {
    // 选择三级菜单项
    const toolGroups = selectedSkillType ? getToolCategories(selectedSkillType) : [];
    const currentItem = getCurrentSecondaryItem(toolGroups, secondaryIndex);

    let selectedSubItem = null;
    if (currentItem) {
      const cachedSubItems = params.toolSubItemsCache[currentItem.key];
      const subItems = cachedSubItems?.data || currentItem?.subItems;
      selectedSubItem = subItems?.[tertiaryIndex];
    }

    if (selectedSubItem && currentItem && params.onAddToolFromEditor) {
      event?.preventDefault();
      event?.stopPropagation();

      // 调用回调添加工具并获取instanceId
      const instanceId = params.onAddToolFromEditor({
        toolKey: currentItem.key,
        toolName: currentItem.name,
        toolAvatar: currentItem.avatar,
        parentKey: currentItem.key,
        subItemKey: selectedSubItem.key,
        subItemLabel: selectedSubItem.label
      });

      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        // 手动清除 @ 触发器
        const anchorNode = selection.anchor.getNode();
        const anchorOffset = selection.anchor.offset;

        if (anchorNode.getTextContent) {
          const textContent = anchorNode.getTextContent();
          const beforeCursor = textContent.slice(0, anchorOffset);
          const triggerIndex = beforeCursor.lastIndexOf('@');

          if (triggerIndex !== -1) {
            // 删除从 @ 开始到光标位置的文本
            selection.anchor.set(anchorNode.getKey(), triggerIndex, 'text');
            selection.focus.set(anchorNode.getKey(), anchorOffset, 'text');
            selection.removeText();
          }
        }

        // 插入工具实例ID
        selection.insertNodes([$createTextNode(`{{@${instanceId}@}}`)]);
        // 插入完成后重置菜单状态
        resetMenuState();
      });
      return true;
    }
  } else if (isSecondaryFocused) {
    // 选择二级菜单项
    const toolGroups = selectedSkillType ? getToolCategories(selectedSkillType) : [];
    const totalItems = getFlatItemsCount(toolGroups);
    if (totalItems > 0 && params.onAddToolFromEditor) {
      event?.preventDefault();
      event?.stopPropagation();
      const selectedOption = getFlatItemByIndex(toolGroups, secondaryIndex);
      if (selectedOption) {
        // 调用回调添加工具并获取instanceId
        const instanceId = params.onAddToolFromEditor({
          toolKey: selectedOption.key,
          toolName: selectedOption.name,
          toolAvatar: selectedOption.avatar
        });

        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;

          // 手动清除 @ 触发器
          const anchorNode = selection.anchor.getNode();
          const anchorOffset = selection.anchor.offset;

          if (anchorNode.getTextContent) {
            const textContent = anchorNode.getTextContent();
            const beforeCursor = textContent.slice(0, anchorOffset);
            const triggerIndex = beforeCursor.lastIndexOf('@');

            if (triggerIndex !== -1) {
              // 删除从 @ 开始到光标位置的文本
              selection.anchor.set(anchorNode.getKey(), triggerIndex, 'text');
              selection.focus.set(anchorNode.getKey(), anchorOffset, 'text');
              selection.removeText();
            }
          }

          // 插入工具实例ID
          selection.insertNodes([$createTextNode(`{{@${instanceId}@}}`)]);
          // 插入完成后重置菜单状态
          resetMenuState();
        });
      }
      return true;
    }
  }
  return false;
};

/**
 * 创建键盘事件处理器工厂函数
 * 返回一个包含所有键盘处理函数的对象
 */
export const createKeyboardHandlers = (params: KeyboardHandlerParams) => ({
  handleArrowUp: (event: KeyboardEvent | null) => handleArrowUp(event, params),
  handleArrowDown: (event: KeyboardEvent | null) => handleArrowDown(event, params),
  handleArrowRight: (event: KeyboardEvent | null) => handleArrowRight(event, params),
  handleArrowLeft: (event: KeyboardEvent | null) => handleArrowLeft(event, params),
  handleEnter: (event: KeyboardEvent | null) => handleEnter(event, params)
});
