import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin } from '@lexical/react/LexicalTypeaheadMenuPlugin';
import type { TextNode } from 'lexical';
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND
} from 'lexical';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useBasicTypeaheadTriggerMatch } from '../../utils';
import Avatar from '../../../../Avatar';
import MyIcon from '../../../../Icon';
import { useRequest2 } from '../../../../../../hooks/useRequest';
import { buildSkillOptions, getSkillDisplayState, getToolDisplayState } from './utils';
import type {
  EditorSkillPickerType,
  SkillOptionType,
  SkillToolItem,
  SkillSubToolItem
} from './type';
import MyBox from '../../../../MyBox';

export default function SkillPickerPlugin({
  skills,
  isFocus,
  onAddToolFromEditor,
  selectedKey,
  setSelectedKey
}: {
  skills: EditorSkillPickerType[];
  isFocus: boolean;
  onAddToolFromEditor?: (toolKey: string) => Promise<string>;
  selectedKey: string;
  setSelectedKey: (key: string) => void;
}) {
  const [editor] = useLexicalComposerContext();

  const [queryString, setQueryString] = useState<string | null>(null);

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
      if (selectedOption.level === 'secondary' && selectedOption.toolItem && onAddToolFromEditor) {
        return await onAddToolFromEditor(selectedOption.toolItem.key);
      } else if (
        selectedOption.level === 'tertiary' &&
        selectedOption.subItem &&
        onAddToolFromEditor
      ) {
        return await onAddToolFromEditor(selectedOption.subItem.key);
      } else {
        return '';
      }
    },
    {
      manual: true
    }
  );

  const skillOptionList = useMemo(() => {
    return buildSkillOptions(skills);
  }, [skills]);

  const currentOptions = useMemo(() => {
    if (queryString && queryString.trim()) {
      const searchTerm = queryString.toLowerCase().trim();
      return skillOptionList.filter((option) => {
        if (option.level === 'primary') return false; // filter primary level
        return option.label.toLowerCase().includes(searchTerm.toLowerCase());
      });
    }

    const currentOption = skillOptionList.find((option) => option.key === selectedKey);
    if (!currentOption) {
      return skillOptionList.filter((item) => item.level === 'primary');
    }

    const currentLevel = currentOption.level;
    return skillOptionList.filter(
      (item) => item.level === currentLevel && item.parentKey === currentOption.parentKey
    );
  }, [skillOptionList, selectedKey, queryString]);

  useEffect(() => {
    if (!isFocus || queryString === null) return;
    const removeRightCommand = editor.registerCommand(
      KEY_ARROW_RIGHT_COMMAND,
      (e: KeyboardEvent) => {
        const currentOption = skillOptionList.find((option) => option.key === selectedKey);
        if (!currentOption) return false;

        const currentLevel = currentOption.level;
        const nextLevel = currentLevel === 'primary' ? 'secondary' : 'tertiary';

        const firstChildOption = skillOptionList.find(
          (item) => item.level === nextLevel && item.parentKey === currentOption.key
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
            const parentLevel = parentOption.level;
            const parentSiblings = skillOptionList.filter(
              (item) => item.level === parentLevel && item.parentKey === parentOption.parentKey
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
    return () => {
      removeRightCommand();
      removeLeftCommand();
    };
  }, [editor, isFocus, queryString, selectedKey, skillOptionList]);

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

        // manually remove the @ symbol
        const nodes = selection.getNodes();
        nodes.forEach((node) => {
          if ($isTextNode(node)) {
            const text = node.getTextContent();
            const atIndex = text.lastIndexOf('@');
            if (atIndex !== -1) {
              node.setTextContent(text.substring(0, atIndex));
            }
          }
        });

        selection.insertNodes([$createTextNode(`{{@${skillId}@}}`)]);
        closeMenu();
      });
    },
    [editor, onAddToolFromEditor]
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

        const currentLevel = currentOption.level;

        const selectedSkillKey = (() => {
          if (currentLevel === 'primary') {
            return currentOption?.skillType?.key;
          } else if (currentOption?.parentKey) {
            if (currentLevel === 'secondary') {
              return currentOption.parentKey;
            } else if (currentLevel === 'tertiary') {
              const parentOption = skillOptionList.find(
                (item) => item.key === currentOption.parentKey
              );
              return parentOption?.parentKey;
            }
          }
          return null;
        })();
        const selectedToolKey = (() => {
          if (currentLevel === 'secondary') {
            return currentOption?.toolItem?.key;
          } else if (currentLevel === 'tertiary') {
            return currentOption?.parentKey;
          }
          return null;
        })();

        return ReactDOM.createPortal(
          queryString && queryString.trim() ? (
            <MyBox
              p={1.5}
              borderRadius={'sm'}
              w={'200px'}
              boxShadow={'0 4px 10px 0 rgba(19, 51, 107, 0.10), 0 0 1px 0 rgba(19, 51, 107, 0.10)'}
              bg={'white'}
              maxH={'320px'}
              overflow={'auto'}
              zIndex={99999}
              isLoading={isAddToolLoading}
            >
              {currentOptions.map((option, index) => (
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
                    selectOptionAndCleanUp(option as any);
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
                  <Avatar src={option.toolItem?.avatar} w={'16px'} borderRadius={'3px'} />
                  <Box
                    color={selectedKey === option.key ? 'primary.700' : 'myGray.600'}
                    fontSize={'12px'}
                    fontWeight={'medium'}
                    letterSpacing={'0.5px'}
                    flex={1}
                  >
                    {option.label}
                  </Box>
                </Flex>
              ))}
            </MyBox>
          ) : (
            <Flex position="relative" align="flex-start" zIndex={99999}>
              {/* 一级菜单 */}
              <MyBox
                p={1.5}
                borderRadius={'sm'}
                w={'160px'}
                boxShadow={
                  '0 4px 10px 0 rgba(19, 51, 107, 0.10), 0 0 1px 0 rgba(19, 51, 107, 0.10)'
                }
                bg={'white'}
                flexShrink={0}
                isLoading={isAddToolLoading}
              >
                {skillOptionList
                  .filter((option) => option.level === 'primary')
                  .map((skillOption) => {
                    const displayState = getSkillDisplayState({
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
                          bg: '#1118240D'
                        }}
                      >
                        <Avatar src={skillOption.skillType?.icon} w={'16px'} borderRadius={'3px'} />
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
              </MyBox>

              {/* 二级菜单 */}
              {selectedSkillKey && (
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
                      (item) => item.level === 'secondary' && item.parentKey === selectedSkillKey
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
                            selectedKey,
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
                                highlightedRefs.current[option.key] = el;
                              }}
                              onMouseDown={() => {
                                selectOptionAndCleanUp(option as any);
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
                                bg: '#1118240D'
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
                </MyBox>
              )}

              {/* 第三级菜单 */}
              {selectedToolKey &&
                (() => {
                  const tertiaryOptions = skillOptionList.filter(
                    (option) => option.level === 'tertiary' && option.parentKey === selectedToolKey
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
                            onMouseDown={() => {
                              selectOptionAndCleanUp(option as any);
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
                      </MyBox>
                    );
                  }
                  return null;
                })()}
            </Flex>
          ),
          anchorElementRef.current
        );
      }}
    />
  );
}
