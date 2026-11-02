/**
 * 图片预热：把即将渲染的远程图片提前交给浏览器加载，命中 HTTP 缓存后再次挂载 <img> 无需等待。
 *
 * 模型管理页每个 TAB 都是独立面板，切换时会重新挂载列表与头像 <img>。供应商头像来自
 * 对象存储的绝对地址（如 fastgpt-public/system/plugin/models/<provider>/logo），首屏
 * 与每次切 TAB 都要重新发请求，表现为「条目文字先出、图标晚 0.5-1 秒」。
 * 在目录数据就绪时统一预热，可把这段等待收敛到页面初始化阶段。
 *
 * 约定：预热只做尽力而为，任何失败（跨域、超时、地址为空）都不能影响页面渲染。
 */

export type PreloadImageLoader = (url: string) => Promise<void>;

type PreloadImageOptions = {
  /** 测试注入用；默认用浏览器 Image 对象下载。 */
  loader?: PreloadImageLoader;
};

const preloadedUrls = new Set<string>();
const inflightLoads = new Map<string, Promise<void>>();
/** 持有加载中的 Image 引用，避免被 GC 回收后浏览器中止请求（Safari 等）。 */
const pendingImages = new Set<HTMLImageElement>();
const PRELOAD_TIMEOUT_MS = 10_000;

const loadWithBrowserImage: PreloadImageLoader = (url) =>
  new Promise<void>((resolve) => {
    // SSR 或测试环境没有 Image 时直接跳过，不阻塞调用方。
    if (typeof window === 'undefined' || typeof window.Image === 'undefined') {
      resolve();
      return;
    }

    const image = new window.Image();
    pendingImages.add(image);

    let timer: ReturnType<typeof setTimeout> | undefined;
    // load / error / timeout 统一收尾：释放引用、清理计时器，保证 Promise 一定 settle。
    const finish = () => {
      if (timer !== undefined) clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      pendingImages.delete(image);
      resolve();
    };

    // onerror 同样 resolve：头像加载失败由 Avatar 的 fallbackSrc 兜底，预热不抛错。
    image.onload = finish;
    image.onerror = finish;
    timer = setTimeout(finish, PRELOAD_TIMEOUT_MS);
    image.src = url;
  });

/** 预热单张图片；同一 URL 只请求一次。 */
export const preloadImage = (
  url: string | undefined | null,
  { loader = loadWithBrowserImage }: PreloadImageOptions = {}
): Promise<void> => {
  if (!url || preloadedUrls.has(url)) return Promise.resolve();

  const inflight = inflightLoads.get(url);
  if (inflight) return inflight;

  // Wrap in a promise chain so a synchronously throwing loader is caught as well.
  const task = Promise.resolve()
    .then(() => loader(url))
    .catch(() => undefined)
    .then(() => {
      preloadedUrls.add(url);
      inflightLoads.delete(url);
    });

  inflightLoads.set(url, task);
  return task;
};

/** 批量预热图片，去重后并发加载；空数组直接返回。 */
export const preloadImages = (
  urls: (string | undefined | null)[],
  options?: PreloadImageOptions
): Promise<void[]> => {
  const unique = Array.from(new Set(urls.filter((url): url is string => !!url)));
  return Promise.all(unique.map((url) => preloadImage(url, options)));
};

/** 仅供测试：清空预热缓存，避免用例之间互相污染。 */
export const resetPreloadImageCacheForTest = () => {
  preloadedUrls.clear();
  inflightLoads.clear();
  pendingImages.clear();
};
