import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin } from '@lexical/react/LexicalTypeaheadMenuPlugin';
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
import { useRequest } from '../../../../../../hooks/useRequest';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { useTranslation } from 'next-i18next';
import type { SkillLabelItemType } from '../SkillLabelPlugin';
import { getToolIdentityKey } from '@fastgpt/global/core/app/tool/utils';

const MENU_WIDTH = 'min(954px, calc(100vw - 16px))';
const MENU_HEIGHT = '337px';
const FIRST_COLUMN_WIDTH = '200px';
const CHILD_COLUMN_WIDTH = '280px';

export type SkillOptionItemType = {
  description?: string;
  list: SkillItemType[];
  onSelect?: (id: string) => Promise<SkillOptionItemType | undefined>;
  onClick?: (id: string, source?: string) => Promise<SkillClickResult | undefined>;
  onFolderLoad?: (id: string, source?: string) => Promise<SkillItemType[]>;
};

export type SkillClickResult = {
  id: string;
  skill: SkillLabelItemType;
};

export type SkillItemType = {
  parentId?: ParentIdType;
  id: string;
  source?: string;
  label: string;
  icon?: string;
  description?: string;
  canClick: boolean;
  children?: SkillOptionItemType;

  // Folder
  open?: boolean;
  isFolder?: boolean;
  folderChildren?: SkillItemType[];

  // Toolset
  tools?: SkillItemType[];
};

const getSkillItemKey = (item: Pick<SkillItemType, 'id' | 'source'>) =>
  getToolIdentityKey(item.id, item.source);

export default function SkillPickerPlugin({
  skillOption,
  isFocus,
  pendingSkillsRef
}: {
  skillOption: SkillOptionItemType;
  isFocus: boolean;
  pendingSkillsRef: React.MutableRefObject<Map<string, SkillLabelItemType>>;
}) {
  const { t } = useTranslation();
  const [skillOptions, setSkillOptions] = useState<SkillOptionItemType[]>([skillOption]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isMenuOpenRef = useRef(false);

  const updateMenuOpen = useCallback((open: boolean) => {
    isMenuOpenRef.current = open;
    setIsMenuOpen(open);
  }, []);

  const [editor] = useLexicalComposerContext();
  const [selectedRowIndex, setSelectedRowIndex] = useState<Record<number, number>>({
    0: 0
  });
  const [currentColumnIndex, setCurrentColumnIndex] = useState<number>(0);
  const [currentRowIndex, setCurrentRowIndex] = useState<number>(0);
  const [interactionMode, setInteractionMode] = useState<'mouse' | 'keyboard'>('mouse');
  const selectionRequestIdRef = useRef(0);
  const folderOptionsRef = useRef<Map<string, SkillOptionItemType>>(new Map());
  const folderRequestsRef = useRef<Map<string, Promise<SkillItemType[]>>>(new Map());
  const [loadingFolderIds, setLoadingFolderIds] = useState<Set<string>>(new Set());

  // Refs for scroll management
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const menuAnchorRef = useRef<HTMLElement | null>(null);
  const menuElementRef = useRef<HTMLDivElement | null>(null);
  const menuPositionFrameRef = useRef<number | null>(null);

  const updateMenuPosition = useCallback(() => {
    const anchorElement = menuAnchorRef.current;
    const menuElement = menuElementRef.current;
    if (!anchorElement || !menuElement) return;

    const menuRect = menuElement.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const edgePadding = 8;
    const maxLeft = Math.max(edgePadding, viewportWidth - menuRect.width - edgePadding);
    const nextLeft = Math.min(Math.max(menuRect.left, edgePadding), maxLeft);
    const currentAnchorLeft = Number.parseFloat(anchorElement.style.left);

    if (!Number.isFinite(currentAnchorLeft)) return;

    const nextAnchorLeft = currentAnchorLeft + nextLeft - menuRect.left;
    if (Math.abs(nextAnchorLeft - currentAnchorLeft) > 0.5) {
      anchorElement.style.left = `${nextAnchorLeft}px`;
    }
  }, []);

  const scheduleMenuPosition = useCallback(() => {
    if (menuPositionFrameRef.current !== null) {
      cancelAnimationFrame(menuPositionFrameRef.current);
    }

    menuPositionFrameRef.current = requestAnimationFrame(() => {
      menuPositionFrameRef.current = null;
      updateMenuPosition();
    });
  }, [updateMenuPosition]);

  useEffect(() => {
    if (!isFocus || !isMenuOpen) return;

    const anchorElement = menuAnchorRef.current;
    const menuElement = menuElementRef.current;
    if (!anchorElement || !menuElement) return;

    scheduleMenuPosition();

    const anchorObserver = new MutationObserver(scheduleMenuPosition);
    anchorObserver.observe(anchorElement, {
      attributes: true,
      attributeFilter: ['style']
    });

    const menuObserver = new ResizeObserver(scheduleMenuPosition);
    menuObserver.observe(menuElement);

    window.addEventListener('resize', scheduleMenuPosition);
    document.addEventListener('scroll', scheduleMenuPosition, true);

    return () => {
      anchorObserver.disconnect();
      menuObserver.disconnect();
      window.removeEventListener('resize', scheduleMenuPosition);
      document.removeEventListener('scroll', scheduleMenuPosition, true);

      if (menuPositionFrameRef.current !== null) {
        cancelAnimationFrame(menuPositionFrameRef.current);
        menuPositionFrameRef.current = null;
      }
    };
  }, [isFocus, isMenuOpen, scheduleMenuPosition, skillOptions.length]);

  // Scroll the selected row into view and reveal newly appended columns.
  const scrollIntoView = useCallback((columnIndex: number, rowIndex: number, retryCount = 0) => {
    const scroll = (currentRetryCount: number) => {
      const itemKey = `${columnIndex}-${rowIndex}`;
      const itemElement = itemRefs.current.get(itemKey);
      if (itemElement) {
        if (rowIndex === 0) {
          const container = itemElement.parentElement;
          if (container) {
            container.scrollTop = 0;
          }
        }
        itemElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      } else if (currentRetryCount < 5) {
        // Retry if element not found yet (DOM not ready)
        setTimeout(() => {
          scroll(currentRetryCount + 1);
        }, 20);
      }
    };

    scroll(retryCount);
  }, []);

  const getItemChildOption = useCallback((item: SkillItemType, option: SkillOptionItemType) => {
    if (item.children) return item.children;

    if (item.folderChildren) {
      return {
        description: option.description,
        list: item.folderChildren,
        onClick: option.onClick,
        onFolderLoad: option.onFolderLoad
      };
    }

    if (item.tools?.length) {
      return {
        list: item.tools,
        onClick: option.onClick
      };
    }

    return undefined;
  }, []);

  const appendColumn = useCallback((columnIndex: number, option?: SkillOptionItemType) => {
    setSkillOptions((prev) => {
      const next = prev.slice(0, columnIndex + 1);
      if (option) next.push(option);
      return next;
    });
  }, []);

  // Resolve the hovered item into the next navigation column.
  const { runAsync: handleItemSelect, loading: isItemSelectLoading } = useRequest(
    async ({
      currentColumnIndex,
      item,
      option
    }: {
      currentColumnIndex: number;
      item?: SkillItemType;
      option?: SkillOptionItemType;
    }) => {
      if (!item || !option) return;

      const requestId = ++selectionRequestIdRef.current;
      const itemKey = getSkillItemKey(item);
      const childOption = getItemChildOption(item, option);

      appendColumn(currentColumnIndex, childOption);
      if (childOption) {
        return;
      }

      if (item.isFolder && option.onFolderLoad) {
        const cachedOption = folderOptionsRef.current.get(itemKey);
        if (cachedOption) {
          appendColumn(currentColumnIndex, {
            ...cachedOption,
            description: option.description,
            onClick: option.onClick,
            onFolderLoad: option.onFolderLoad
          });
          return;
        }

        setLoadingFolderIds((prev) => new Set(prev).add(itemKey));
        let pendingRequest = folderRequestsRef.current.get(itemKey);
        if (!pendingRequest) {
          pendingRequest = Promise.resolve().then(() => option.onFolderLoad!(item.id, item.source));
          folderRequestsRef.current.set(itemKey, pendingRequest);
        }
        try {
          const list = await pendingRequest;
          if (selectionRequestIdRef.current !== requestId) return;

          const nextOption: SkillOptionItemType = {
            description: option.description,
            list,
            onClick: option.onClick,
            onFolderLoad: option.onFolderLoad
          };
          folderOptionsRef.current.set(itemKey, nextOption);
          appendColumn(currentColumnIndex, nextOption);
        } finally {
          if (folderRequestsRef.current.get(itemKey) === pendingRequest) {
            folderRequestsRef.current.delete(itemKey);
          }
          setLoadingFolderIds((prev) => {
            const next = new Set(prev);
            next.delete(itemKey);
            return next;
          });
        }
        return;
      }

      if (item.isFolder) {
        appendColumn(currentColumnIndex, {
          description: option.description,
          list: [],
          onClick: option.onClick
        });
        return;
      }

      if (!option.onSelect) return;

      const result = await option.onSelect(item.id);
      if (selectionRequestIdRef.current !== requestId) return;

      appendColumn(currentColumnIndex, result);
    },
    {
      refreshDeps: [appendColumn, getItemChildOption]
    }
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      selectionRequestIdRef.current += 1;
      folderOptionsRef.current.clear();
      setSkillOptions([skillOption]);
      setSelectedRowIndex({ 0: 0 });
      setCurrentColumnIndex(0);
      setCurrentRowIndex(0);
      setInteractionMode('mouse');

      const firstItem = skillOption.list[0];
      if (firstItem) {
        void handleItemSelect({
          currentColumnIndex: 0,
          item: firstItem,
          option: skillOption
        });
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
      selectionRequestIdRef.current += 1;
    };
  }, [handleItemSelect, skillOption]);

  const insertSkillNodeText = useCallback(
    (skillId: string, matchingString?: string | null) => {
      let inserted = false;

      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const anchorNode = selection.anchor.getNode();
        const anchorOffset = selection.anchor.offset;

        if ($isTextNode(anchorNode)) {
          const text = anchorNode.getTextContent();
          const triggerText = `@${matchingString ?? ''}`;
          let atIndex = text.lastIndexOf(triggerText, anchorOffset);

          if (atIndex === -1) {
            atIndex = text.lastIndexOf('@', anchorOffset);
          }

          if (atIndex !== -1) {
            const removeEnd = Math.max(anchorOffset, atIndex + triggerText.length, atIndex + 1);
            const beforeAt = text.substring(0, atIndex);
            const afterTrigger = text.substring(removeEnd);
            anchorNode.setTextContent(beforeAt + afterTrigger);
            anchorNode.select(beforeAt.length, beforeAt.length);
          }
        }

        selection.insertNodes([$createTextNode(`{{@${skillId}@}}`)]);
        inserted = true;
      });

      return inserted;
    },
    [editor]
  );

  const insertSkillResult = useCallback(
    (result: SkillClickResult, matchingString?: string | null) => {
      pendingSkillsRef.current.set(result.id, result.skill);
      const inserted = insertSkillNodeText(result.id, matchingString);

      if (!inserted) {
        pendingSkillsRef.current.delete(result.id);
      }
    },
    [insertSkillNodeText, pendingSkillsRef]
  );

  // Handle item click (confirm selection)
  const itemClickLock = useRef(false);
  const [isItemClickLoading, setIsItemClickLoading] = useState(false);
  const { runAsync: handleItemClick } = useRequest(
    async ({ item, option }: { item: SkillItemType; option?: SkillOptionItemType }) => {
      if (!item.canClick || !option?.onClick || itemClickLock.current) {
        return;
      }
      itemClickLock.current = true;
      setIsItemClickLoading(true);
      try {
        // Step 1: Execute async onClick to get skillId (outside editor.update)
        const result = await option.onClick(item.id, item.source);

        // Step 2: Update editor with the skillId (inside a fresh editor.update)
        if (result) {
          insertSkillResult(result);
          updateMenuOpen(false);
        }
      } catch (error) {
        return Promise.reject(error);
      } finally {
        itemClickLock.current = false;
        setIsItemClickLoading(false);
      }
    },
    {
      refreshDeps: [insertSkillResult, updateMenuOpen]
    }
  );

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
        if (!isMenuOpenRef.current) return false;

        e.preventDefault();
        e.stopPropagation();

        setInteractionMode('keyboard');

        if (currentColumnIndex >= 0 && currentColumnIndex < skillOptions.length) {
          const columnItems = skillOptions[currentColumnIndex]?.list;
          if (!columnItems || columnItems.length === 0) return true;

          // Use functional update to get the latest row index
          setCurrentRowIndex((prevRowIndex) => {
            const newIndex = prevRowIndex > 0 ? prevRowIndex - 1 : columnItems.length - 1;

            void handleItemSelect({
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
        if (!isMenuOpenRef.current) return false;

        e.preventDefault();
        e.stopPropagation();

        setInteractionMode('keyboard');

        if (currentColumnIndex >= 0 && currentColumnIndex < skillOptions.length) {
          const columnItems = skillOptions[currentColumnIndex]?.list;
          if (!columnItems || columnItems.length === 0) return true;

          // Use functional update to get the latest row index
          setCurrentRowIndex((prevRowIndex) => {
            const newIndex = prevRowIndex < columnItems.length - 1 ? prevRowIndex + 1 : 0;

            void handleItemSelect({
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
        if (!isMenuOpenRef.current) return false;

        e.preventDefault();
        e.stopPropagation();

        setInteractionMode('keyboard');

        // Use functional updates to get the latest state
        setCurrentColumnIndex((prevColumnIndex) => {
          if (prevColumnIndex >= skillOptions.length - 1) {
            const currentOption = skillOptions[prevColumnIndex];
            const currentItem = currentOption?.list[currentRowIndex];
            if (currentItem && currentOption) {
              void handleItemSelect({
                currentColumnIndex: prevColumnIndex,
                item: currentItem,
                option: currentOption
              });
            }
            return prevColumnIndex;
          }

          const newColumnIndex = prevColumnIndex + 1;

          setSelectedRowIndex((state) => ({
            ...state,
            [prevColumnIndex]: currentRowIndex
          }));

          setCurrentRowIndex(selectedRowIndex[newColumnIndex] ?? 0);

          // Use the latest skillOptions from closure to get the new column items
          const newColumnOption = skillOptions[newColumnIndex];
          const newColumnItems = newColumnOption?.list;
          if (newColumnItems && newColumnItems.length > 0) {
            void handleItemSelect({
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
        if (!isMenuOpenRef.current) return false;

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
            return state.slice(0, newColumnIndex + 1);
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
        if (!isMenuOpenRef.current) return false;

        e.preventDefault();
        e.stopPropagation();

        setInteractionMode('keyboard');

        const latestItem = skillOptions[currentColumnIndex]?.list[currentRowIndex];
        const latestOption = skillOptions[currentColumnIndex];

        if (
          latestItem &&
          latestOption &&
          (getItemChildOption(latestItem, latestOption) || latestItem.isFolder)
        ) {
          void handleItemSelect({
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
        if (!isMenuOpenRef.current) return false;

        e.preventDefault();
        e.stopPropagation();

        setInteractionMode('keyboard');

        const latestItem = skillOptions[currentColumnIndex]?.list[currentRowIndex];
        const latestOption = skillOptions[currentColumnIndex];

        if (!latestItem || !latestOption) return false;

        if (latestItem.isFolder || getItemChildOption(latestItem, latestOption)) {
          void handleItemSelect({
            currentColumnIndex,
            item: latestItem,
            option: latestOption
          });
          return true;
        }

        if (latestOption.onClick) {
          void handleItemClick({ item: latestItem, option: latestOption });

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
    handleItemClick,
    selectedRowIndex,
    scrollIntoView,
    getItemChildOption
  ]);

  const isExpandable = useCallback(
    (item: SkillItemType, option: SkillOptionItemType) =>
      Boolean(item.isFolder || getItemChildOption(item, option)),
    [getItemChildOption]
  );

  // Render one flat list per navigation column.
  const renderItemList = useCallback(
    (
      items: SkillItemType[],
      columnData: SkillOptionItemType,
      columnIndex: number,
      onSelectOption?: (item: SkillItemType, option: SkillOptionItemType) => void
    ): JSX.Element[] => {
      const activeRowIndex = selectedRowIndex[columnIndex];

      return items.map((item, rowIndex) => {
        const isActive = columnIndex < currentColumnIndex && rowIndex === activeRowIndex;
        const isSelected = columnIndex === currentColumnIndex && rowIndex === currentRowIndex;
        const expandable = isExpandable(item, columnData);

        return (
          <MyBox
            key={getSkillItemKey(item)}
            ref={(el) => {
              if (el) {
                itemRefs.current.set(`${columnIndex}-${rowIndex}`, el as HTMLDivElement);
              } else {
                itemRefs.current.delete(`${columnIndex}-${rowIndex}`);
              }
            }}
            pl={1}
            pr={2}
            py={1.5}
            gap={2}
            borderRadius={'4px'}
            cursor={'pointer'}
            bg={isActive || isSelected ? 'myGray.100' : undefined}
            color={'myGray.600'}
            display={'flex'}
            alignItems={'center'}
            h={'33px'}
            flexShrink={0}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onMouseMove={() => {
              if (interactionMode === 'keyboard') {
                setInteractionMode('mouse');
              }
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();

              if (expandable || (!item.canClick && columnData.onSelect)) {
                void handleItemSelect({
                  currentColumnIndex: columnIndex,
                  item,
                  option: columnData
                });
                return;
              }

              if (onSelectOption) {
                onSelectOption(item, columnData);
              } else {
                void handleItemClick({ item, option: columnData });
              }
            }}
            onMouseEnter={(e) => {
              e.preventDefault();

              // Ignore mouse hover in keyboard mode until the pointer moves again.
              if (interactionMode === 'keyboard') return;

              if (columnIndex !== currentColumnIndex) {
                setSelectedRowIndex((state) => ({
                  ...state,
                  [currentColumnIndex]: currentRowIndex
                }));
              }

              setCurrentRowIndex(rowIndex);
              setCurrentColumnIndex(columnIndex);
              void handleItemSelect({
                currentColumnIndex: columnIndex,
                item,
                option: columnData
              });
            }}
          >
            {item.icon && (
              <Avatar src={item.icon} w={'1.2rem'} borderRadius={'xs'} flexShrink={0} />
            )}
            <Box fontSize={'sm'} fontWeight={'medium'} flex={'1 0 0'} className="textEllipsis">
              {item.label}
            </Box>
            {expandable && (
              <Box w={6} h={6} display={'flex'} alignItems={'center'} justifyContent={'center'}>
                <MyIcon
                  name={
                    loadingFolderIds.has(getSkillItemKey(item))
                      ? 'common/loading'
                      : 'core/chat/chevronRight'
                  }
                  w={4}
                  color={'myGray.500'}
                />
              </Box>
            )}
          </MyBox>
        );
      });
    },
    [
      selectedRowIndex,
      currentColumnIndex,
      currentRowIndex,
      loadingFolderIds,
      interactionMode,
      handleItemClick,
      handleItemSelect,
      isExpandable
    ]
  );

  // Render a fixed-width navigation column.
  const renderColumn = useCallback(
    (
      columnData: SkillOptionItemType,
      columnIndex: number,
      onSelectOption?: (item: SkillItemType, option: SkillOptionItemType) => void
    ) => {
      return (
        <MyBox
          isLoading={
            currentColumnIndex === columnIndex && (isItemSelectLoading || isItemClickLoading)
          }
          key={columnIndex}
          p={1.5}
          borderRadius={'6px'}
          w={columnIndex === 0 ? FIRST_COLUMN_WIDTH : CHILD_COLUMN_WIDTH}
          h={'100%'}
          boxShadow={'0 4px 10px 0 rgba(19, 51, 107, 0.10), 0 0 1px 0 rgba(19, 51, 107, 0.10)'}
          bg={'white'}
          flexShrink={0}
          overflowY={'auto'}
          overflowX={'hidden'}
          sx={{
            scrollbarColor: 'var(--chakra-colors-myGray-300) transparent',
            scrollbarWidth: 'thin',
            '&::-webkit-scrollbar': { width: '6px' },
            '&::-webkit-scrollbar-thumb': {
              background: 'var(--chakra-colors-myGray-300)',
              borderRadius: '3px'
            }
          }}
        >
          {columnData.description && (
            <Box color={'myGray.500'} fontSize={'xs'} lineHeight={'20px'} h={'20px'}>
              {columnData.description}
            </Box>
          )}
          {renderItemList(columnData.list, columnData, columnIndex, onSelectOption)}
          {columnData.list.length === 0 && (
            <Box color={'myGray.400'} fontSize={'xs'} lineHeight={'20px'} h={'20px'}>
              {t('app:empty_folder')}
            </Box>
          )}
        </MyBox>
      );
    },
    [currentColumnIndex, isItemClickLoading, isItemSelectLoading, renderItemList, t]
  );

  // For LexicalTypeaheadMenuPlugin compatibility
  const menuOptions = useMemo(() => {
    return skillOptions.flatMap((item) =>
      item.list.map((item) => ({
        key: getSkillItemKey(item),
        ...item
      }))
    );
  }, [skillOptions]);
  const onSelectOption = useCallback(
    async (
      selectedOption: any,
      nodeToRemove: unknown,
      closeMenu: () => void,
      matchingString: string | null
    ) => {
      void nodeToRemove;

      // Step 1: Call async onClick handler (outside editor.update)
      const result = await selectedOption.onClick?.(selectedOption.id, selectedOption.source);

      // Step 2: Update editor with the skill (inside a fresh editor.update)
      if (result) {
        insertSkillResult(result, matchingString);
        updateMenuOpen(false);

        // Close menu after editor update to avoid flushSync warning
        setTimeout(() => {
          closeMenu();
        }, 0);
      } else {
        // If onClick didn't return a skillId, just close the menu
        closeMenu();
      }
    },
    [insertSkillResult, updateMenuOpen]
  );
  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('@', {
    minLength: 0
  });

  return (
    <LexicalTypeaheadMenuPlugin
      onQueryChange={(matchingString) => {
        // Update menu open state based on query
        updateMenuOpen(matchingString !== null);
      }}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={menuOptions}
      menuRenderFn={(anchorElementRef, { selectOptionAndCleanUp }) => {
        if (anchorElementRef.current === null) return null;

        menuAnchorRef.current = anchorElementRef.current;
        const shouldShow = skillOptions.length > 0 && isFocus;

        return ReactDOM.createPortal(
          <Box
            ref={(element) => {
              menuElementRef.current = element;
            }}
            visibility={shouldShow ? 'visible' : 'hidden'}
            position="relative"
            zIndex={99999}
            w={MENU_WIDTH}
            h={MENU_HEIGHT}
            p={2}
            bg={'#fbfbfc'}
            borderRadius={'12px'}
            overflowX={'auto'}
            overflowY={'hidden'}
            sx={{
              scrollbarColor: 'var(--chakra-colors-myGray-300) transparent',
              scrollbarWidth: 'auto',
              '&::-webkit-scrollbar': { height: '8px' },
              '&::-webkit-scrollbar-thumb': {
                background: 'var(--chakra-colors-myGray-300)',
                borderRadius: '4px'
              },
              '&::-webkit-scrollbar-track': { background: 'transparent' }
            }}
          >
            <Flex align={'stretch'} gap={2} h={'100%'} w={'max-content'}>
              {skillOptions.map((column, index) =>
                renderColumn(column, index, (item, option) => {
                  if (!option.onClick || isExpandable(item, option)) return;
                  selectOptionAndCleanUp({
                    key: getSkillItemKey(item),
                    ...item,
                    onClick: option.onClick
                  } as any);
                })
              )}
            </Flex>
          </Box>,
          anchorElementRef.current!
        );
      }}
    />
  );
}
