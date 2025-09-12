import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin } from '@lexical/react/LexicalTypeaheadMenuPlugin';
import type { TextNode } from 'lexical';
import {
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ENTER_COMMAND
} from 'lexical';
import * as React from 'react';
import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import * as ReactDOM from 'react-dom';
import { Box, Flex } from '@chakra-ui/react';
import { useBasicTypeaheadTriggerMatch } from '../../utils';
import Avatar from '../../../../Avatar';
import MyIcon from '../../../../Icon';
import { createKeyboardHandlers } from './utils';
import type { OnAddToolFromEditor } from '../../type';
export type SkillSubItem = {
  key: string;
  label: string;
  description?: string;
};

export type SkillToolItem = {
  key: string;
  name: string;
  avatar: string;
  canOpen?: boolean;
  subItems?: SkillSubItem[];
};

export type SkillToolCategory = {
  type: string;
  label: string;
  list: SkillToolItem[];
};

export type EditorSkillPickerType = {
  key: string;
  label: string;
  description?: string;
  icon?: string;
  toolCategories?: SkillToolCategory[];
};

/**
 * 技能选择器插件 - 支持@符号触发的两级菜单技能选择
 * 功能：
 * 1. @符号触发主菜单（应用、知识库、系统工具）
 * 2. 鼠标悬停或键盘导航展开二级菜单
 * 3. 支持键盘导航：上下键选择，左右键切换菜单级别，回车确认
 */
export default function SkillPickerPlugin({
  skills,
  isFocus,
  onLoadSubItems,
  onAddToolFromEditor
}: {
  skills: EditorSkillPickerType[];
  isFocus: boolean;
  onLoadSubItems?: (toolId: string, toolType: string) => Promise<SkillSubItem[]>;
  onAddToolFromEditor?: OnAddToolFromEditor;
}) {
  const [editor] = useLexicalComposerContext();

  // 状态管理
  const [queryString, setQueryString] = useState<string | null>(null); // typeahead查询字符串
  const [primaryIndex, setPrimaryIndex] = useState<number>(0); // 一级菜单当前选中索引
  const [secondaryIndex, setSecondaryIndex] = useState<number>(-1); // 二级菜单索引：-1表示焦点在主菜单，>=0表示焦点在二级菜单
  const [tertiaryIndex, setTertiaryIndex] = useState<number>(-1); // 三级菜单索引：-1表示焦点不在三级菜单，>=0表示焦点在三级菜单

  // 子项缓存状态
  const [toolSubItemsCache, setToolSubItemsCache] = useState<{
    [toolKey: string]: {
      loading: boolean;
      data?: SkillSubItem[];
      error?: string;
    };
  }>({});

  // 根据一级菜单索引计算当前选中的技能类型
  const selectedSkillType = skills[primaryIndex]?.key || null;

  // 引用管理
  const highlightedItemRef = useRef<HTMLDivElement>(null); // 主菜单高亮项引用
  const secondaryHighlightedItemRef = useRef<HTMLDivElement>(null); // 二级菜单高亮项引用
  const tertiaryHighlightedItemRef = useRef<HTMLDivElement>(null); // 三级菜单高亮项引用

  // 统一的重置状态函数
  const resetMenuState = useCallback(() => {
    setPrimaryIndex(0);
    setSecondaryIndex(-1);
    setTertiaryIndex(-1);
  }, []);

  // 加载工具子项的函数
  const loadToolSubItems = useCallback(
    async (toolId: string, toolType: string) => {
      if (!onLoadSubItems || toolSubItemsCache[toolId]) {
        return; // 已经有缓存或没有加载函数
      }

      // 设置加载状态
      setToolSubItemsCache((prev) => ({
        ...prev,
        [toolId]: { loading: true }
      }));

      const subItems = await onLoadSubItems(toolId, toolType);
      setToolSubItemsCache((prev) => ({
        ...prev,
        [toolId]: { loading: false, data: subItems }
      }));
    },
    [onLoadSubItems, toolSubItemsCache]
  );

  // 配置@符号触发器
  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('@', {
    minLength: 0
  });

  // 主菜单选择处理 - 这里只处理主菜单，二级菜单选择在渲染部分处理
  const onSelectOption = useCallback(
    (selectedOption: any, nodeToRemove: TextNode | null, closeMenu: () => void) => {
      if (skills.some((skill) => skill.key === selectedOption.key)) {
        return;
      }
    },
    [editor, skills]
  );

  // 主菜单高亮项滚动到视图
  useEffect(() => {
    // 滚动到当前高亮的主菜单项
    if (highlightedItemRef.current) {
      highlightedItemRef.current.scrollIntoView({
        behavior: 'auto',
        block: 'end'
      });
    }
  }, [primaryIndex]);

  // 二级菜单高亮项滚动到视图
  useEffect(() => {
    // 滚动到当前高亮的二级菜单项
    if (secondaryHighlightedItemRef.current) {
      secondaryHighlightedItemRef.current.scrollIntoView({
        behavior: 'auto',
        block: 'nearest'
      });
    }
  }, [secondaryIndex]);

  // 三级菜单高亮项滚动到视图
  useEffect(() => {
    // 滚动到当前高亮的三级菜单项
    if (tertiaryHighlightedItemRef.current) {
      tertiaryHighlightedItemRef.current.scrollIntoView({
        behavior: 'auto',
        block: 'nearest'
      });
    }
  }, [tertiaryIndex]);

  // 监听二级菜单索引变化，按需加载子项
  useEffect(() => {
    if (secondaryIndex >= 0 && selectedSkillType) {
      const toolCategories =
        skills.find((skill) => skill.key === selectedSkillType)?.toolCategories || [];

      // 构建扁平的工具项列表
      const flatItems: SkillToolItem[] = [];
      toolCategories.forEach((category) => {
        flatItems.push(...category.list);
      });

      const currentItem = flatItems[secondaryIndex];

      // 如果该项 canOpen 且未加载过子项，则加载
      if (currentItem?.canOpen && !toolSubItemsCache[currentItem.key]) {
        // 根据工具的 flowNodeType 或其他特征判断类型
        const toolType = currentItem.key.includes('mcp') ? 'mcp' : 'system';
        loadToolSubItems(currentItem.key, toolType);
      }
    }
  }, [secondaryIndex, selectedSkillType, skills, toolSubItemsCache, loadToolSubItems]);

  // 创建键盘事件处理器
  const keyboardHandlers = useMemo(() => {
    return createKeyboardHandlers({
      selectedSkillType,
      secondaryIndex,
      tertiaryIndex,
      editor,
      getToolCategories: (skillTypeKey: string) =>
        skills.find((skill) => skill.key === skillTypeKey)?.toolCategories || [],
      setSecondaryIndex,
      setTertiaryIndex,
      resetMenuState,
      toolSubItemsCache,
      onAddToolFromEditor
    });
  }, [
    selectedSkillType,
    secondaryIndex,
    tertiaryIndex,
    editor,
    skills,
    setSecondaryIndex,
    setTertiaryIndex,
    resetMenuState,
    toolSubItemsCache,
    onAddToolFromEditor
  ]);
  useEffect(() => {
    if (!isFocus) return;
    const removeUpCommand = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      keyboardHandlers.handleArrowUp,
      COMMAND_PRIORITY_HIGH
    );
    const removeDownCommand = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      keyboardHandlers.handleArrowDown,
      COMMAND_PRIORITY_HIGH
    );
    const removeRightCommand = editor.registerCommand(
      KEY_ARROW_RIGHT_COMMAND,
      keyboardHandlers.handleArrowRight,
      COMMAND_PRIORITY_HIGH
    );
    const removeLeftCommand = editor.registerCommand(
      KEY_ARROW_LEFT_COMMAND,
      keyboardHandlers.handleArrowLeft,
      COMMAND_PRIORITY_HIGH
    );
    const removeEnterCommand = editor.registerCommand(
      KEY_ENTER_COMMAND,
      keyboardHandlers.handleEnter,
      COMMAND_PRIORITY_HIGH
    );
    return () => {
      removeUpCommand();
      removeDownCommand();
      removeRightCommand();
      removeLeftCommand();
      removeEnterCommand();
    };
  }, [editor, isFocus, keyboardHandlers]);

  useEffect(() => {
    if (!isFocus) {
      resetMenuState();
    }
  }, [isFocus]);

  return (
    <LexicalTypeaheadMenuPlugin
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={skills}
      menuRenderFn={(anchorElementRef, { selectedIndex, selectOptionAndCleanUp }) => {
        // 检查锚点元素是否存在
        if (anchorElementRef.current == null) {
          return null;
        }

        // 同步当前选中索引
        if (primaryIndex !== selectedIndex) {
          setPrimaryIndex(selectedIndex || 0);
        }

        // 获取当前技能类型的工具分类
        const toolCategories = selectedSkillType
          ? skills.find((skill) => skill.key === selectedSkillType)?.toolCategories || []
          : [];

        // 只在有技能数据且获得焦点时渲染菜单
        return anchorElementRef.current && skills.length && isFocus
          ? ReactDOM.createPortal(
              <Flex position="relative" align="flex-start" zIndex={99999}>
                {/* 主菜单 */}
                <Box
                  p={1.5}
                  borderRadius={'sm'}
                  w={'160px'}
                  boxShadow={
                    '0 4px 10px 0 rgba(19, 51, 107, 0.10), 0 0 1px 0 rgba(19, 51, 107, 0.10)'
                  }
                  bg={'white'}
                  flexShrink={0}
                >
                  {skills.map((skillType, index) => (
                    <Flex
                      key={skillType.key}
                      px={2}
                      py={1.5}
                      gap={2}
                      borderRadius={'4px'}
                      cursor={'pointer'}
                      ref={primaryIndex === index ? highlightedItemRef : null}
                      {...(selectedIndex === index
                        ? {
                            bg: '#1118240D',
                            color: 'primary.700'
                          }
                        : {
                            bg: 'white',
                            color: 'myGray.600'
                          })}
                      _hover={{
                        bg: '#1118240D',
                        color: 'primary.700'
                      }}
                    >
                      <Avatar src={skillType.icon} w={'16px'} borderRadius={'3px'} />
                      <Box
                        color={'myGray.600'}
                        fontSize={'12px'}
                        fontWeight={'medium'}
                        letterSpacing={'0.5px'}
                        flex={1}
                      >
                        {skillType.label}
                      </Box>
                    </Flex>
                  ))}
                </Box>

                {/* 二级菜单 */}
                <Box
                  ml={2}
                  p={1.5}
                  borderRadius={'sm'}
                  w={'200px'}
                  boxShadow={
                    '0 4px 10px 0 rgba(19, 51, 107, 0.10), 0 0 1px 0 rgba(19, 51, 107, 0.10)'
                  }
                  bg={'white'}
                  flexShrink={0}
                  maxH={'320px'}
                  overflow={'auto'}
                >
                  {toolCategories.length > 0 ? (
                    // 渲染工具分类结构
                    (() => {
                      // 构建扁平的工具项列表用于导航
                      const flatItems = [];
                      toolCategories.forEach((category) => {
                        flatItems.push(...category.list);
                      });

                      let currentFlatIndex = 0;

                      return (
                        <>
                          {toolCategories.map((category) => (
                            <Box key={category.type} mb={3}>
                              <Box
                                fontSize={'12px'}
                                fontWeight={'600'}
                                color={'myGray.900'}
                                mb={1}
                                px={2}
                              >
                                {category.label}
                              </Box>
                              {category.list.map((item) => {
                                const flatIdx = currentFlatIndex++;
                                return (
                                  <Flex
                                    key={item.key}
                                    px={2}
                                    py={1.5}
                                    gap={2}
                                    borderRadius={'4px'}
                                    cursor={'pointer'}
                                    onClick={() => {}}
                                    ref={
                                      secondaryIndex === flatIdx
                                        ? secondaryHighlightedItemRef
                                        : null
                                    }
                                    {...(secondaryIndex === flatIdx
                                      ? {
                                          bg: '#1118240D',
                                          color: 'primary.700'
                                        }
                                      : {
                                          bg: 'white',
                                          color: 'myGray.600'
                                        })}
                                    _hover={{
                                      bg: '#1118240D',
                                      color: 'primary.700'
                                    }}
                                  >
                                    <Avatar src={item.avatar} w={'16px'} borderRadius={'3px'} />
                                    <Box
                                      color={'myGray.600'}
                                      fontSize={'12px'}
                                      fontWeight={'medium'}
                                      letterSpacing={'0.5px'}
                                      flex={1}
                                    >
                                      {item.name}
                                    </Box>
                                    {item.canOpen && (
                                      <MyIcon
                                        name={'core/chat/chevronRight'}
                                        w={'12px'}
                                        color={'myGray.400'}
                                      />
                                    )}
                                  </Flex>
                                );
                              })}
                            </Box>
                          ))}
                        </>
                      );
                    })()
                  ) : (
                    // 无二级选项时显示"暂不支持"
                    <Flex px={2} py={1.5} justifyContent={'center'} alignItems={'center'}>
                      <Box
                        color={'myGray.400'}
                        fontSize={'12px'}
                        fontWeight={'medium'}
                        letterSpacing={'0.5px'}
                      >
                        暂不支持
                      </Box>
                    </Flex>
                  )}
                </Box>

                {/* 第三级菜单 */}
                {(() => {
                  // 获取当前高亮的二级菜单项及其子项
                  if (secondaryIndex >= 0 && toolCategories.length > 0) {
                    // 构建扁平的工具项列表
                    const flatItems: SkillToolItem[] = [];
                    toolCategories.forEach((category) => {
                      flatItems.push(...category.list);
                    });

                    const selectedItem = flatItems[secondaryIndex];
                    const cachedSubItems = toolSubItemsCache[selectedItem?.key || ''];

                    // 显示缓存中的数据、原有的 subItems 或加载状态
                    const subItemsToShow = cachedSubItems?.data || selectedItem?.subItems;
                    const isLoading = cachedSubItems?.loading;
                    const hasError = cachedSubItems?.error;

                    if (selectedItem?.canOpen && (subItemsToShow || isLoading || hasError)) {
                      return (
                        <Box
                          ml={2}
                          p={1.5}
                          borderRadius={'sm'}
                          w={'200px'}
                          boxShadow={
                            '0 4px 10px 0 rgba(19, 51, 107, 0.10), 0 0 1px 0 rgba(19, 51, 107, 0.10)'
                          }
                          bg={'white'}
                          flexShrink={0}
                          maxH={'280px'}
                          overflow={'auto'}
                        >
                          {isLoading ? (
                            // 显示加载状态
                            <Flex
                              px={2}
                              py={3}
                              justifyContent={'center'}
                              alignItems={'center'}
                              gap={2}
                            >
                              <MyIcon name={'common/loading'} w={'14px'} />
                              <Box color={'myGray.500'} fontSize={'12px'}>
                                加载中...
                              </Box>
                            </Flex>
                          ) : hasError ? (
                            // 显示错误状态
                            <Flex
                              px={2}
                              py={3}
                              justifyContent={'center'}
                              alignItems={'center'}
                              flexDirection={'column'}
                              gap={1}
                            >
                              <Box color={'red.500'} fontSize={'12px'} textAlign={'center'}>
                                加载失败
                              </Box>
                              <Box color={'myGray.400'} fontSize={'10px'} textAlign={'center'}>
                                {hasError}
                              </Box>
                            </Flex>
                          ) : subItemsToShow ? (
                            // 显示子项列表
                            subItemsToShow.map((subItem, index) => (
                              <Flex
                                key={subItem.key}
                                px={2}
                                py={1.5}
                                gap={2}
                                borderRadius={'4px'}
                                cursor={'pointer'}
                                onClick={() => {}}
                                ref={tertiaryIndex === index ? tertiaryHighlightedItemRef : null}
                                {...(tertiaryIndex === index
                                  ? {
                                      bg: '#1118240D',
                                      color: 'primary.700'
                                    }
                                  : {
                                      bg: 'white',
                                      color: 'myGray.600'
                                    })}
                                _hover={{
                                  bg: '#1118240D',
                                  color: 'primary.700'
                                }}
                              >
                                <Box flex={1}>
                                  <Box
                                    color={'myGray.600'}
                                    fontSize={'12px'}
                                    fontWeight={'medium'}
                                    letterSpacing={'0.5px'}
                                  >
                                    {subItem.label}
                                  </Box>
                                  {subItem.description && (
                                    <Box color={'myGray.400'} fontSize={'10px'} mt={0.5}>
                                      {subItem.description}
                                    </Box>
                                  )}
                                </Box>
                              </Flex>
                            ))
                          ) : null}
                        </Box>
                      );
                    }
                  }
                  return null;
                })()}
              </Flex>,
              anchorElementRef.current
            )
          : null;
      }}
    />
  );
}
