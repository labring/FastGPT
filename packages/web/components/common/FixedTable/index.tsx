import { Box, Table, Thead, type BoxProps, type TableProps } from '@chakra-ui/react';
import React, {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useImperativeHandle
} from 'react';

export type FixedTableScrollMode = 'virtual' | 'normal';

export type FixedTableRenderContext = {
  /** 表头铺满内容区，滚动条宽度由右侧 padding 吸收。 */
  headerTableWidth: string;
  /** 固定表格的实际纵向滚动容器。虚拟列表需要复用这个 ref。 */
  bodyContainerRef: RefObject<HTMLDivElement>;
};

type FixedTableLayoutProps = {
  /** virtual 模式由调用方渲染虚拟 Body，normal 模式由调用方渲染普通 Body。 */
  scrollMode: FixedTableScrollMode;
  /** 默认按容器宽度分配列；仅显式开启时允许内容自由撑宽。 */
  horizontalScroll?: boolean;
  renderHeader?: (context: FixedTableRenderContext) => ReactNode;
  renderBody: (context: FixedTableRenderContext) => ReactNode;
  /** 任何需要固定在表体下方的内容，例如分页器或批量操作栏。 */
  footer?: ReactNode;
  /** 传入已有滚动容器时，必须让它同时作为 Body 的 ref。 */
  bodyRef?: RefObject<HTMLDivElement>;
  rootProps?: BoxProps;
  headerProps?: BoxProps;
  bodyProps?: BoxProps;
  footerProps?: BoxProps;
  scrollContainer?: React.ComponentType<
    BoxProps & { children: ReactNode; ScrollContainerRef?: RefObject<HTMLDivElement> }
  >;
};

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * 管理固定表头布局的两个滚动容器，并将表体的横向滚动同步到表头。
 * 该实现只属于 FixedTableLayout，避免把表头同步能力暴露成各页面都要组合的独立 Hook。
 */
const useFixedTableLayout = (externalBodyRef?: RefObject<HTMLDivElement>) => {
  const internalBodyRef = useRef<HTMLDivElement>(null);
  const headerContainerRef = useRef<HTMLDivElement>(null);
  const bodyContainerRef = externalBodyRef ?? internalBodyRef;

  useBrowserLayoutEffect(() => {
    const body = bodyContainerRef.current;
    const header = headerContainerRef.current;
    if (!body || !header) return;
    const headerPadding = header.querySelector<HTMLElement>('[data-fixed-table-header-padding]');
    const bodyPadding = body.querySelector<HTMLElement>('[data-fixed-table-body-content]');
    if (!headerPadding || !bodyPadding) return;

    const updateScrollbarWidth = () => {
      // 先读取 Chakra 原始响应式 padding，再让滚动条占用右侧留白。
      // 不足一条滚动条宽度时，仅将 header 右留白提升至该宽度，避免负 padding。
      headerPadding.style.removeProperty('padding-right');
      bodyPadding.style.removeProperty('padding-right');
      const bodyStyle = getComputedStyle(body);
      const scrollbarWidth = Math.max(
        0,
        body.offsetWidth -
          body.clientWidth -
          (Number.parseFloat(bodyStyle.borderLeftWidth) || 0) -
          (Number.parseFloat(bodyStyle.borderRightWidth) || 0)
      );
      const headerRight = Number.parseFloat(getComputedStyle(headerPadding).paddingRight) || 0;
      const bodyRight = Number.parseFloat(getComputedStyle(bodyPadding).paddingRight) || 0;
      headerPadding.style.paddingRight = `${Math.max(headerRight, scrollbarWidth)}px`;
      bodyPadding.style.paddingRight = `${Math.max(0, bodyRight - scrollbarWidth)}px`;
    };
    const syncHorizontalScroll = () => {
      header.scrollLeft = body.scrollLeft;
    };

    updateScrollbarWidth();
    syncHorizontalScroll();

    const resizeObserver = new ResizeObserver(updateScrollbarWidth);
    resizeObserver.observe(body);
    resizeObserver.observe(headerPadding);
    resizeObserver.observe(bodyPadding);
    window.addEventListener('resize', updateScrollbarWidth);
    body.addEventListener('scroll', syncHorizontalScroll, { passive: true });

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateScrollbarWidth);
      headerPadding.style.removeProperty('padding-right');
      bodyPadding.style.removeProperty('padding-right');
      body.removeEventListener('scroll', syncHorizontalScroll);
    };
  }, [externalBodyRef]);

  return {
    headerContainerRef,
    bodyContainerRef,
    headerTableWidth: '100%'
  };
};

/**
 * 分离横向留白和布局样式。留白交给 head/body 各自的外层 Box，
 * 上下留白仍保留在原层级；省略未传入的值，使局部 padding 能覆盖根级默认值。
 */
const splitHorizontalPadding = (props: BoxProps = {}) => {
  // 横向留白属于内容而非外框，避免把实际滚动区和滚动条一起向内挤。
  // 上下留白仍留在外框，避免在 header/body/footer 三个区域重复应用。
  const {
    p,
    padding,
    px,
    paddingX,
    pl,
    paddingLeft,
    pr,
    paddingRight,
    ps,
    paddingStart,
    pe,
    paddingEnd,
    paddingInline,
    paddingInlineStart,
    paddingInlineEnd,
    ...layoutProps
  } = props;
  const contentPadding: BoxProps = {
    px: px ?? paddingX ?? p ?? padding,
    pl: pl ?? paddingLeft,
    pr: pr ?? paddingRight,
    ps: ps ?? paddingStart,
    pe: pe ?? paddingEnd,
    paddingInline,
    paddingInlineStart,
    paddingInlineEnd
  };
  return {
    paddingProps: Object.fromEntries(
      Object.entries(contentPadding).filter(([, value]) => value !== undefined)
    ),
    layoutProps: { py: p ?? padding, ...layoutProps }
  };
};

/** 固定表头与单一表体滚动区；横向留白只由各自的内容外层 Box 承担。 */
export const FixedTableLayout = ({
  scrollMode,
  horizontalScroll = false,
  renderHeader,
  renderBody,
  footer,
  bodyRef,
  rootProps,
  headerProps,
  bodyProps,
  footerProps,
  scrollContainer: ScrollContainer
}: FixedTableLayoutProps) => {
  const { headerContainerRef, bodyContainerRef, headerTableWidth } = useFixedTableLayout(bodyRef);
  const renderContext = { bodyContainerRef, headerTableWidth };
  const { paddingProps, layoutProps } = splitHorizontalPadding(rootProps);
  const contentPadding = { px: 4, ...paddingProps };
  const { paddingProps: headerPadding, layoutProps: headerStyles } =
    splitHorizontalPadding(headerProps);
  const { paddingProps: bodyPadding, layoutProps: bodyStyles } = splitHorizontalPadding(bodyProps);
  const bodyContent = (
    <Box
      data-fixed-table-body-content=""
      minW="100%"
      w={horizontalScroll ? 'fit-content' : '100%'}
      whiteSpace={horizontalScroll ? 'nowrap' : 'normal'}
      overflowWrap={horizontalScroll ? 'normal' : 'anywhere'}
      sx={
        horizontalScroll
          ? undefined
          : {
              '& > table': { width: '100%', minWidth: '0 !important', maxWidth: '100%' },
              '& > table > tbody > tr > td': { minWidth: 0, overflowWrap: 'anywhere' },
              '& > table > tbody > tr > td > *': { maxWidth: '100%' }
            }
      }
      {...contentPadding}
      {...bodyPadding}
    >
      {renderBody(renderContext)}
    </Box>
  );

  return (
    <Box
      display={'flex'}
      flexDirection={'column'}
      h={'100%'}
      minW={'24px'}
      minH={0}
      data-fixed-table-scroll-mode={scrollMode}
      data-fixed-table-horizontal-scroll={horizontalScroll}
      {...layoutProps}
      py={layoutProps.py ?? 0}
    >
      {renderHeader && (
        <Box flexShrink={0} overflow={'hidden'} data-fixed-table-header="" ref={headerContainerRef}>
          <Box
            data-fixed-table-header-padding=""
            minW="100%"
            w={horizontalScroll ? 'fit-content' : '100%'}
            whiteSpace={horizontalScroll ? 'nowrap' : 'normal'}
            overflowWrap={horizontalScroll ? 'normal' : 'anywhere'}
            sx={
              horizontalScroll
                ? undefined
                : {
                    '& > [data-fixed-table-header-content] > table': { minWidth: '0 !important' }
                  }
            }
            {...contentPadding}
            {...headerPadding}
          >
            <Box
              data-fixed-table-header-content=""
              display="flex"
              sx={{ '& > table': { flexShrink: 0 } }}
              {...headerStyles}
            >
              {renderHeader(renderContext)}
            </Box>
          </Box>
        </Box>
      )}
      {ScrollContainer ? (
        <ScrollContainer
          flex={'1 1 0'}
          minH={0}
          overflow={'auto'}
          data-fixed-table-body=""
          {...bodyStyles}
          ScrollContainerRef={bodyContainerRef}
        >
          {bodyContent}
        </ScrollContainer>
      ) : (
        <Box
          flex={'1 1 0'}
          minH={0}
          overflow={'auto'}
          data-fixed-table-body=""
          {...bodyStyles}
          ref={bodyContainerRef}
        >
          {bodyContent}
        </Box>
      )}
      {footer && (
        <Box flexShrink={0} data-fixed-table-footer="" {...contentPadding} {...footerProps}>
          {footer}
        </Box>
      )}
    </Box>
  );
};

type FixedTableContainerProps = BoxProps & {
  /** 带边框的内嵌表：不留外侧 padding，最后一列表头延伸覆盖滚动条上方。 */
  flush?: boolean;
  /** 滚动 body 的背景色；仅需要覆盖滚动条留白时设置。 */
  bodyBg?: BoxProps['bg'];
  horizontalScroll?: boolean;
  footer?: ReactNode;
  /** 复用滚动加载组件作为唯一滚动容器，避免嵌套滚动导致触底加载失效。 */
  scrollContainer?: FixedTableLayoutProps['scrollContainer'];
};

/**
 * 将普通表格的自动布局结果同步给独立表头。
 * 只读取浏览器原生布局结果，不自行计算期望列宽或向 body 注入列宽。
 * 表体保留一个不可见的原生表头副本参与列宽计算，不重复挂载 React 组件或事件。
 * 副本使用 collapse 去掉行高，并移除 ID、禁用交互；动态表头和容器尺寸变化时重新同步。
 */
const useNormalTableColumns = (bodyRef: RefObject<HTMLDivElement>, flush: boolean) => {
  useBrowserLayoutEffect(() => {
    const body = bodyRef.current;
    const headerTable = body?.parentElement?.querySelector<HTMLTableElement>(
      '[data-fixed-table-header-content] > table'
    );
    const bodyTable = body?.querySelector<HTMLTableElement>(
      ':scope > [data-fixed-table-body-content] > table'
    );
    const header = headerTable?.tHead;
    if (!bodyTable || !headerTable || !header) return;

    let sizingHeader: HTMLTableSectionElement | undefined;
    const columnGroup = document.createElement('colgroup');
    columnGroup.setAttribute('data-fixed-table-columns', '');
    headerTable.prepend(columnGroup);
    const syncWidths = () => {
      if (!sizingHeader) return;
      const renderedWidth = bodyTable.getBoundingClientRect().width;
      if (!renderedWidth) return; // 隐藏的弹窗/页签等待 ResizeObserver 在显示后同步。
      // 工作流画布使用 transform 缩放。DOMRect 是缩放后的尺寸，写回 CSS 前需还原，
      // 否则表头会被重复缩放，且不同 zoom 下列宽不一致。
      const computedWidth = Number.parseFloat(window.getComputedStyle(bodyTable).width);
      const width = computedWidth > 0 ? computedWidth : renderedWidth;
      const scale = renderedWidth / width;
      // 合并表头可能跨多行，收集所有列边界而非只读取第一行的 colspan。
      const edges = Array.from(sizingHeader.querySelectorAll('th, td'))
        .flatMap((cell) => {
          const rect = cell.getBoundingClientRect();
          return [rect.left, rect.right];
        })
        .sort((a, b) => a - b)
        .reduce<number[]>((boundaries, edge) => {
          const previous = boundaries.at(-1);
          // transform 后相邻单元格的同一条边可能相差浮点尾数，不能当作额外的列。
          if (previous === undefined || edge - previous > 0.25 * scale) boundaries.push(edge);
          return boundaries;
        }, []);
      const widths = edges.slice(1).map((edge, index) => (edge - edges[index]) / scale);
      // 内嵌表只延长末列表头，其他列边界仍严格采用 body 的原生布局结果。
      const bodyStyle = getComputedStyle(body!);
      const gutter = flush
        ? Math.max(
            0,
            body!.offsetWidth -
              body!.clientWidth -
              (Number.parseFloat(bodyStyle.borderLeftWidth) || 0) -
              (Number.parseFloat(bodyStyle.borderRightWidth) || 0)
          )
        : 0;
      if (widths.length > 0) widths[widths.length - 1] += gutter;
      headerTable.style.setProperty('--fixed-table-width', `${width + gutter}px`);
      if (columnGroup.children.length !== widths.length) {
        columnGroup.replaceChildren(...widths.map(() => document.createElement('col')));
      }
      widths.forEach((columnWidth, index) => {
        const col = columnGroup.children[index];
        if (col instanceof HTMLElement) col.style.width = `${columnWidth}px`;
      });
    };
    const resizeObserver = new ResizeObserver(syncWidths);
    const rebuildSizingHeader = () => {
      const clone = header.cloneNode(true);
      if (!(clone instanceof HTMLTableSectionElement)) return;
      sizingHeader?.querySelectorAll('th, td').forEach((cell) => resizeObserver.unobserve(cell));
      sizingHeader?.remove();
      sizingHeader = clone;
      clone.setAttribute('data-fixed-table-sizing', '');
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('inert', '');
      clone.style.visibility = 'collapse';
      // inert 阻止交互，disabled/name 清理同时排除原生表单校验和提交。
      clone.querySelectorAll('input, select, textarea, button').forEach((element) => {
        element.setAttribute('disabled', '');
        element.removeAttribute('name');
      });
      [clone, ...Array.from(clone.querySelectorAll('[id]'))].forEach((element) =>
        element.removeAttribute('id')
      );
      bodyTable.insertBefore(clone, bodyTable.tBodies[0] ?? null);
      clone.querySelectorAll('th, td').forEach((cell) => resizeObserver.observe(cell));
      syncWidths();
    };

    rebuildSizingHeader();
    resizeObserver.observe(bodyTable);
    const isFixedLayout = window.getComputedStyle(bodyTable).tableLayout === 'fixed';
    const bodyObserver = new MutationObserver(syncWidths);
    Array.from(bodyTable.tBodies).forEach((tbody) =>
      bodyObserver.observe(tbody, {
        childList: true,
        characterData: !isFixedLayout,
        subtree: true
      })
    );
    // 只监听内容/列结构与 class，排除本 Hook 写入的 style，避免观察器循环。
    const mutationObserver = new MutationObserver(rebuildSizingHeader);
    mutationObserver.observe(header, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'colspan', 'rowspan']
    });
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      bodyObserver.disconnect();
      sizingHeader?.remove();
      columnGroup.remove();
      headerTable.style.removeProperty('--fixed-table-width');
    };
  }, [bodyRef, flush]);
};

/**
 * 普通表格入口：将 Table 的可见 Thead 放到滚动区外，表体原生布局负责计算列宽。
 * 外层负责尺寸和上下留白，head/body 各自的包装 Box 承担横向留白。
 * body 包装 Box 位于滚动区内，使滚动条仍贴齐容器边缘。
 * ref 指向实际滚动区，footer 位于滚动区外。
 * 内嵌表默认最多 420px，高度受限的列表页可通过 maxH="none" 和 flex 填满剩余空间。
 */
export const FixedTableContainer = React.forwardRef<HTMLDivElement, FixedTableContainerProps>(
  function FixedTableContainer(
    {
      children,
      footer,
      scrollContainer,
      horizontalScroll = false,
      flush = false,
      bodyBg,
      ...rootProps
    },
    ref
  ) {
    const bodyRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => bodyRef.current!);
    useNormalTableColumns(bodyRef, flush);

    // 调用方仍传入完整 Table；只拆布局，不复制表头中的 Checkbox、菜单等 React 组件。
    const content = React.Children.toArray(children);
    const table = content.find(
      (child): child is React.ReactElement<TableProps & React.RefAttributes<HTMLTableElement>> =>
        React.isValidElement(child) && (child.type === Table || child.type === 'table')
    );
    const tableChildren = React.Children.toArray(table?.props.children);
    const isHead = (child: ReactNode) =>
      React.isValidElement(child) && (child.type === Thead || child.type === 'thead');
    const head = tableChildren.filter(isHead);
    const headerTable =
      table && head.length > 0
        ? React.cloneElement(table, {
            id: undefined,
            ref: null,
            children: head
          })
        : undefined;
    const bodyContent = headerTable
      ? content.map((child) =>
          child === table
            ? React.cloneElement(table!, {
                children: tableChildren.filter((child) => !isHead(child))
              })
            : child
        )
      : children;

    return (
      <FixedTableLayout
        scrollMode="normal"
        horizontalScroll={horizontalScroll}
        bodyRef={bodyRef}
        renderHeader={headerTable ? () => headerTable : undefined}
        headerProps={{
          sx: {
            '& > table': {
              flexShrink: 0,
              tableLayout: 'fixed',
              width: 'var(--fixed-table-width) !important',
              overflow: 'visible'
            }
          }
        }}
        scrollContainer={scrollContainer}
        rootProps={{
          h: 'auto',
          maxH: '420px',
          minW: '24px',
          ...(flush ? { px: 0 } : {}),
          ...rootProps,
          sx: {
            ...rootProps.sx,
            ...(flush
              ? { '& [data-fixed-table-header-padding]': { paddingRight: '0 !important' } }
              : {})
          },
          overflow: 'hidden',
          overflowX: 'hidden',
          overflowY: 'hidden'
        }}
        bodyProps={{
          flex: '1 1 auto',
          minW: 0,
          ...(bodyBg ? { bg: bodyBg } : {}),
          position: 'relative',
          sx: {
            '& > [data-fixed-table-body-content] > table': { overflow: 'visible' }
          }
        }}
        renderBody={() => bodyContent}
        footer={footer}
      />
    );
  }
);
