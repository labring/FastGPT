import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin } from '@lexical/react/LexicalTypeaheadMenuPlugin';
import type { TextNode } from 'lexical';
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_SPACE_COMMAND,
  KEY_ENTER_COMMAND
} from 'lexical';
import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useCallback, useEffect, useRef, useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useBasicTypeaheadTriggerMatch } from '../../utils';
import Avatar from '../../../../Avatar';
import MyIcon from '../../../../Icon';
import MyBox from '../../../../MyBox';
import { useMount } from 'ahooks';
import { useRequest2 } from '../../../../../../hooks/useRequest';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { useTranslation } from 'next-i18next';

export type SkillOptionItemType = {
  description?: string;
  list: SkillItemType[];

  onSelect?: (id: string) => Promise<SkillOptionItemType | undefined>;
  onClick?: (id: string) => Promise<string | undefined>;
  onFolderLoad?: (id: string) => Promise<SkillItemType[] | undefined>;
};

export type SkillItemType = {
  parentId?: ParentIdType;
  id: string;
  label: string;
  icon?: string;
  showArrow?: boolean;
  canOpen?: boolean;
  canUse?: boolean;
  open?: boolean;
  children?: SkillOptionItemType;
  folderChildren?: SkillItemType[];
};

export default function SkillPickerPlugin({
  skillOption,
  isFocus
}: {
  skillOption: SkillOptionItemType;
  isFocus: boolean;
}) {
  const { t } = useTranslation();
  const [skillOptions, setSkillOptions] = useState<SkillOptionItemType[]>([skillOption]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    setSkillOptions((state) => {
      const newOptions = [...state];
      newOptions[0] = skillOption;
      return newOptions;
    });
  }, [skillOption]);

  const [editor] = useLexicalComposerContext();
  const [selectedRowIndex, setSelectedRowIndex] = useState<Record<number, number>>({
    0: 0
  });
  const [currentColumnIndex, setCurrentColumnIndex] = useState<number>(0);
  const [currentRowIndex, setCurrentRowIndex] = useState<number>(0);
  const [interactionMode, setInteractionMode] = useState<'mouse' | 'keyboard'>('mouse');
  const [loadingFolderIds, setLoadingFolderIds] = useState(new Set());

  // Refs for scroll management
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Scroll selected item into view
  const scrollIntoView = useCallback((columnIndex: number, rowIndex: number, retryCount = 0) => {
    const itemKey = `${columnIndex}-${rowIndex}`;
    const itemElement = itemRefs.current.get(itemKey);
    if (itemElement) {
      if (rowIndex === 0) {
        const container = itemElement.parentElement;
        if (container) {
          container.scrollTop = 0;
        }
      } else {
        itemElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      }
    } else if (retryCount < 5) {
      // Retry if element not found yet (DOM not ready)
      setTimeout(() => {
        scrollIntoView(columnIndex, rowIndex, retryCount + 1);
      }, 20);
    }
  }, []);

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('@', {
    minLength: 0
  });

  // Recursively collects all visible items including expanded folder children for keyboard navigation
  const getFlattenedVisibleItems = useCallback(
    (columnIndex: number): SkillItemType[] => {
      const column = skillOptions[columnIndex];

      const flatten = (items: SkillItemType[]): SkillItemType[] => {
        const result: SkillItemType[] = [];
        items.forEach((item) => {
          result.push(item);
          // Include folder children only if folder is expanded
          if (item.canOpen && item.open && item.folderChildren) {
            result.push(...flatten(item.folderChildren));
          }
        });
        return result;
      };

      return flatten(column.list);
    },
    [skillOptions]
  );

  // Handle item selection (hover/keyboard navigation)
  const { runAsync: handleItemSelect, loading: isItemSelectLoading } = useRequest2(
    async ({
      currentColumnIndex,
      item,
      option
    }: {
      currentColumnIndex: number;
      item?: SkillItemType;
      option?: SkillOptionItemType;
    }) => {
      if (!item) return;
      const buffer = item.children;
      if (buffer) {
        setSkillOptions((prev) => {
          const newOptions = [...prev];
          newOptions[currentColumnIndex + 1] = buffer;
          return newOptions;
        });
        return;
      }

      const result = await option?.onSelect?.(item.id);

      setSkillOptions((prev) => {
        const newOptions = [...prev];
        if (result?.list && result?.list?.length > 0) {
          newOptions[currentColumnIndex + 1] = result;
        } else {
          for (let i = currentColumnIndex + 1; i < newOptions.length; i++) {
            // @ts-ignore
            newOptions[i] = undefined;
          }
        }
        return newOptions.filter(Boolean);
      });
    }
  );

  // Handle item click (confirm selection)
  const { runAsync: handleItemClick, loading: isItemClickLoading } = useRequest2(
    async ({ item, option }: { item: SkillItemType; option?: SkillOptionItemType }) => {
      // Step 1: Execute async onClick to get skillId (outside editor.update)
      const skillId = await option?.onClick?.(item.id);

      // Step 2: Update editor with the skillId (inside a fresh editor.update)
      if (skillId) {
        editor.update(() => {
          // Re-acquire selection in this update cycle to avoid stale node references
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;

          // Re-acquire nodes in this update cycle
          const nodes = selection.getNodes();
          nodes.forEach((node) => {
            if ($isTextNode(node)) {
              const text = node.getTextContent();
              const atIndex = text.lastIndexOf('@');
              if (atIndex !== -1) {
                // Remove the '@' trigger character
                const beforeAt = text.substring(0, atIndex);
                const afterAt = text.substring(atIndex + 1);
                node.setTextContent(beforeAt + afterAt);

                // Move cursor to where '@' was
                const newOffset = beforeAt.length;
                node.select(newOffset, newOffset);
              }
            }
          });

          // Insert skill node text at current selection
          selection.insertNodes([$createTextNode(`{{@${skillId}@}}`)]);
        });
      }
    },
    {
      refreshDeps: [editor]
    }
  );

  // Handle folder toggle
  const { runAsync: handleFolderToggle, loading: isFolderLoading } = useRequest2(
    async ({
      currentColumnIndex,
      item,
      option
    }: {
      currentColumnIndex: number;
      item?: SkillItemType;
      option?: SkillOptionItemType;
    }) => {
      if (!item || !item.canOpen) return;
      const currentFolder = item;

      // Step 1: Toggle folder open/closed state
      setSkillOptions((prev) => {
        const newOptions = [...prev];
        const columnData = { ...newOptions[currentColumnIndex] };

        // Recursively find and toggle the target folder
        const toggleFolderOpen = (items: SkillItemType[]): SkillItemType[] => {
          return items.map((item) => {
            // Found the target folder, toggle its open state
            if (item.id === currentFolder.id) {
              return { ...item, open: !currentFolder.open };
            }
            // Recursively search in nested folders
            if (item.folderChildren) {
              return { ...item, folderChildren: toggleFolderOpen(item.folderChildren) };
            }
            return item;
          });
        };

        columnData.list = toggleFolderOpen(columnData.list);
        newOptions[currentColumnIndex] = columnData;
        return newOptions;
      });

      // Step 2: Load folder children only if folder has no data
      if (!currentFolder.open && currentFolder?.folderChildren === undefined) {
        setLoadingFolderIds((prev) => {
          const next = new Set(prev);
          next.add(currentFolder.id);
          return next;
        });

        try {
          const result = await option?.onFolderLoad?.(currentFolder.id);

          setSkillOptions((prev) => {
            const newOptions = [...prev];
            const columnData = { ...newOptions[currentColumnIndex] };

            const addFolderChildren = (items: SkillItemType[]): SkillItemType[] => {
              return items.map((item) => {
                if (item.id === currentFolder.id) {
                  return {
                    ...item,
                    folderChildren: result || []
                  };
                }
                if (item.folderChildren) {
                  return { ...item, folderChildren: addFolderChildren(item.folderChildren) };
                }
                return item;
              });
            };

            columnData.list = addFolderChildren(columnData.list);
            newOptions[currentColumnIndex] = columnData;
            return newOptions;
          });
        } finally {
          setLoadingFolderIds((prev) => {
            const next = new Set(prev);
            next.delete(currentFolder.id);
            return next;
          });
        }
      }
    }
  );

  // First init
  useMount(() => {
    handleItemSelect({ currentColumnIndex: 0, item: skillOption.list[0], option: skillOption });
  });
  // Scroll to selected item when menu opens
  useEffect(() => {
    if (isMenuOpen) {
      // Delay to ensure DOM is rendered and refs are attached
      setTimeout(() => {
        scrollIntoView(currentColumnIndex, currentRowIndex);
      });
    }
  }, [isMenuOpen, scrollIntoView, currentColumnIndex, currentRowIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!isFocus || !isMenuOpen) return;

    const removeUpCommand = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (e: KeyboardEvent) => {
        if (!isMenuOpen) return true;

        e.preventDefault();
        e.stopPropagation();

        setInteractionMode('keyboard');

        if (currentColumnIndex >= 0 && currentColumnIndex < skillOptions.length) {
          const columnItems = getFlattenedVisibleItems(currentColumnIndex);
          if (!columnItems || columnItems.length === 0) return true;

          // Use functional update to get the latest row index
          setCurrentRowIndex((prevRowIndex) => {
            const newIndex = prevRowIndex > 0 ? prevRowIndex - 1 : columnItems.length - 1;

            handleItemSelect({
              currentColumnIndex: currentColumnIndex,
              item: columnItems[newIndex],
              option: skillOptions[currentColumnIndex]
            });

            // Scroll into view after state update
            requestAnimationFrame(() => {
              scrollIntoView(currentColumnIndex, newIndex);
            });

            return newIndex;
          });
        }

        return true;
      },
      COMMAND_PRIORITY_HIGH
    );

    const removeDownCommand = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (e: KeyboardEvent) => {
        if (!isMenuOpen) return true;

        e.preventDefault();
        e.stopPropagation();

        setInteractionMode('keyboard');

        if (currentColumnIndex >= 0 && currentColumnIndex < skillOptions.length) {
          const columnItems = getFlattenedVisibleItems(currentColumnIndex);
          if (!columnItems || columnItems.length === 0) return true;

          // Use functional update to get the latest row index
          setCurrentRowIndex((prevRowIndex) => {
            const newIndex = prevRowIndex < columnItems.length - 1 ? prevRowIndex + 1 : 0;

            handleItemSelect({
              currentColumnIndex: currentColumnIndex,
              item: columnItems[newIndex],
              option: skillOptions[currentColumnIndex]
            });

            // Scroll into view after state update
            requestAnimationFrame(() => {
              scrollIntoView(currentColumnIndex, newIndex);
            });

            return newIndex;
          });
        }

        return true;
      },
      COMMAND_PRIORITY_HIGH
    );

    const removeRightCommand = editor.registerCommand(
      KEY_ARROW_RIGHT_COMMAND,
      (e: KeyboardEvent) => {
        if (!isMenuOpen) return true;

        e.preventDefault();
        e.stopPropagation();

        setInteractionMode('keyboard');

        // Use functional updates to get the latest state
        setCurrentColumnIndex((prevColumnIndex) => {
          if (prevColumnIndex >= skillOptions.length - 1) return prevColumnIndex;

          const newColumnIndex = prevColumnIndex + 1;

          setSelectedRowIndex((state) => ({
            ...state,
            [prevColumnIndex]: currentRowIndex
          }));

          setCurrentRowIndex(0);

          // Use the latest skillOptions from closure to get the new column items
          const newColumnOption = skillOptions[newColumnIndex];
          const newColumnItems = newColumnOption?.list;
          if (newColumnItems && newColumnItems.length > 0) {
            handleItemSelect({
              currentColumnIndex: newColumnIndex,
              item: newColumnItems[0],
              option: newColumnOption
            });

            // Scroll into view after state update
            requestAnimationFrame(() => {
              scrollIntoView(newColumnIndex, 0);
            });
          }

          return newColumnIndex;
        });

        return true;
      },
      COMMAND_PRIORITY_HIGH
    );

    const removeLeftCommand = editor.registerCommand(
      KEY_ARROW_LEFT_COMMAND,
      (e: KeyboardEvent) => {
        if (!isMenuOpen) return true;

        e.preventDefault();
        e.stopPropagation();

        setInteractionMode('keyboard');

        // Use functional updates to get the latest state
        setCurrentColumnIndex((prevColumnIndex) => {
          if (prevColumnIndex <= 0) return prevColumnIndex;

          const newColumnIndex = prevColumnIndex - 1;

          setSelectedRowIndex((state) => ({
            ...state,
            [prevColumnIndex]: currentRowIndex
          }));

          const newRowIndex = selectedRowIndex[newColumnIndex] || 0;
          setCurrentRowIndex(() => newRowIndex);

          // Only keep data up to and including the current column
          setSkillOptions((state) => {
            return state.slice(0, prevColumnIndex + 1);
          });

          // Scroll into view after state update
          requestAnimationFrame(() => {
            scrollIntoView(newColumnIndex, newRowIndex);
          });

          return newColumnIndex;
        });

        return true;
      },
      COMMAND_PRIORITY_HIGH
    );

    const removeSpaceCommand = editor.registerCommand(
      KEY_SPACE_COMMAND,
      (e: KeyboardEvent) => {
        if (!isMenuOpen) return true;

        setInteractionMode('keyboard');

        const flattenedItems = getFlattenedVisibleItems(currentColumnIndex);
        const latestItem = flattenedItems[currentRowIndex];
        const latestOption = skillOptions[currentColumnIndex];

        if (latestItem?.canOpen && !(latestItem.open && latestItem.folderChildren?.length === 0)) {
          e.preventDefault();
          e.stopPropagation();
          handleFolderToggle({
            currentColumnIndex,
            item: latestItem,
            option: latestOption
          });
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    const removeEnterCommand = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (e: KeyboardEvent) => {
        if (!isMenuOpen) return true;

        setInteractionMode('keyboard');

        const flattenedItems = getFlattenedVisibleItems(currentColumnIndex);
        const latestItem = flattenedItems[currentRowIndex];
        const latestOption = skillOptions[currentColumnIndex];

        if (latestItem?.canUse && latestOption) {
          e.preventDefault();
          e.stopPropagation();
          handleItemClick({ item: latestItem, option: latestOption });

          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    return () => {
      removeUpCommand();
      removeDownCommand();
      removeRightCommand();
      removeLeftCommand();
      removeSpaceCommand();
      removeEnterCommand();
    };
  }, [
    editor,
    isFocus,
    isMenuOpen,
    currentColumnIndex,
    currentRowIndex,
    skillOptions,
    handleItemSelect,
    handleFolderToggle,
    handleItemClick,
    selectedRowIndex,
    scrollIntoView,
    getFlattenedVisibleItems
  ]);

  // Recursively render item list
  const renderItemList = useCallback(
    (
      items: SkillItemType[],
      columnData: SkillOptionItemType,
      columnIndex: number,
      depth: number = 0,
      startFlatIndex: number = 0
    ): { elements: JSX.Element[]; nextFlatIndex: number } => {
      const result: JSX.Element[] = [];
      const activeRowIndex = selectedRowIndex[columnIndex];
      let currentFlatIndex = startFlatIndex;
      console.log('items', { selectedRowIndex, columnIndex, activeRowIndex });

      items.forEach((item) => {
        const flatIndex = currentFlatIndex;
        currentFlatIndex++;

        // 前面的列，才有激活态
        const isActive = columnIndex < currentColumnIndex && flatIndex === activeRowIndex;
        // 当前选中的东西
        const isSelected = columnIndex === currentColumnIndex && flatIndex === currentRowIndex;

        result.push(
          <MyBox
            key={item.id}
            ref={(el) => {
              if (el) {
                itemRefs.current.set(`${columnIndex}-${flatIndex}`, el as HTMLDivElement);
              } else {
                itemRefs.current.delete(`${columnIndex}-${flatIndex}`);
              }
            }}
            px={2}
            py={1.5}
            gap={2}
            pl={1 + depth * 4}
            borderRadius={'4px'}
            cursor={'pointer'}
            bg={isActive || isSelected ? 'myGray.100' : ''}
            color={isSelected ? 'primary.700' : 'myGray.600'}
            display={'flex'}
            alignItems={'center'}
            isLoading={loadingFolderIds.has(item.id)}
            size={'sm'}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onMouseMove={(e) => {
              if (interactionMode === 'keyboard') {
                setInteractionMode('mouse');
              }
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (item.canOpen) {
                handleFolderToggle({
                  currentColumnIndex: columnIndex,
                  item,
                  option: columnData
                });
              } else if (item.canUse) {
                handleItemClick({
                  item,
                  option: columnData
                });
              }
            }}
            onMouseEnter={(e) => {
              e.preventDefault();

              // Ignore mouse hover in keyboard mode
              if (interactionMode === 'keyboard') {
                return;
              }

              if (columnIndex !== currentColumnIndex) {
                setSelectedRowIndex((state) => ({
                  ...state,
                  [currentColumnIndex]: currentRowIndex
                }));
              }

              setCurrentRowIndex(flatIndex);
              setCurrentColumnIndex(columnIndex);
              if (item.canUse) {
                handleItemSelect({
                  currentColumnIndex: columnIndex,
                  item,
                  option: columnData
                });
              }
            }}
          >
            {item.canOpen && !(item.open && item.folderChildren?.length === 0) ? (
              <MyIcon
                name={'core/chat/chevronRight'}
                w={4}
                color={'myGray.500'}
                transform={item.open ? 'rotate(90deg)' : 'none'}
                transition={'transform 0.2s'}
                mr={-1}
              />
            ) : columnData.onFolderLoad ? (
              <Box w={3} flexShrink={0} />
            ) : null}
            {item.icon && <Avatar src={item.icon} w={'1.2rem'} borderRadius={'xs'} />}
            <Box fontSize={'sm'} fontWeight={'medium'} flex={1}>
              {item.label}
              {item.canOpen && item.open && item.folderChildren?.length === 0 && (
                <Box as="span" color={'myGray.400'} fontSize={'xs'} ml={2}>
                  {t('app:empty_folder')}
                </Box>
              )}
            </Box>
            {item.showArrow && (
              <MyIcon name={'core/chat/chevronRight'} w={'0.8rem'} color={'myGray.400'} />
            )}
          </MyBox>
        );

        // render folderChildren
        if (item.canOpen && item.open && !!item.folderChildren && item.folderChildren.length > 0) {
          const { elements, nextFlatIndex } = renderItemList(
            item.folderChildren,
            columnData,
            columnIndex,
            depth + 1,
            currentFlatIndex
          );
          result.push(...elements);
          currentFlatIndex = nextFlatIndex;
        }
      });

      return { elements: result, nextFlatIndex: currentFlatIndex };
    },
    [
      selectedRowIndex,
      currentColumnIndex,
      currentRowIndex,
      handleFolderToggle,
      handleItemClick,
      handleItemSelect,
      interactionMode,
      loadingFolderIds
    ]
  );

  // Render single column
  const renderColumn = useCallback(
    (columnData: SkillOptionItemType, columnIndex: number) => {
      const columnWidth = columnData.onFolderLoad ? '280px' : '200px';

      return (
        <MyBox
          isLoading={currentColumnIndex === columnIndex && isItemClickLoading}
          key={columnIndex}
          ml={columnIndex > 0 ? 2 : 0}
          p={1.5}
          borderRadius={'sm'}
          w={columnWidth}
          boxShadow={'0 4px 10px 0 rgba(19, 51, 107, 0.10), 0 0 1px 0 rgba(19, 51, 107, 0.10)'}
          bg={'white'}
          flexShrink={0}
          maxH={'300px'}
          overflow={'auto'}
        >
          {columnData.description && (
            <Box color={'myGray.500'} fontSize={'xs'}>
              {columnData.description}
            </Box>
          )}
          {renderItemList(columnData.list, columnData, columnIndex).elements}
        </MyBox>
      );
    },
    [currentColumnIndex, isItemClickLoading, renderItemList]
  );

  // For LexicalTypeaheadMenuPlugin compatibility
  const menuOptions = useMemo(() => {
    return skillOptions.flatMap((item) =>
      item.list.map((item) => ({
        key: item.id,
        ...item
      }))
    );
  }, [skillOptions]);
  const onSelectOption = useCallback(
    async (selectedOption: any, nodeToRemove: TextNode | null, closeMenu: () => void) => {
      // Step 1: Call async onClick handler (outside editor.update)
      const skillId = await selectedOption.onClick?.(selectedOption.id);

      // Step 2: Update editor with the skill (inside a fresh editor.update)
      if (skillId) {
        editor.update(() => {
          // Re-acquire selection in this update cycle to avoid stale node references
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;

          // Re-acquire nodes in this update cycle
          const nodes = selection.getNodes();
          nodes.forEach((node) => {
            if ($isTextNode(node)) {
              const text = node.getTextContent();
              const atIndex = text.lastIndexOf('@');
              if (atIndex !== -1) {
                // Remove the '@' trigger character
                const beforeAt = text.substring(0, atIndex);
                const afterAt = text.substring(atIndex + 1);
                node.setTextContent(beforeAt + afterAt);

                // Move cursor to where '@' was
                const newOffset = beforeAt.length;
                node.select(newOffset, newOffset);
              }
            }
          });

          // Insert skill node text at current selection
          selection.insertNodes([$createTextNode(`{{@${skillId}@}}`)]);
          closeMenu();
        });
      } else {
        // If onClick didn't return a skillId, just close the menu
        closeMenu();
      }
    },
    [editor]
  );

  return (
    <LexicalTypeaheadMenuPlugin
      onQueryChange={(matchingString) => {
        // Update menu open state based on query
        setIsMenuOpen(matchingString !== null);
      }}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={menuOptions}
      menuRenderFn={(anchorElementRef) => {
        const shouldShow = skillOptions.length > 0 && anchorElementRef.current !== null && isFocus;

        // Sync menu open state with render
        if (!shouldShow && isMenuOpen) {
          setIsMenuOpen(false);
        } else if (shouldShow && !isMenuOpen) {
          setIsMenuOpen(true);
        }

        return ReactDOM.createPortal(
          <Flex
            visibility={shouldShow ? 'visible' : 'hidden'}
            position="relative"
            align="flex-start"
            zIndex={99999}
          >
            {skillOptions.map((column, index) => {
              return renderColumn(column, index);
            })}
          </Flex>,
          anchorElementRef.current!
        );
      }}
    />
  );
}
