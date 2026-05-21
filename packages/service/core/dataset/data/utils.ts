export type DatasetDataMarkdownImageItem = {
  raw: string;
  alt: string;
  url: string;
  index: number;
};

/**
 * 从 dataset data 的 markdown 内容中提取图片节点。
 *
 * 这里只负责识别 `![alt](url)`，用于 VLM 图片描述索引、imageEmbedding 图片向量索引、
 * 展示态描述回填等链路共用同一套图片提取语义。图片来源合法性校验、S3/base64 转换、
 * 向量生成都在后续链路处理。
 */
export const matchDatasetDataMarkdownImages = (text = ''): DatasetDataMarkdownImageItem[] => {
  if (typeof text !== 'string' || !text) return [];

  const regex = /!\[([\s\S]*?)\]\((.*?)\)/g;
  return Array.from(text.matchAll(regex))
    .map((match) => ({
      raw: match[0],
      alt: match[1] || '',
      url: match[2]?.trim() || '',
      index: match.index ?? 0
    }))
    .filter((item) => !!item.url);
};

/**
 * 提取 dataset data markdown 图片 URL。
 *
 * 这是图片描述索引和图片向量索引共同使用的 URL 入口，避免不同训练/重建链路
 * 分别维护 markdown 图片提取规则。
 */
export const matchDatasetDataMarkdownImageUrls = (text = '') =>
  matchDatasetDataMarkdownImages(text).map((item) => item.url);

/**
 * 从多个文本字段中提取并按首次出现顺序去重图片 URL。
 */
export const uniqueDatasetDataMarkdownImageUrls = (texts: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      texts.filter((text): text is string => !!text).flatMap(matchDatasetDataMarkdownImageUrls)
    )
  );
