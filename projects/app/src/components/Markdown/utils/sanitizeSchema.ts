import { defaultSchema } from 'rehype-sanitize';

/**
 * FastGPT Markdown 受控 HTML 渲染安全白名单 Schema
 * 严格剔除 script、style、所有 on* 事件及 javascript:/data: 伪协议
 */
export const fastgptMarkdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    // 多媒体
    'video',
    'audio',
    'source',
    'track',
    // 交互与折叠
    'details',
    'summary',
    // 语义与文字排版
    'mark',
    'kbd',
    'sub',
    'sup',
    'font',
    'abbr',
    'ruby',
    'rt',
    'rp',
    // 进度与度量
    'progress',
    'meter',
    'figure',
    'figcaption',
    // 表格扩展
    'caption',
    'colgroup',
    'col',
    // 受限展示控件
    'button',
    'input',
    'textarea',
    'label'
  ],
  attributes: {
    ...defaultSchema.attributes,
    video: ['src', 'controls', 'poster', 'width', 'height', 'preload', 'loop', 'muted'],
    audio: ['src', 'controls', 'preload', 'loop', 'muted'],
    source: ['src', 'type'],
    track: ['src', 'kind', 'srcLang', 'srclang', 'label'],
    details: ['open', 'dataThink'],
    font: ['color', 'size', 'face'],
    abbr: ['title'],
    progress: ['value', 'max'],
    meter: ['value', 'min', 'max', 'low', 'high', 'optimum'],
    td: [
      ...(defaultSchema.attributes?.td || []),
      'rowSpan',
      'rowspan',
      'colSpan',
      'colspan',
      'align'
    ],
    th: [
      ...(defaultSchema.attributes?.th || []),
      'rowSpan',
      'rowspan',
      'colSpan',
      'colspan',
      'align'
    ],
    col: ['span', 'width'],
    colgroup: ['span', 'width'],
    button: ['dataVariant', 'dataSize', 'dataMessage', 'dataLink'],
    input: [
      ['type', 'text', 'checkbox', 'radio', 'number', 'range'],
      'name',
      'value',
      'placeholder',
      'checked',
      'disabled',
      'readOnly'
    ],
    textarea: ['name', 'placeholder', 'value', 'rows', 'disabled', 'readOnly'],
    label: ['htmlFor'],
    code: [['className', /^language-./, 'math-inline', 'math-display']]
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto', 'tel', 'cite', 'quote'],
    src: ['http', 'https'],
    poster: ['http', 'https'],
    dataLink: ['http', 'https']
  }
};
