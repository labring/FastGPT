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
const PAGE_SIZE = 50;
const PAGE_LOAD_THRESHOLD = 80;

export type SkillOptionPageType = {
  list: SkillItemType[];
  total: number;
};

export type SkillOptionPageLoader = (
  params: { offset: number; pageSize: number },
  cancelToken?: AbortController
) => Promise<SkillOptionPageType>;

export type SkillFolderPageLoader = (
  id: string,
  source: string | undefined,
  params: { offset: number; pageSize: number },
  cancelToken?: AbortController
) => Promise<SkillOptionPageType>;

export type SkillOptionItemType = {
  description?: string;
  list: SkillItemType[];
  total?: number;
  folderExpandMode?: 'auto' | 'manual';
  onSelect?: (id: string) => Promise<SkillOptionItemType | undefined>;
  onClick?: (id: string, source?: string) => Promise<SkillClickResult | undefined>;
  loadPage?: SkillOptionPageLoader;
  onFolderLoad?: SkillFolderPageLoader;
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

const mergeSkillItems = (current: SkillItemType[], incoming: SkillItemType[]) => {
  const keys = new Set(current.map(getSkillItemKey));
  return current.concat(
    incoming.filter((item) => {
      const key = getSkillItemKey(item);
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    })
  );
};

const isManualFolder = (item: SkillItemType, option: SkillOptionItemType) =>
  Boolean(item.isFolder && option.folderExpandMode === 'manual');

type ColumnPageState = {
  option: SkillOptionItemType;
  offset: number;
  total: number;
  loading: boolean;
  error: boolean;
  lastRequestedOffset?: number;
  loadedOffsets: Set<number>;
  requestId: number;
  controller?: AbortController;
};

type ColumnPageStateView = Pick<ColumnPageState, 'offset' | 'total' | 'loading' | 'error'>;

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
  const [isMenuPositioned, setIsMenuPositioned] = useState(false);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
  const [menuQueryVersion, setMenuQueryVersion] = useState(0);
  const isMenuOpenRef = useRef(false);

  const updateMenuOpen = useCallback((open: boolean) => {
    const wasOpen = isMenuOpenRef.current;
    isMenuOpenRef.current = open;
    if (!open || !wasOpen) {
      setIsMenuPositioned(false);
    }
    if (!open) {
      setHasHorizontalOverflow(false);
    }
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
  const folderRequestsRef = useRef<
    Map<string, { promise: Promise<SkillOptionPageType>; controller: AbortController }>
  >(new Map());
  const [loadingFolderIds, setLoadingFolderIds] = useState<Set<string>>(new Set());
  const columnPageStateRef = useRef<Map<number, ColumnPageState>>(new Map());
  const columnElementRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const [columnPageStates, setColumnPageStates] = useState<Record<number, ColumnPageStateView>>({});

  // Refs for scroll management
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const menuAnchorRef = useRef<HTMLElement | null>(null);
  const menuElementRef = useRef<HTMLDivElement | null>(null);
  const menuPositionFrameRef = useRef<number | null>(null);
  const matchingStringRef = useRef<string | null>(null);

  const updateHorizontalOverflow = useCallback(() => {
    const menuElement = menuElementRef.current;
    if (!menuElement) return;

    setHasHorizontalOverflow(menuElement.scrollWidth > menuElement.clientWidth);
  }, []);

  const getTriggerRect = useCallback(() => {
    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode;
    if (
      !selection ||
      !selection.isCollapsed ||
      !anchorNode ||
      anchorNode.nodeType !== Node.TEXT_NODE
    ) {
      return undefined;
    }

    const triggerLength = (matchingStringRef.current?.length ?? 0) + 1;
    const startOffset = selection.anchorOffset - triggerLength;
    if (startOffset < 0) return undefined;

    const range = document.createRange();
    try {
      range.setStart(anchorNode, startOffset);
      range.setEnd(anchorNode, selection.anchorOffset);
      return range.getBoundingClientRect();
    } catch {
      return undefined;
    }
  }, []);

  const updateMenuPosition = useCallback(() => {
    const anchorElement = menuAnchorRef.current;
    const menuElement = menuElementRef.current;
    if (!anchorElement || !menuElement) return;

    const currentAnchorLeft = Number.parseFloat(anchorElement.style.left);
    if (!Number.isFinite(currentAnchorLeft)) return;

    const menuRect = menuElement.getBoundingClientRect();
    const triggerRect = getTriggerRect();
    const viewportWidth = window.innerWidth;
    const edgePadding = 8;
    const maxLeft = Math.max(edgePadding, viewportWidth - menuRect.width - edgePadding);
    const nextLeft = Math.min(Math.max(triggerRect?.left ?? menuRect.left, edgePadding), maxLeft);
    const anchorRect = anchorElement.getBoundingClientRect();
    const nextOffset = nextLeft - anchorRect.left;
    const nextTransform = `translate3d(${nextOffset}px, 0, 0)`;

    // Keep Lexical as the single owner of the anchor position. The menu transform only corrects viewport overflow.
    if (menuElement.style.transform !== nextTransform) {
      menuElement.style.transform = nextTransform;
    }
    setIsMenuPositioned(true);
  }, [getTriggerRect]);

  const scheduleMenuPosition = useCallback(() => {
    if (menuPositionFrameRef.current !== null) {
      cancelAnimationFrame(menuPositionFrameRef.current);
    }

    menuPositionFrameRef.current = requestAnimationFrame(() => {
      menuPositionFrameRef.current = requestAnimationFrame(() => {
        menuPositionFrameRef.current = null;
        updateMenuPosition();
      });
    });
  }, [updateMenuPosition]);

  const setMenuElement = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) {
        menuElementRef.current?.style.removeProperty('transform');
      }
      menuElementRef.current = element;
      if (element && isMenuOpenRef.current) {
        setIsMenuPositioned(false);
        scheduleMenuPosition();
      }
    },
    [scheduleMenuPosition]
  );

  useEffect(() => {
    if (!isFocus || !isMenuOpen) return;

    const anchorElement = menuAnchorRef.current;
    const menuElement = menuElementRef.current;
    if (!anchorElement || !menuElement) return;

    scheduleMenuPosition();
    updateHorizontalOverflow();

    const anchorObserver = new MutationObserver(scheduleMenuPosition);
    anchorObserver.observe(anchorElement, {
      attributes: true,
      attributeFilter: ['style']
    });

    const menuObserver = new ResizeObserver(() => {
      scheduleMenuPosition();
      updateHorizontalOverflow();
    });
    menuObserver.observe(menuElement);

    window.addEventListener('resize', scheduleMenuPosition);

    return () => {
      anchorObserver.disconnect();
      menuObserver.disconnect();
      window.removeEventListener('resize', scheduleMenuPosition);

      if (menuPositionFrameRef.current !== null) {
        cancelAnimationFrame(menuPositionFrameRef.current);
        menuPositionFrameRef.current = null;
      }
    };
  }, [
    isFocus,
    isMenuOpen,
    menuQueryVersion,
    scheduleMenuPosition,
    skillOptions.length,
    updateHorizontalOverflow
  ]);

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
    if (item.children) {
      const folderExpandMode = item.children.folderExpandMode ?? option.folderExpandMode;
      return folderExpandMode === item.children.folderExpandMode
        ? item.children
        : { ...item.children, folderExpandMode };
    }

    if (item.folderChildren) {
      return {
        description: option.description,
        list: item.folderChildren,
        folderExpandMode: option.folderExpandMode,
        onClick: option.onClick,
        onFolderLoad: option.onFolderLoad
      };
    }

    if (item.tools?.length) {
      return {
        list: item.tools,
        folderExpandMode: option.folderExpandMode,
        onClick: option.onClick
      };
    }

    return undefined;
  }, []);

  const publishColumnPageState = useCallback((columnIndex: number, state: ColumnPageState) => {
    setColumnPageStates((prev) => ({
      ...prev,
      [columnIndex]: {
        offset: state.offset,
        total: state.total,
        loading: state.loading,
        error: state.error
      }
    }));
  }, []);

  const resetColumnPageState = useCallback(
    (columnIndex: number, option?: SkillOptionItemType) => {
      const currentState = columnPageStateRef.current.get(columnIndex);
      if (option && currentState?.option === option) return;

      currentState?.controller?.abort();

      if (!option) {
        columnPageStateRef.current.delete(columnIndex);
        setColumnPageStates((prev) => {
          if (!(columnIndex in prev)) return prev;
          const next = { ...prev };
          delete next[columnIndex];
          return next;
        });
        return;
      }

      const total = option.total ?? option.list.length;
      const nextState: ColumnPageState = {
        option,
        offset: option.list.length,
        total,
        loading: false,
        error: false,
        loadedOffsets: new Set(option.list.length > 0 || total === 0 ? [0] : []),
        requestId: 0
      };
      columnPageStateRef.current.set(columnIndex, nextState);
      publishColumnPageState(columnIndex, nextState);
    },
    [publishColumnPageState]
  );

  const clearColumnPageStatesAfter = useCallback((columnIndex: number) => {
    columnPageStateRef.current.forEach((state, index) => {
      if (index < columnIndex) return;
      state.controller?.abort();
      columnPageStateRef.current.delete(index);
    });

    setColumnPageStates((prev) => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach((key) => {
        if (Number(key) < columnIndex) return;
        delete next[Number(key)];
        changed = true;
      });
      return changed ? next : prev;
    });
  }, []);

  const appendColumn = useCallback(
    (columnIndex: number, option?: SkillOptionItemType) => {
      if (option) {
        resetColumnPageState(columnIndex + 1, option);
      } else {
        clearColumnPageStatesAfter(columnIndex + 1);
      }

      setSkillOptions((prev) => {
        const next = prev.slice(0, columnIndex + 1);
        if (option) next.push(option);
        return next;
      });
    },
    [clearColumnPageStatesAfter, resetColumnPageState]
  );

  const loadColumnPage = useCallback(
    async (columnIndex: number, option: SkillOptionItemType, offset: number) => {
      if (!option.loadPage) return;

      let state = columnPageStateRef.current.get(columnIndex);
      if (!state || state.option !== option) {
        resetColumnPageState(columnIndex, option);
        state = columnPageStateRef.current.get(columnIndex);
      }
      if (!state || state.loading || state.loadedOffsets.has(offset) || offset >= state.total) {
        return;
      }

      const controller = new AbortController();
      const requestId = state.requestId + 1;
      state.loading = true;
      state.error = false;
      state.lastRequestedOffset = offset;
      state.requestId = requestId;
      state.controller = controller;
      publishColumnPageState(columnIndex, state);

      try {
        const page = await option.loadPage({ offset, pageSize: PAGE_SIZE }, controller);
        const latestState = columnPageStateRef.current.get(columnIndex);
        if (
          controller.signal.aborted ||
          !latestState ||
          latestState.option !== option ||
          latestState.requestId !== requestId
        ) {
          return;
        }

        const nextOption: SkillOptionItemType = {
          ...option,
          list: mergeSkillItems(option.list, page.list),
          total: page.total
        };
        latestState.option = nextOption;
        latestState.offset = Math.max(latestState.offset, offset + page.list.length);
        latestState.total = page.total;
        latestState.loadedOffsets.add(offset);
        latestState.loading = false;
        latestState.error = false;
        latestState.controller = undefined;

        setSkillOptions((prev) => {
          if (prev[columnIndex] !== option) return prev;
          const next = [...prev];
          next[columnIndex] = nextOption;
          return next;
        });
        publishColumnPageState(columnIndex, latestState);
      } catch (error) {
        const latestState = columnPageStateRef.current.get(columnIndex);
        if (
          controller.signal.aborted ||
          !latestState ||
          latestState.option !== option ||
          latestState.requestId !== requestId
        ) {
          return;
        }

        latestState.loading = false;
        latestState.error = true;
        latestState.controller = undefined;
        publishColumnPageState(columnIndex, latestState);
        void error;
      }
    },
    [publishColumnPageState, resetColumnPageState]
  );

  const handleColumnScroll = useCallback(
    (columnIndex: number) => {
      const option = skillOptions[columnIndex];
      const state = columnPageStateRef.current.get(columnIndex);
      const element = columnElementRef.current.get(columnIndex);
      if (
        !option?.loadPage ||
        !state ||
        !element ||
        state.loading ||
        state.error ||
        state.offset >= state.total
      ) {
        return;
      }

      if (element.scrollHeight - element.scrollTop - element.clientHeight <= PAGE_LOAD_THRESHOLD) {
        void loadColumnPage(columnIndex, option, state.offset);
      }
    },
    [loadColumnPage, skillOptions]
  );

  const retryColumnPage = useCallback(
    (columnIndex: number) => {
      const option = skillOptions[columnIndex];
      const state = columnPageStateRef.current.get(columnIndex);
      if (!option?.loadPage || !state || state.loading) return;
      void loadColumnPage(columnIndex, option, state.lastRequestedOffset ?? state.offset);
    },
    [loadColumnPage, skillOptions]
  );

  // Resolve a root category or a folder explicitly expanded by the user.
  const { runAsync: handleItemSelect } = useRequest(
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

      if (childOption) {
        appendColumn(currentColumnIndex, childOption);
        return childOption;
      }

      if (item.isFolder && option.onFolderLoad) {
        const cachedOption = folderOptionsRef.current.get(itemKey);
        if (cachedOption) {
          appendColumn(currentColumnIndex, cachedOption);
          return cachedOption;
        }

        setLoadingFolderIds((prev) => new Set(prev).add(itemKey));
        let pendingRequest = folderRequestsRef.current.get(itemKey);
        if (!pendingRequest) {
          const controller = new AbortController();
          const promise = Promise.resolve().then(() =>
            option.onFolderLoad!(
              item.id,
              item.source,
              { offset: 0, pageSize: PAGE_SIZE },
              controller
            )
          );
          pendingRequest = { promise, controller };
          folderRequestsRef.current.set(itemKey, pendingRequest);
        }
        try {
          const page = await pendingRequest.promise;
          if (selectionRequestIdRef.current !== requestId) return;

          const nextOption: SkillOptionItemType = {
            description: option.description,
            list: page.list,
            total: page.total,
            folderExpandMode: option.folderExpandMode,
            loadPage: (params, cancelToken) =>
              option.onFolderLoad!(item.id, item.source, params, cancelToken),
            onClick: option.onClick,
            onFolderLoad: option.onFolderLoad
          };
          folderOptionsRef.current.set(itemKey, nextOption);
          appendColumn(currentColumnIndex, nextOption);
          return nextOption;
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
        const emptyOption = {
          description: option.description,
          list: [],
          folderExpandMode: option.folderExpandMode,
          onClick: option.onClick
        } satisfies SkillOptionItemType;
        appendColumn(currentColumnIndex, emptyOption);
        return emptyOption;
      }

      if (!option.onSelect) return;

      const result = await option.onSelect(item.id);
      if (selectionRequestIdRef.current !== requestId) return;

      appendColumn(currentColumnIndex, result);
      return result;
    },
    {
      refreshDeps: [appendColumn, getItemChildOption]
    }
  );

  useEffect(() => {
    const columnPageStates = columnPageStateRef.current;
    const folderRequests = folderRequestsRef.current;
    const timer = window.setTimeout(() => {
      selectionRequestIdRef.current += 1;
      columnPageStates.forEach((state) => state.controller?.abort());
      columnPageStates.clear();
      folderRequests.forEach(({ controller }) => controller.abort());
      folderRequests.clear();
      folderOptionsRef.current.clear();
      setColumnPageStates({});
      setSkillOptions([skillOption]);
      setSelectedRowIndex({ 0: 0 });
      setCurrentColumnIndex(0);
      setCurrentRowIndex(0);
      setInteractionMode('mouse');

      const firstItem = skillOption.list[0];
      if (firstItem && !isManualFolder(firstItem, skillOption)) {
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
      columnPageStates.forEach((state) => state.controller?.abort());
      folderRequests.forEach(({ controller }) => controller.abort());
    };
  }, [handleItemSelect, skillOption]);

  // Fill short columns so the next page is available without requiring a scrollbar first.
  useEffect(() => {
    if (!isMenuOpen) return;

    const frame = requestAnimationFrame(() => {
      skillOptions.forEach((option, columnIndex) => {
        const state = columnPageStateRef.current.get(columnIndex);
        const element = columnElementRef.current.get(columnIndex);
        if (
          !option.loadPage ||
          !state ||
          !element ||
          state.loading ||
          state.error ||
          state.offset >= state.total
        ) {
          return;
        }

        if (element.scrollHeight <= element.clientHeight + PAGE_LOAD_THRESHOLD) {
          void loadColumnPage(columnIndex, option, state.offset);
        }
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [columnPageStates, isMenuOpen, loadColumnPage, skillOptions]);

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

          // Keep manual folders collapsed while preserving automatic expansion elsewhere.
          const newIndex = currentRowIndex > 0 ? currentRowIndex - 1 : columnItems.length - 1;
          setCurrentRowIndex(newIndex);

          const currentOption = skillOptions[currentColumnIndex];
          const nextItem = columnItems[newIndex];
          if (currentOption && nextItem && !isManualFolder(nextItem, currentOption)) {
            void handleItemSelect({
              currentColumnIndex,
              item: nextItem,
              option: currentOption
            });
          }

          requestAnimationFrame(() => {
            scrollIntoView(currentColumnIndex, newIndex);
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

          // Keep manual folders collapsed while preserving automatic expansion elsewhere.
          const newIndex = currentRowIndex < columnItems.length - 1 ? currentRowIndex + 1 : 0;
          setCurrentRowIndex(newIndex);

          const currentOption = skillOptions[currentColumnIndex];
          const nextItem = columnItems[newIndex];
          if (currentOption && nextItem && !isManualFolder(nextItem, currentOption)) {
            void handleItemSelect({
              currentColumnIndex,
              item: nextItem,
              option: currentOption
            });
          }

          requestAnimationFrame(() => {
            scrollIntoView(currentColumnIndex, newIndex);
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
          const currentOption = skillOptions[prevColumnIndex];
          const currentItem = currentOption?.list[currentRowIndex];

          if (currentItem && currentOption && isManualFolder(currentItem, currentOption)) {
            void handleItemSelect({
              currentColumnIndex: prevColumnIndex,
              item: currentItem,
              option: currentOption
            }).then((nextOption) => {
              if (!nextOption || !isMenuOpenRef.current) return;

              const nextColumnIndex = prevColumnIndex + 1;
              setSelectedRowIndex((state) => ({
                ...state,
                [prevColumnIndex]: currentRowIndex
              }));
              setCurrentColumnIndex(nextColumnIndex);
              setCurrentRowIndex(0);

              requestAnimationFrame(() => {
                scrollIntoView(nextColumnIndex, 0);
              });
            });
            return prevColumnIndex;
          }

          if (prevColumnIndex >= skillOptions.length - 1) {
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
          const newColumnItem = newColumnItems?.[0];
          if (newColumnOption && newColumnItem && !isManualFolder(newColumnItem, newColumnOption)) {
            void handleItemSelect({
              currentColumnIndex: newColumnIndex,
              item: newColumnItem,
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
          clearColumnPageStatesAfter(newColumnIndex + 1);
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

        if (isManualFolder(latestItem, latestOption)) return true;

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
    getItemChildOption,
    clearColumnPageStatesAfter
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

              if (!isManualFolder(item, columnData)) {
                void handleItemSelect({
                  currentColumnIndex: columnIndex,
                  item,
                  option: columnData
                });
              }
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
      const pageState = columnPageStates[columnIndex];
      const canLoadMore = Boolean(
        columnData.loadPage && pageState && pageState.offset < pageState.total
      );

      return (
        <MyBox
          isLoading={
            (currentColumnIndex === columnIndex && isItemClickLoading) ||
            (pageState?.loading === true && columnData.list.length === 0)
          }
          ref={(element) => {
            if (element) {
              columnElementRef.current.set(columnIndex, element as HTMLDivElement);
            } else {
              columnElementRef.current.delete(columnIndex);
            }
          }}
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
          onScroll={() => handleColumnScroll(columnIndex)}
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
          {columnData.list.length === 0 && !pageState?.loading && !pageState?.error && (
            <Box color={'myGray.400'} fontSize={'xs'} lineHeight={'20px'} h={'20px'}>
              {t('app:empty_folder')}
            </Box>
          )}
          {canLoadMore && pageState?.loading && columnData.list.length > 0 && (
            <Box h={6} display={'flex'} alignItems={'center'} justifyContent={'center'}>
              <MyIcon name={'common/loading'} w={4} color={'myGray.400'} />
            </Box>
          )}
          {canLoadMore && pageState?.error && (
            <Box
              h={6}
              display={'flex'}
              alignItems={'center'}
              justifyContent={'center'}
              cursor={'pointer'}
              title={t('common:core.chat.retry')}
              aria-label={t('common:core.chat.retry')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                retryColumnPage(columnIndex);
              }}
            >
              <MyIcon name={'common/retryLight'} w={4} color={'myGray.500'} />
            </Box>
          )}
        </MyBox>
      );
    },
    [
      columnPageStates,
      currentColumnIndex,
      handleColumnScroll,
      isItemClickLoading,
      renderItemList,
      retryColumnPage,
      t
    ]
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
        matchingStringRef.current = matchingString;
        if (matchingString !== null) {
          setMenuQueryVersion((version) => version + 1);
        }
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
            ref={setMenuElement}
            visibility={shouldShow && isMenuPositioned ? 'visible' : 'hidden'}
            zIndex={99999}
            w={'max-content'}
            maxW={MENU_WIDTH}
            h={MENU_HEIGHT}
            p={2}
            bg={hasHorizontalOverflow ? '#fbfbfc' : 'transparent'}
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
