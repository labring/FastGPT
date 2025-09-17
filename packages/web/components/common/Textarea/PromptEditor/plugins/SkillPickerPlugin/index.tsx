import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin } from '@lexical/react/LexicalTypeaheadMenuPlugin';
import type {
  TextNode
} from 'lexical';
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_SPACE_COMMAND
} from 'lexical';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { useCallback, useEffect, useRef, useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useBasicTypeaheadTriggerMatch } from '../../utils';
import Avatar from '../../../../Avatar';
import MyIcon from '../../../../Icon';
import { useRequest2 } from '../../../../../../hooks/useRequest';
import MyBox from '../../../../MyBox';

export type SkillOptionType = {
  key: string;
  label: string;
  icon?: string;
  parentKey?: string;
  canOpen?: boolean;
  categoryType?: string;
  categoryLabel?: string;
};

const getDisplayState = ({
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
        skillOptionList.some(
          (subItem) => subItem.parentKey === item.key && selectedKey === subItem.key
        ))
  );

  return {
    isCurrentFocus,
    hasSelectedChild
  };
};

export default function SkillPickerPlugin({
  skillOptionList,
  isFocus,
  onAddToolFromEditor,
  selectedKey,
  setSelectedKey,
  queryString,
  setQueryString,
  loadFolderContent,
  removeFolderContent,
  loadedFolders
}: {
  skillOptionList: SkillOptionType[];
  isFocus: boolean;
  onAddToolFromEditor?: (toolKey: string) => Promise<string>;
  selectedKey: string;
  setSelectedKey: (key: string) => void;
  queryString?: string | null;
  setQueryString?: (value: string | null) => void;
  loadFolderContent?: (folderId: string) => Promise<void>;
  removeFolderContent?: (folderId: string) => void;
  loadedFolders?: Set<string>;
}) {
  const [editor] = useLexicalComposerContext();

  const highlightedRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const nextIndexRef = useRef<number | null>(null);

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('@', {
    minLength: 0
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      const currentRef = highlightedRefs.current[selectedKey];
      if (currentRef) {
        currentRef.scrollIntoView({
          behavior: 'auto',
          block: 'nearest'
        });
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [selectedKey]);

  const { runAsync: addTool, loading: isAddToolLoading } = useRequest2(
    async (selectedOption: SkillOptionType) => {
      if ((selectedOption.parentKey || queryString) && onAddToolFromEditor) {
        return await onAddToolFromEditor(selectedOption.key);
      } else {
        return '';
      }
    },
    {
      manual: true
    }
  );

  const currentOptions = useMemo(() => {
    const currentOption = skillOptionList.find((option) => option.key === selectedKey);
    if (!currentOption) {
      return skillOptionList.filter((item) => !item.parentKey);
    }

    // 对于 AppSkill，返回所有可见的选项（递归展开的树形结构）
    const isInAppTree = (optionKey: string): boolean => {
      const option = skillOptionList.find((opt) => opt.key === optionKey);
      if (!option) return false;
      if (option.parentKey === 'app') return true;
      if (option.parentKey) return isInAppTree(option.parentKey);
      return false;
    };

    if (isInAppTree(selectedKey)) {
      const getVisibleOptions = (parentKey: string): any[] => {
        const children = skillOptionList.filter((opt) => opt.parentKey === parentKey);
        const result: any[] = [];

        children.forEach((child) => {
          result.push({ ...child, setRefElement: () => {} });
          // 如果有子项（已加载），递归添加
          const hasChildren = skillOptionList.some((opt) => opt.parentKey === child.key);
          if (hasChildren) {
            result.push(...getVisibleOptions(child.key));
          }
        });

        return result;
      };

      return getVisibleOptions('app');
    }

    // 对于 ToolSkill，保持原有逻辑
    const filteredOptions = skillOptionList.filter(
      (item) => item.parentKey === currentOption.parentKey
    );

    return filteredOptions.map((option) => ({
      ...option,
      setRefElement: () => {}
    }));
  }, [skillOptionList, selectedKey]);

  // overWrite arrow keys
  useEffect(() => {
    if (!isFocus || queryString === null) return;
    const removeRightCommand = editor.registerCommand(
      KEY_ARROW_RIGHT_COMMAND,
      (e: KeyboardEvent) => {
        const currentOption = skillOptionList.find((option) => option.key === selectedKey);
        if (!currentOption) return false;

        const firstChildOption = skillOptionList.find(
          (item) => item.parentKey === currentOption.key
        );
        if (firstChildOption) {
          setSelectedKey(firstChildOption.key);
          nextIndexRef.current = 0;

          e.preventDefault();
          e.stopPropagation();
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );
    const removeLeftCommand = editor.registerCommand(
      KEY_ARROW_LEFT_COMMAND,
      (e: KeyboardEvent) => {
        const currentOption = skillOptionList.find((option) => option.key === selectedKey);
        if (!currentOption) return false;

        if (currentOption.parentKey) {
          const parentOption = skillOptionList.find((item) => item.key === currentOption.parentKey);
          if (parentOption) {
            const parentSiblings = skillOptionList.filter(
              (item) => item.parentKey === parentOption.parentKey
            );
            const parentIndexInSiblings = parentSiblings.findIndex(
              (item) => item.key === parentOption.key
            );
            nextIndexRef.current = parentIndexInSiblings >= 0 ? parentIndexInSiblings : 0;

            setSelectedKey(parentOption.key);
            e.preventDefault();
            e.stopPropagation();
            return true;
          }
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    const removeSpaceCommand = editor.registerCommand(
      KEY_SPACE_COMMAND,
      (e: KeyboardEvent) => {
        // 只在菜单聚焦且查询字符串不为空时处理
        if (!isFocus || queryString === null) return false;

        const currentOption = skillOptionList.find((option) => option.key === selectedKey);
        if (!currentOption) return false;

        console.log(
          'Space key pressed, currentOption:',
          currentOption,
          'loadFolderContent:',
          !!loadFolderContent,
          'removeFolderContent:',
          !!removeFolderContent,
          'loadedFolders:',
          loadedFolders
        );

        // 如果是文件夹且有相关函数
        if (currentOption.canOpen && loadFolderContent && removeFolderContent && loadedFolders) {
          // 检查是否已加载
          if (!loadedFolders.has(selectedKey)) {
            console.log('Loading folder:', selectedKey);
            loadFolderContent(selectedKey);
          } else {
            console.log('Collapsing folder:', selectedKey);
            removeFolderContent(selectedKey);
          }
          e.preventDefault();
          e.stopPropagation();
          return true; // 阻止默认的空格插入行为
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    return () => {
      removeRightCommand();
      removeLeftCommand();
      removeSpaceCommand();
    };
  }, [
    editor,
    isFocus,
    queryString,
    selectedKey,
    skillOptionList,
    setSelectedKey,
    loadFolderContent,
    removeFolderContent,
    loadedFolders
  ]);

  const onSelectOption = useCallback(
    async (
      selectedOption: SkillOptionType,
      nodeToRemove: TextNode | null,
      closeMenu: () => void
    ) => {
      const skillId = await addTool(selectedOption);
      if (!skillId) {
        return;
      }

      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const nodes = selection.getNodes();
        nodes.forEach((node) => {
          if ($isTextNode(node)) {
            const text = node.getTextContent();
            const atIndex = text.lastIndexOf('@');
            if (atIndex !== -1) {
              const queryLength = queryString ? queryString.length : 0;
              const deleteLength = 1 + queryLength;
              const beforeAt = text.substring(0, atIndex);
              const afterQuery = text.substring(atIndex + deleteLength);
              node.setTextContent(beforeAt + afterQuery);

              const newOffset = beforeAt.length;
              node.select(newOffset, newOffset);
            }
          }
        });

        selection.insertNodes([$createTextNode(`{{@${skillId}@}}`)]);
        closeMenu();
      });
    },
    [editor, addTool, queryString]
  );

  const menuOptions = useMemo(() => {
    return currentOptions.map((option) => ({
      ...option,
      setRefElement: () => {}
    }));
  }, [currentOptions]);

  const handleQueryChange = useCallback(
    (() => {
      let timeout: NodeJS.Timeout;
      return (query: string | null) => {
        if (setQueryString) {
          clearTimeout(timeout);
          if (!query?.trim()) {
            setQueryString(query);
            return;
          }
          timeout = setTimeout(() => setQueryString(query), 300);
        }
      };
    })(),
    [setQueryString]
  );

  return (
    <LexicalTypeaheadMenuPlugin
      onQueryChange={handleQueryChange}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={menuOptions}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex: currentSelectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) => {
        if (currentOptions.length === 0) {
          return null;
        }
        if (anchorElementRef.current === null || !isFocus) {
          return null;
        }

        if (nextIndexRef.current !== null) {
          setHighlightedIndex(nextIndexRef.current);
          nextIndexRef.current = null;
        }

        const currentOption = currentOptions[currentSelectedIndex || 0] || currentOptions[0];

        if (currentOption && currentOption.key !== selectedKey) {
          setSelectedKey(currentOption.key);
        }

        // 判断层级：没有 parentKey 的是顶级，有 parentKey 的根据父级判断层级
        const getNodeDepth = (nodeKey: string): number => {
          const node = skillOptionList.find((opt) => opt.key === nodeKey);
          if (!node?.parentKey) return 0;
          return 1 + getNodeDepth(node.parentKey);
        };

        const currentDepth = currentOption ? getNodeDepth(currentOption.key) : 0;

        const selectedSkillKey = (() => {
          if (currentDepth === 0) {
            return currentOption?.key;
          } else if (currentOption?.parentKey) {
            if (currentDepth === 1) {
              return currentOption.parentKey;
            } else if (currentDepth === 2) {
              const parentOption = skillOptionList.find(
                (item) => item.key === currentOption.parentKey
              );
              return parentOption?.parentKey;
            }
          }
          return null;
        })();
        const selectedToolKey = (() => {
          // AppSkill 不需要第三级菜单
          if (selectedSkillKey === 'app') {
            return null;
          }

          if (currentDepth === 1) {
            return currentOption?.key;
          } else if (currentDepth === 2) {
            return currentOption?.parentKey;
          }
          return null;
        })();

        return ReactDOM.createPortal(
          <Flex position="relative" align="flex-start" zIndex={99999}>
            {/* 一级菜单 */}
            <MyBox
              p={1.5}
              borderRadius={'sm'}
              w={queryString ? '200px' : '160px'}
              boxShadow={'0 4px 10px 0 rgba(19, 51, 107, 0.10), 0 0 1px 0 rgba(19, 51, 107, 0.10)'}
              bg={'white'}
              flexShrink={0}
              isLoading={isAddToolLoading}
            >
              {skillOptionList
                .filter((option) => !option.parentKey)
                .map((skillOption) => {
                  const { isCurrentFocus, hasSelectedChild } = getDisplayState({
                    selectedKey,
                    skillOptionList,
                    skillOption
                  });
                  return (
                    <Flex
                      key={skillOption.key}
                      px={2}
                      py={1.5}
                      gap={2}
                      borderRadius={'4px'}
                      cursor={'pointer'}
                      ref={(el) => {
                        highlightedRefs.current[skillOption.key] = el;
                      }}
                      {...(isCurrentFocus || hasSelectedChild
                        ? {
                            bg: '#1118240D'
                          }
                        : {
                            bg: 'white'
                          })}
                      _hover={{
                        bg: '#1118240D'
                      }}
                      onMouseDown={(e) => {
                        const menuOption = menuOptions.find(
                          (option) => option.key === skillOption.key
                        );
                        menuOption && selectOptionAndCleanUp(menuOption);
                      }}
                    >
                      <Avatar src={skillOption.icon} w={'16px'} borderRadius={'3px'} />
                      <Box
                        color={isCurrentFocus ? 'primary.700' : 'myGray.600'}
                        fontSize={'12px'}
                        fontWeight={'medium'}
                        letterSpacing={'0.5px'}
                        flex={1}
                      >
                        {skillOption.label}
                      </Box>
                    </Flex>
                  );
                })}
            </MyBox>

            {/* 二级菜单 */}
            {selectedSkillKey && !queryString && (
              <MyBox
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
                isLoading={isAddToolLoading}
              >
                {(() => {
                  const secondaryOptions = skillOptionList.filter(
                    (item) => item.parentKey === selectedSkillKey
                  );

                  // App 的特殊渲染：递归显示树形结构
                  if (selectedSkillKey === 'app') {
                    // 递归渲染函数
                    const renderAppTree = (
                      parentKey: string,
                      depth: number = 0
                    ): React.ReactNode[] => {
                      const children = skillOptionList.filter((opt) => opt.parentKey === parentKey);
                      const results: React.ReactNode[] = [];

                      children.forEach((option) => {
                        const { isCurrentFocus, hasSelectedChild } = getDisplayState({
                          selectedKey,
                          skillOptionList,
                          skillOption: option
                        });

                        // 渲染当前项
                        results.push(
                          <Flex
                            key={option.key}
                            px={2}
                            py={1.5}
                            gap={2}
                            pl={2 + depth * 4} // 根据深度缩进
                            borderRadius={'4px'}
                            cursor={'pointer'}
                            ref={(el) => {
                              highlightedRefs.current[option.key] = el;
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const menuOption = skillOptionList.find(
                                (item) => item.key === option.key
                              );
                              menuOption &&
                                selectOptionAndCleanUp({ ...menuOption, setRefElement: () => {} });
                            }}
                            {...(isCurrentFocus || hasSelectedChild
                              ? {
                                  bg: '#1118240D'
                                }
                              : {
                                  bg: 'white'
                                })}
                            _hover={{
                              bg: '#1118240D'
                            }}
                          >
                            {/* 文件夹展开/折叠图标 */}
                            {option.canOpen && (
                              <MyIcon
                                name={'core/chat/chevronRight'}
                                w={'12px'}
                                color={'myGray.400'}
                                transform={
                                  skillOptionList.some((child) => child.parentKey === option.key)
                                    ? 'rotate(90deg)'
                                    : 'none'
                                }
                              />
                            )}
                            <Avatar src={option.icon} w={'16px'} borderRadius={'3px'} />
                            <Box
                              color={isCurrentFocus ? 'primary.700' : 'myGray.600'}
                              fontSize={'12px'}
                              fontWeight={'medium'}
                              letterSpacing={'0.5px'}
                              flex={1}
                            >
                              {option.label}
                            </Box>
                          </Flex>
                        );

                        // 如果有子项，递归渲染
                        const childItems = renderAppTree(option.key, depth + 1);
                        results.push(...childItems);
                      });

                      return results;
                    };

                    return renderAppTree('app');
                  }

                  // Organize by category
                  const categories = new Map();
                  secondaryOptions.forEach((item) => {
                    if (item.categoryType && item.categoryLabel) {
                      if (!categories.has(item.categoryType)) {
                        categories.set(item.categoryType, {
                          label: item.categoryLabel,
                          options: []
                        });
                      }
                      categories.get(item.categoryType).options.push(item);
                    }
                  });

                  return Array.from(categories.entries()).map(([categoryType, categoryData]) => (
                    <Box key={categoryType} mb={3}>
                      <Box fontSize={'12px'} fontWeight={'600'} color={'myGray.900'} mb={1} px={2}>
                        {categoryData.label}
                      </Box>
                      {categoryData.options.map((option: SkillOptionType) => {
                        const { isCurrentFocus, hasSelectedChild } = getDisplayState({
                          selectedKey,
                          skillOptionList,
                          skillOption: option
                        });
                        return (
                          <Flex
                            key={option.key}
                            px={2}
                            py={1.5}
                            gap={2}
                            borderRadius={'4px'}
                            cursor={'pointer'}
                            ref={(el) => {
                              highlightedRefs.current[option.key] = el;
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const menuOption = skillOptionList.find(
                                (item) => item.key === option.key
                              );
                              menuOption &&
                                selectOptionAndCleanUp({ ...menuOption, setRefElement: () => {} });
                            }}
                            {...(isCurrentFocus || hasSelectedChild
                              ? {
                                  bg: '#1118240D'
                                }
                              : {
                                  bg: 'white'
                                })}
                            _hover={{
                              bg: '#1118240D'
                            }}
                          >
                            <Avatar src={option.icon} w={'16px'} borderRadius={'3px'} />
                            <Box
                              color={isCurrentFocus ? 'primary.700' : 'myGray.600'}
                              fontSize={'12px'}
                              fontWeight={'medium'}
                              letterSpacing={'0.5px'}
                              flex={1}
                            >
                              {option.label}
                            </Box>
                            {option.canOpen && (
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
                  ));
                })()}
              </MyBox>
            )}

            {/* 三级菜单 */}
            {selectedToolKey &&
              (() => {
                const tertiaryOptions = skillOptionList.filter(
                  (option) => option.parentKey === selectedToolKey
                );

                if (tertiaryOptions.length > 0) {
                  return (
                    <MyBox
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
                      isLoading={isAddToolLoading}
                    >
                      {tertiaryOptions.map((option: SkillOptionType) => (
                        <Flex
                          key={option.key}
                          px={2}
                          py={1.5}
                          gap={2}
                          borderRadius={'4px'}
                          cursor={'pointer'}
                          ref={(el) => {
                            highlightedRefs.current[option.key] = el;
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const menuOption = skillOptionList.find(
                              (item) => item.key === option.key
                            );
                            menuOption &&
                              selectOptionAndCleanUp({ ...menuOption, setRefElement: () => {} });
                          }}
                          {...(selectedKey === option.key
                            ? {
                                bg: '#1118240D'
                              }
                            : {
                                bg: 'white'
                              })}
                          _hover={{
                            bg: '#1118240D'
                          }}
                        >
                          <Box flex={1}>
                            <Box
                              color={selectedKey === option.key ? 'primary.700' : 'myGray.600'}
                              fontSize={'12px'}
                              fontWeight={'medium'}
                              letterSpacing={'0.5px'}
                            >
                              {option.label}
                            </Box>
                          </Box>
                        </Flex>
                      ))}
                    </MyBox>
                  );
                }
                return null;
              })()}
          </Flex>,
          anchorElementRef.current
        );
      }}
    />
  );
}
