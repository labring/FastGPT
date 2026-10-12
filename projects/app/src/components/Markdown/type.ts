import type { PluggableList } from 'unified';
import type { AProps } from './components/A';

/**
 * Markdown 主渲染组件 Props 约定
 */
export type MarkdownProps = {
  /** Markdown 原始待渲染文本内容 */
  source?: string;
  /** 是否处于大模型流式打字输出状态（开启打字动画与分块调度） */
  showAnimation?: boolean;
  /** 是否处于禁用交互状态（展示透明遮罩防点击） */
  isDisabled?: boolean;
  /** 是否禁用中文标点排版修正（默认开启中英空格和标点格式化） */
  forbidZhFormat?: boolean;
  /** 自定义外层容器样式类名 */
  className?: string;
  /** 是否在 HTML/HTM 代码块中默认开启沙箱 iframe 实时预览 */
  autoPreviewHtmlCodeBlock?: boolean;
} & AProps;

/**
 * 兼容旧代码命名的别名类型
 */
export type Props = MarkdownProps;

/**
 * 单个流式 Markdown 分块（Stream Block）渲染属性
 */
export type MarkdownStreamBlockProps = {
  /** 当前分块是否需要执行字符淡入打字动画 */
  animated: boolean;
  /** 分块的稳定唯一标识（格式: `${streamVersion}:${blockIndex}`） */
  blockId: string;
  /** 当前分块在整体文档中的字符起始偏移量 */
  blockOffset: number;
  /** 当前分块使用的 Rehype 插件列表（包含或不包含动画插件） */
  rehypePlugins: PluggableList;
  /** 当前分块切片的 Markdown 源码文本 */
  source: string;
};
