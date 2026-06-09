export type HtmlCodeBlockViewMode = 'source' | 'iframe';

export type HtmlCodeBlockViewModeCacheRecord = {
  mode: HtmlCodeBlockViewMode;
  isUserChoice: boolean;
};

/** 跨 remount 保留用户对 Code/Preview 的手动选择（流式结束时 Markdown 可能重建 code block）。 */
const htmlCodeBlockViewChoiceCache = new Map<string, HtmlCodeBlockViewModeCacheRecord>();

const getNormalizedCodeHead = (code: string) => code.slice(0, 80).replace(/\s+/g, ' ').trim();

export const getHtmlBlockCacheKeys = (
  chatItemDataId: string | undefined,
  code: string
): string[] => {
  const keys: string[] = chatItemDataId ? [chatItemDataId] : [];
  const head = getNormalizedCodeHead(code);
  const stablePrefix = head.slice(0, 16);

  if (stablePrefix.length >= 16) {
    keys.push(
      chatItemDataId ? `${chatItemDataId}:prefix:${stablePrefix}` : `anonymous:${stablePrefix}`
    );
  }
  if (head.length >= 16) {
    keys.push(chatItemDataId ? `${chatItemDataId}:${head}` : `anonymous:${head}`);
  }
  return keys;
};

export const getCachedHtmlBlockViewModeRecord = (
  chatItemDataId: string | undefined,
  code: string
): HtmlCodeBlockViewModeCacheRecord | undefined => {
  const keys = getHtmlBlockCacheKeys(chatItemDataId, code);
  let fallbackRecord: HtmlCodeBlockViewModeCacheRecord | undefined;

  for (let i = keys.length - 1; i >= 0; i--) {
    const record = htmlCodeBlockViewChoiceCache.get(keys[i]!);
    if (!record) continue;
    if (record.isUserChoice) return record;
    fallbackRecord ??= record;
  }
  return fallbackRecord;
};

export const getCachedHtmlBlockViewMode = (
  chatItemDataId: string | undefined,
  code: string
): HtmlCodeBlockViewMode | undefined =>
  getCachedHtmlBlockViewModeRecord(chatItemDataId, code)?.mode;

export const setCachedHtmlBlockViewMode = (
  chatItemDataId: string | undefined,
  code: string,
  mode: HtmlCodeBlockViewMode,
  { isUserChoice = true }: { isUserChoice?: boolean } = {}
) => {
  getHtmlBlockCacheKeys(chatItemDataId, code).forEach((key) => {
    htmlCodeBlockViewChoiceCache.set(key, { mode, isUserChoice });
  });
};

export const clearCachedHtmlBlockViewMode = (chatItemDataId: string | undefined) => {
  if (!chatItemDataId) return;

  for (const key of [...htmlCodeBlockViewChoiceCache.keys()]) {
    if (key === chatItemDataId || key.startsWith(`${chatItemDataId}:`)) {
      htmlCodeBlockViewChoiceCache.delete(key);
    }
  }
};

/** 仅用于测试，重置模块级缓存。 */
export const resetHtmlBlockViewModeCacheForTest = () => {
  htmlCodeBlockViewChoiceCache.clear();
};
