import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin } from '@lexical/react/LexicalTypeaheadMenuPlugin';
import type { TextNode } from 'lexical';
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND
} from 'lexical';
import * as React from 'react';
import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import * as ReactDOM from 'react-dom';
import { Box, Flex } from '@chakra-ui/react';
import { useBasicTypeaheadTriggerMatch } from '../../utils';
import Avatar from '../../../../Avatar';
import MyIcon from '../../../../Icon';
import { buildIndexedOptions, getLevel, getSkillDisplayState, getToolDisplayState } from './utils';
import type {
  EditorSkillPickerType,
  SkillOptionType,
  SkillToolItem,
  SkillSubToolItem
} from './type';

export default function SkillPickerPlugin({
  skills,
  isFocus,
  onLoadSubItems,
  onAddToolFromEditor
}: {
  skills: EditorSkillPickerType[];
  isFocus: boolean;
  onLoadSubItems?: (toolId: string) => Promise<SkillSubToolItem[]>;
  onAddToolFromEditor?: (toolKey: string) => Promise<string>;
}) {
  const [editor] = useLexicalComposerContext();

  const [queryString, setQueryString] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  const highlightedRefs = useRef<{ [index: number]: HTMLDivElement | null }>({});

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('@', {
    minLength: 0
  });

  useEffect(() => {
    const currentRef = highlightedRefs.current[selectedIndex];
    if (currentRef) {
      currentRef.scrollIntoView({
        behavior: 'auto',
        block: 'nearest'
      });
    }
  }, [selectedIndex]);

  const [toolSubItems, setToolSubItems] = useState<{
    [toolKey: string]: SkillSubToolItem[];
  }>({});

  const { skillOptions, levelRanges } = useMemo(() => {
    return buildIndexedOptions(skills, toolSubItems);
  }, [skills, toolSubItems]);
  const skillOptionList = Array.from(skillOptions.values());
  const currentOptions = useMemo(() => {
    const currentOption = skillOptions.get(selectedIndex);
    const currentLevel = getLevel(selectedIndex, levelRanges);

    return (() => {
      if (currentLevel === 'primary') {
        return skillOptionList.filter((item) => item.level === 'primary');
      } else if (currentLevel === 'secondary') {
        return skillOptionList.filter(
          (item) => item.level === 'secondary' && item.parentIndex === currentOption?.parentIndex
        );
      } else if (currentLevel === 'tertiary') {
        return skillOptionList.filter(
          (item) => item.level === 'tertiary' && item.parentIndex === currentOption?.parentIndex
        );
      } else {
        return [];
      }
    })();
  }, [skillOptions, selectedIndex, levelRanges]);

  useEffect(() => {
    const loadSubItems = async (toolId: string) => {
      if (!onLoadSubItems || toolSubItems[toolId]) return;
      const subItems = await onLoadSubItems(toolId);
      setToolSubItems((prev) => ({
        ...prev,
        [toolId]: subItems
      }));
    };

    const currentOption = skillOptions.get(selectedIndex);
    if (currentOption?.level === 'secondary' && currentOption.toolItem?.canOpen) {
      const toolKey = currentOption.toolItem.key;
      if (!toolSubItems[toolKey]) {
        loadSubItems(toolKey);
      }
    }
  }, [selectedIndex, skillOptions, toolSubItems, onLoadSubItems]);

  // TODO: 没有list时，不覆盖操作
  useEffect(() => {
    if (!isFocus) return;
    const removeRightCommand = editor.registerCommand(
      KEY_ARROW_RIGHT_COMMAND,
      (e: KeyboardEvent) => {
        const currentVisibleIndex = skillOptions.get(selectedIndex)?.index;
        if (currentVisibleIndex === undefined) return false;

        const currentLevel = getLevel(selectedIndex, levelRanges);
        const nextLevel = currentLevel === 'primary' ? 'secondary' : 'tertiary';

        const currentOption = skillOptions.get(selectedIndex);
        const firstToolOption = skillOptionList.find(
          (item) => item.level === nextLevel && item.parentIndex === currentOption?.index
        );
        const targetVisibleIndex = firstToolOption?.index;
        if (targetVisibleIndex !== undefined) {
          setSelectedIndex(targetVisibleIndex);
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
        const currentVisibleIndex = skillOptions.get(selectedIndex)?.index;
        if (currentVisibleIndex === undefined) return false;

        const currentOption = skillOptions.get(selectedIndex);
        if (currentOption?.parentIndex !== undefined) {
          const targetVisibleIndex = currentOption.parentIndex;
          if (targetVisibleIndex !== undefined) {
            setSelectedIndex(targetVisibleIndex);
            e.preventDefault();
            e.stopPropagation();
            return true;
          }
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );
    return () => {
      removeRightCommand();
      removeLeftCommand();
    };
  }, [editor, isFocus, queryString, selectedIndex, skillOptions, levelRanges]);

  const onSelectOption = useCallback(
    async (
      selectedOption: SkillOptionType,
      nodeToRemove: TextNode | null,
      closeMenu: () => void
    ) => {
      let instanceId: string;

      if (selectedOption.level === 'secondary' && selectedOption.toolItem && onAddToolFromEditor) {
        instanceId = await onAddToolFromEditor(selectedOption.toolItem.key);
      } else if (
        selectedOption.level === 'tertiary' &&
        selectedOption.subItem &&
        onAddToolFromEditor
      ) {
        instanceId = await onAddToolFromEditor(selectedOption.subItem.key);
      } else {
        return;
      }

      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        if (nodeToRemove) {
          nodeToRemove.remove();
        }
        selection.insertNodes([$createTextNode(`{{@${instanceId}@}}`)]);
      });

      setSelectedIndex(0);
      closeMenu();
    },
    [editor, onAddToolFromEditor, skillOptions]
  );

  return (
    <LexicalTypeaheadMenuPlugin
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption as any}
      triggerFn={checkForTriggerMatch}
      options={currentOptions as any}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex: currentSelectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) => {
        if (anchorElementRef.current == null) {
          return null;
        }

        // TODO: 优化溢出长度，currentSelectedIndex和selectedIndex的转换
        const currentOption = currentOptions[currentSelectedIndex || 0] || currentOptions[0];
        setSelectedIndex(currentOption.index);

        const currentLevel = currentOption.level;

        const selectedSkillKey = (() => {
          if (currentLevel === 'primary') {
            return currentOption?.skillType?.key;
          } else if (currentOption?.parentIndex !== undefined) {
            if (currentLevel === 'secondary') {
              return skillOptions.get(currentOption.parentIndex)?.skillType?.key;
            } else if (currentLevel === 'tertiary') {
              const parentOption = skillOptions.get(currentOption.parentIndex);
              return parentOption?.parentIndex !== undefined
                ? skillOptions.get(parentOption.parentIndex)?.skillType?.key
                : null;
            }
          }
          return null;
        })();
        const selectedToolKey = (() => {
          if (currentLevel === 'secondary') {
            return currentOption?.toolItem?.key;
          } else if (currentLevel === 'tertiary') {
            return currentOption?.parentIndex !== undefined
              ? skillOptions.get(currentOption.parentIndex)?.toolItem?.key
              : null;
          }
          return null;
        })();

        return anchorElementRef.current && isFocus
          ? ReactDOM.createPortal(
              <Flex position="relative" align="flex-start" zIndex={99999}>
                {/* 一级菜单 */}
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
                  {skillOptionList
                    .filter((option) => option.level === 'primary')
                    .map((skillOption) => {
                      const displayState = getSkillDisplayState({
                        selectedIndex,
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
                            highlightedRefs.current[skillOption.index] = el;
                          }}
                          onClick={() => {
                            // selectOptionAndCleanUp(skillOption);
                          }}
                          {...(displayState.isCurrentFocus
                            ? {
                                bg: '#1118240D'
                              }
                            : displayState.hasSelectedChild
                              ? {
                                  bg: '#1118240D'
                                }
                              : {
                                  bg: 'white'
                                })}
                          _hover={{
                            bg: '#1118240D',
                            color: 'primary.700'
                          }}
                        >
                          <Avatar
                            src={skillOption.skillType?.icon}
                            w={'16px'}
                            borderRadius={'3px'}
                          />
                          <Box
                            color={displayState.isCurrentFocus ? 'primary.700' : 'myGray.600'}
                            fontSize={'12px'}
                            fontWeight={'medium'}
                            letterSpacing={'0.5px'}
                            flex={1}
                          >
                            {skillOption.skillType?.label}
                          </Box>
                        </Flex>
                      );
                    })}
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
                  {(() => {
                    const skillIndex = skillOptionList.find(
                      (item) => item.level === 'primary' && item.skillType?.key === selectedSkillKey
                    )?.index;
                    const secondaryOptions = skillOptionList.filter(
                      (item) => item.level === 'secondary' && item.parentIndex === skillIndex
                    );

                    // 按分类组织
                    const categories = new Map();
                    secondaryOptions.forEach((item) => {
                      const toolItem = item.toolItem;
                      if (!toolItem) return;

                      const skill = skills.find((skill) => skill.key === selectedSkillKey);
                      const category = skill?.toolCategories?.find((item) =>
                        item.list.some((toolItem: SkillToolItem) => toolItem.key === toolItem.key)
                      );

                      if (category) {
                        if (!categories.has(category.type)) {
                          categories.set(category.type, {
                            label: category.label,
                            options: []
                          });
                        }
                        categories.get(category.type).options.push(item);
                      }
                    });

                    return Array.from(categories.entries()).map(([categoryType, categoryData]) => (
                      <Box key={categoryType} mb={3}>
                        <Box
                          fontSize={'12px'}
                          fontWeight={'600'}
                          color={'myGray.900'}
                          mb={1}
                          px={2}
                        >
                          {categoryData.label}
                        </Box>
                        {categoryData.options.map((option: SkillOptionType) => {
                          const toolDisplayState = getToolDisplayState({
                            selectedIndex,
                            skillOptionList,
                            toolOption: option
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
                                highlightedRefs.current[option.index] = el;
                              }}
                              onClick={() => {
                                // selectOptionAndCleanUp(option);
                              }}
                              {...(toolDisplayState.isCurrentFocus
                                ? {
                                    bg: '#1118240D'
                                  }
                                : toolDisplayState.hasSelectedChild
                                  ? {
                                      bg: '#1118240D'
                                    }
                                  : {
                                      bg: 'white'
                                    })}
                              _hover={{
                                bg: '#1118240D',
                                color: 'primary.700'
                              }}
                            >
                              <Avatar
                                src={option.toolItem?.avatar}
                                w={'16px'}
                                borderRadius={'3px'}
                              />
                              <Box
                                color={
                                  toolDisplayState.isCurrentFocus ? 'primary.700' : 'myGray.600'
                                }
                                fontSize={'12px'}
                                fontWeight={'medium'}
                                letterSpacing={'0.5px'}
                                flex={1}
                              >
                                {option.toolItem?.name}
                              </Box>
                              {option.toolItem?.canOpen && (
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
                </Box>

                {/* 第三级菜单 */}
                {selectedToolKey &&
                  (() => {
                    const toolIndex = skillOptionList.find(
                      (item) => item.level === 'secondary' && item.toolItem?.key === selectedToolKey
                    )?.index;
                    const tertiaryOptions = skillOptionList.filter(
                      (option) => option.level === 'tertiary' && option.parentIndex === toolIndex
                    );

                    if (tertiaryOptions.length > 0) {
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
                          {tertiaryOptions.map((option: SkillOptionType) => (
                            <Flex
                              key={option.key}
                              px={2}
                              py={1.5}
                              gap={2}
                              borderRadius={'4px'}
                              cursor={'pointer'}
                              ref={(el) => {
                                highlightedRefs.current[option.index] = el;
                              }}
                              onClick={() => {
                                // selectOptionAndCleanUp(option);
                              }}
                              {...(selectedIndex === option.index
                                ? {
                                    bg: '#1118240D'
                                  }
                                : {
                                    bg: 'white'
                                  })}
                              _hover={{
                                bg: '#1118240D',
                                color: 'primary.700'
                              }}
                            >
                              <Box flex={1}>
                                <Box
                                  color={
                                    selectedIndex === option.index ? 'primary.700' : 'myGray.600'
                                  }
                                  fontSize={'12px'}
                                  fontWeight={'medium'}
                                  letterSpacing={'0.5px'}
                                >
                                  {option.subItem?.label}
                                </Box>
                                {option.subItem?.description && (
                                  <Box color={'myGray.400'} fontSize={'10px'} mt={0.5}>
                                    {option.subItem.description}
                                  </Box>
                                )}
                              </Box>
                            </Flex>
                          ))}
                        </Box>
                      );
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
