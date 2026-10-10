import type { PluggableList } from 'unified';
import RemarkMath from 'remark-math';
import RemarkBreaks from 'remark-breaks';
import RehypeKatex from 'rehype-katex';
import RemarkGfm from 'remark-gfm';
import RehypeExternalLinks from 'rehype-external-links';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { isSafeImgSrc } from '@fastgpt/global/common/string/url';

import { fastgptMarkdownSanitizeSchema } from './sanitizeSchema';
import { rehypeImageCitations } from './rehypeImageCitations';

/**
 * Markdown Remark 解析插件配置：
 * - RemarkMath: 解析 LaTeX 数学公式语法 ($...$, $$...$$)
 * - RemarkGfm: 启用 GFM 扩展（表格、删除线等），关闭 singleTilde 避免波浪号混淆
 * - RemarkBreaks: 将软换行转换为真实 <br> 换行
 */
export const markdownRemarkPlugins: PluggableList = [
  RemarkMath,
  [RemarkGfm, { singleTilde: false }],
  RemarkBreaks
];

/**
 * Markdown Rehype 渲染与安全净化插件流水线：
 * 1. RehypeKatex: 渲染 KaTeX 数学公式为 HTML
 * 2. rehypeRaw: 将 Markdown 中的原生 HTML 标签还原为 HAST 抽象语法树节点
 * 3. rehypeSanitize: 基于严格白名单彻底剥离 script/style/on* 事件/非法协议
 * 4. RehypeExternalLinks: 外部链接自动添加 target="_blank" 及 noopener 保护
 * 5. rehypeImageCitations: FastGPT 专属引用与图片居中增强插件
 */
export const markdownBaseRehypePlugins: PluggableList = [
  rehypeRaw,
  [rehypeSanitize, fastgptMarkdownSanitizeSchema],
  RehypeKatex,
  [RehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
  rehypeImageCitations
];
/**
 * 链接与多媒体地址安全清洗函数：
 * 针对图片等 src 属性，仅放行合法 http/https/合法 base64 图片，阻断 javascript: 等伪协议
 */
export const markdownUrlTransform = (val: string, key?: string) => {
  if (key === 'src') {
    return isSafeImgSrc(val) ? val : '';
  }
  return val;
};
