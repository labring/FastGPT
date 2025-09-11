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
export type SkillToolCategory = {
  type: string;
  label: string;
  list: {
    key: string;
    name: string;
    avatar: string;
    canOpen?: boolean;
  }[];
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
  isFocus
}: {
  skills: EditorSkillPickerType[];
  isFocus: boolean;
}) {
  const [editor] = useLexicalComposerContext();

  // 状态管理
  const [queryString, setQueryString] = useState<string | null>(null); // typeahead查询字符串
  const [primaryIndex, setPrimaryIndex] = useState<number>(0); // 一级菜单当前选中索引
  const [secondaryIndex, setSecondaryIndex] = useState<number>(-1); // 二级菜单索引：-1表示焦点在主菜单，>=0表示焦点在二级菜单

  // 根据一级菜单索引计算当前选中的技能类型
  const selectedSkillType = skills[primaryIndex]?.key || null;

  // 引用管理
  const highlightedItemRef = useRef<HTMLDivElement>(null); // 主菜单高亮项引用
  const secondaryHighlightedItemRef = useRef<HTMLDivElement>(null); // 二级菜单高亮项引用

  // 统一的重置状态函数
  const resetMenuState = useCallback(() => {
    setPrimaryIndex(0);
    setSecondaryIndex(-1);
  }, []);

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

  // 创建键盘事件处理器
  const keyboardHandlers = useMemo(() => {
    return createKeyboardHandlers({
      selectedSkillType,
      secondaryIndex,
      editor,
      getToolCategories: (skillTypeKey: string) =>
        skills.find((skill) => skill.key === skillTypeKey)?.toolCategories || [],
      setSecondaryIndex,
      resetMenuState
    });
  }, [selectedSkillType, secondaryIndex, editor, skills, setSecondaryIndex, resetMenuState]);
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
              <Flex position="relative" align="flex-start">
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
              </Flex>,
              anchorElementRef.current
            )
          : null;
      }}
    />
  );
}
