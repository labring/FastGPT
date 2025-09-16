import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin } from '@lexical/react/LexicalTypeaheadMenuPlugin';
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
import { useCallback, useEffect, useRef, useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useBasicTypeaheadTriggerMatch } from '../../utils';
import Avatar from '../../../../Avatar';
import MyIcon from '../../../../Icon';
import { useRequest2 } from '../../../../../../hooks/useRequest';
import { buildSkillOptions, getSkillDisplayState, getToolDisplayState } from './utils';
import type { EditorSkillPickerType, SkillOptionType, SkillToolItem } from './type';
import MyBox from '../../../../MyBox';

export default function SkillPickerPlugin({
  skills,
  isFocus,
  onAddToolFromEditor,
  selectedKey,
  setSelectedKey,
  queryString,
  setQueryString
}: {
  skills: EditorSkillPickerType[];
  isFocus: boolean;
  onAddToolFromEditor?: (toolKey: string) => Promise<string>;
  selectedKey: string;
  setSelectedKey: (key: string) => void;
  queryString?: string | null;
  setQueryString?: (value: string | null) => void;
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
      if (
        (selectedOption.level === 'secondary' ||
          selectedOption.level === 'tertiary' ||
          queryString) &&
        onAddToolFromEditor
      ) {
        return await onAddToolFromEditor(selectedOption.key);
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
    if (queryString) {
      return skills.map((skill) => ({
        key: skill.key,
        label: skill.label,
        icon: skill.icon,
        level: 'primary' as const,
        parentKey: undefined
      }));
    }

    const currentOption = skillOptionList.find((option) => option.key === selectedKey);
    if (!currentOption) {
      return skillOptionList.filter((item) => item.level === 'primary');
    }

    const currentLevel = currentOption.level;
    return skillOptionList.filter(
      (item) => item.level === currentLevel && item.parentKey === currentOption.parentKey
    );
  }, [skills, queryString, skillOptionList, selectedKey]);

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
  }, [editor, isFocus, queryString, selectedKey, skillOptionList, setSelectedKey]);

  const onSelectOption = useCallback(
    async (selectedOption: SkillOptionType, closeMenu: () => void) => {
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
              node.setTextContent(text.substring(0, atIndex));
            }
          }
        });

        selection.insertNodes([$createTextNode(`{{@${skillId}@}}`)]);
        closeMenu();
      });
    },
    [editor, addTool]
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
      onSelectOption={(
        selectedOption: SkillOptionType & { setRefElement: () => void },
        nodeToRemove,
        closeMenu
      ) => {
        onSelectOption(selectedOption, closeMenu);
      }}
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

        const currentLevel = currentOption.level;

        const selectedSkillKey = (() => {
          if (currentLevel === 'primary') {
            return currentOption?.key;
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
            return currentOption?.key;
          } else if (currentLevel === 'tertiary') {
            return currentOption?.parentKey;
          }
          return null;
        })();

        if (queryString) {
          return ReactDOM.createPortal(
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
                    const menuOption = menuOptions.find((m) => m.key === option.key);
                    if (menuOption) selectOptionAndCleanUp(menuOption);
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
                  <Avatar src={option.icon} w={'16px'} borderRadius={'3px'} />
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
            </MyBox>,
            anchorElementRef.current
          );
        }

        return ReactDOM.createPortal(
          <Flex position="relative" align="flex-start" zIndex={99999}>
            {/* 一级菜单 */}
            <MyBox
              p={1.5}
              borderRadius={'sm'}
              w={'160px'}
              boxShadow={'0 4px 10px 0 rgba(19, 51, 107, 0.10), 0 0 1px 0 rgba(19, 51, 107, 0.10)'}
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
                      <Avatar src={skillOption.icon} w={'16px'} borderRadius={'3px'} />
                      <Box
                        color={displayState.isCurrentFocus ? 'primary.700' : 'myGray.600'}
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
                    const skill = skills.find((skill) => skill.key === selectedSkillKey);
                    const category = skill?.toolCategories?.find((category) =>
                      category.list.some((toolItem: SkillToolItem) => toolItem.key === item.key)
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
                      <Box fontSize={'12px'} fontWeight={'600'} color={'myGray.900'} mb={1} px={2}>
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
                              const menuOption = menuOptions.find((m) => m.key === option.key);
                              if (menuOption) selectOptionAndCleanUp(menuOption);
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
                            <Avatar src={option.icon} w={'16px'} borderRadius={'3px'} />
                            <Box
                              color={toolDisplayState.isCurrentFocus ? 'primary.700' : 'myGray.600'}
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
                            const menuOption = menuOptions.find((m) => m.key === option.key);
                            if (menuOption) selectOptionAndCleanUp(menuOption);
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
