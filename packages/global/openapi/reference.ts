import { FASTGPT_WEB_REQUEST_HEADER, FASTGPT_WEB_REQUEST_VALUE } from '../common/system/constants';

const scalarApiReferenceCss = `
.light-mode {
  --fastgpt-api-sidebar-title-color: #111824;
  --fastgpt-api-sidebar-active-color: #383F50;
  --fastgpt-api-sidebar-item-color: #667085;
}

.dark-mode {
  --fastgpt-api-sidebar-title-color: #FEFEFE;
  --fastgpt-api-sidebar-active-color: #C3C5C6;
  --fastgpt-api-sidebar-item-color: #929495;
}

/* Scalar 默认把具体值藏在悬浮层中；统一在字段信息行直接显示，并保留点击复制。 */
.scalar-app .property-default {
  flex-direction: row;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.scalar-app .property-default::before {
  display: none;
}

.scalar-app .property-default-label span {
  border-bottom: 0;
}

.scalar-app .property-default-value-list {
  position: static;
  display: flex;
  transform: none;
  background: transparent;
  box-shadow: none;
  border: 0;
  padding: 0;
  min-width: 0;
  max-width: 24ch;
}

.scalar-app .property-default-value {
  width: auto;
  min-width: 0;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--scalar-color-2);
}

.scalar-app .property-default-value svg {
  display: none;
}

/* 只限制可选值内容区域，标题留在滚动区域外。 */
.scalar-app .property-enum-values {
  max-height: 200px;
  overflow-y: auto;
  overscroll-behavior-y: contain;
}

.scalar-app .property-enum-values > li:has(.enum-toggle-button) {
  display: none;
}

/* Query union 的 form/explode 分组没有实际的 query 字段，直接从格式选择器开始展示。 */
.scalar-app .property-heading:has([id$='.query.query']) {
  display: none;
}

.scalar-app
  [data-sidebar-id*='/tag-group/']:not([data-sidebar-id*='/tag/'])
  > [aria-selected] {
  color: var(--fastgpt-api-sidebar-title-color);
  margin-top: 4px;
  font-weight: 700;
}

.scalar-app
  [data-sidebar-id]
  > button:not([aria-selected='true']):not(.text-sidebar-c-active) {
  color: var(--fastgpt-api-sidebar-item-color);
}

.scalar-app
  [data-sidebar-id]
  > button:is([aria-selected='true'], .text-sidebar-c-active) {
  color: var(--fastgpt-api-sidebar-active-color);
  font-weight: 400;
}

.scalar-app .sidebar-heading-type {
  min-width: 42px;
  height: 20px;
  justify-content: center;
  padding-inline: 8px;
  border: 0;
  border-radius: 999px;
  font-size: 10px;
  line-height: 1;
}

.sidebar-heading-type--get {
  color: #1D6FE8;
  background-color: #E8F1FF;
}

.sidebar-heading-type--post {
  color: #0F8B57;
  background-color: #E6F7EE;
}

.sidebar-heading-type--put,
.sidebar-heading-type--patch {
  color: #B86B00;
  background-color: #FFF1D8;
}

.sidebar-heading-type--delete {
  color: #C93D3D;
  background-color: #FDEAEA;
}

.sidebar-heading-type--options {
  color: #7A55D9;
  background-color: #F1ECFF;
}

.sidebar-heading-type--head,
.sidebar-heading-type--trace {
  color: #5B6678;
  background-color: #EEF1F5;
}

.dark-mode .sidebar-heading-type--get {
  color: #8BBEFF;
  background-color: rgba(58, 122, 210, 0.2);
}

.dark-mode .sidebar-heading-type--post {
  color: #72DBA2;
  background-color: rgba(28, 142, 86, 0.22);
}

.dark-mode .sidebar-heading-type--put,
.dark-mode .sidebar-heading-type--patch {
  color: #F0B96A;
  background-color: rgba(190, 115, 16, 0.22);
}

.dark-mode .sidebar-heading-type--delete {
  color: #F48A8A;
  background-color: rgba(190, 62, 62, 0.22);
}

.dark-mode .sidebar-heading-type--options {
  color: #B7A3FF;
  background-color: rgba(116, 86, 214, 0.24);
}

.dark-mode .sidebar-heading-type--head,
.dark-mode .sidebar-heading-type--trace {
  color: #B5BFCE;
  background-color: rgba(98, 111, 130, 0.24);
}

/*
 * Scalar does not create section-container for operations directly under a tag group.
 * Keep those sections aligned with the regular tag sections on desktop.
 */
@media (min-width: 1024px) {
  .scalar-app
    .narrow-references-container
    section.section:not(.section-container section) {
    margin-inline: 60px;
  }
}

`;

/**
 * 展开 Scalar 延迟渲染的完整枚举，以及每个接口唯一的响应。
 * 只在控件首次出现时设置默认状态，保留用户手动收起响应的选择；销毁时停止监听。
 */
const createDefaultExpansionPlugin = () => {
  let observer: MutationObserver | undefined;
  const expandedButtons = new WeakSet<HTMLButtonElement>();
  const enumSelector = '.scalar-app .property-enum-values .enum-toggle-button';
  // 响应列表使用 aria-label，参数列表使用 aria-labelledby；只统计同一个列表的直接子项。
  const responseSelector =
    '.scalar-app ul[aria-label] > .parameter-item:only-child > button.parameter-item-trigger[aria-expanded]';
  const selector = `${enumSelector}, ${responseSelector}`;

  const expandDefaults = (node: Node) => {
    if (!(node instanceof Element)) return;
    const buttons = node.matches(selector) ? [node] : node.querySelectorAll(selector);

    for (const button of buttons) {
      if (!(button instanceof HTMLButtonElement)) continue;
      if (expandedButtons.has(button)) continue;

      // 同一批 DOM 变更可能重复包含按钮；先登记，避免 Vue 提交展开状态前再次点击。
      expandedButtons.add(button);
      if (button.matches(enumSelector) && button.querySelector('.rotate-45')) continue;
      if (button.matches(responseSelector) && button.getAttribute('aria-expanded') !== 'false') {
        continue;
      }
      button.click();
    }
  };

  return {
    name: 'fastgpt-default-expansion',
    extensions: [],
    hooks: {
      onInit: () => {
        if (typeof document === 'undefined' || !document.body) return;
        observer?.disconnect();
        observer = new MutationObserver((records) => {
          records.forEach((record) => record.addedNodes.forEach(expandDefaults));
        });
        // Scalar 在挂载前调用 onInit，监听 body 才能覆盖首次插入的文档根节点。
        observer.observe(document.body, { childList: true, subtree: true });
        expandDefaults(document.body);
      },
      onDestroy: () => observer?.disconnect()
    }
  };
};

export const getScalarOpenApiReferenceConfig = (
  url: string,
  options?: {
    defaultOpenAllTags?: boolean;
    onLoaded?: (slug: string) => void | Promise<void>;
  }
) =>
  ({
    customCss: scalarApiReferenceCss,
    plugins: Array.of(createDefaultExpansionPlugin),
    defaultOpenAllTags: options?.defaultOpenAllTags,
    // 保留 schema 声明顺序，避免字母排序或必填优先拆散分页、鉴权和时间范围字段。
    orderSchemaPropertiesBy: 'preserve',
    orderRequiredPropertiesFirst: false,
    hideDarkModeToggle: false,
    hideClientButton: true,
    localization: {
      locale: 'zh-CN',
      translations: {
        common: {
          values: '可选值'
        },
        operation: {
          queryParameters: 'Query'
        },
        schema: {
          anyOf: '选择一种格式',
          default: '默认值：'
        }
      }
    },
    onRequestBuilt: ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      // 在线调试与主站同源时会携带登录 Cookie，需使用与主站请求相同的 Web 标记。
      if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
        request.headers.set(FASTGPT_WEB_REQUEST_HEADER, FASTGPT_WEB_REQUEST_VALUE);
      }
    },
    onLoaded: options?.onLoaded,
    showToolbar: 'never',
    theme: 'default',
    url
  }) as const;
