import { useEffect, useRef, useState } from 'react';
import type { FileSelectorRenderItemType } from './type';
import { probeFileSelectorLinkFilename } from './utils';
import { getFileIcon } from '@fastgpt/global/common/file/icon';

/**
 * 按条目异步补齐外链图标，只更新组件渲染态，不触发 onChange 或改写文件类型。
 * 每个 id/URL 组合仅处理一次；删除、更换链接及卸载时取消请求，避免旧响应污染新条目。
 */
export const useFileSelectorLinkIcons = (files: FileSelectorRenderItemType[]) => {
  const probes = useRef(new Map<string, { url: string; controller: AbortController }>());
  const [icons, setIcons] = useState(
    new Map<string, { url: string; icon: string; signal: AbortSignal }>()
  );

  useEffect(() => {
    const currentProbes = probes.current;
    return () => {
      currentProbes.forEach(({ controller }) => controller.abort());
      currentProbes.clear();
    };
  }, []);

  useEffect(() => {
    probes.current.forEach(({ url, controller }, id) => {
      if (files.some((file) => file.id === id && file.url === url && !file.key)) return;
      controller.abort();
      probes.current.delete(id);
    });
    files.forEach((file) => {
      if (file.key || !file.url || probes.current.has(file.id)) return;
      const { id, url } = file;
      const controller = new AbortController();
      probes.current.set(id, { url, controller });
      void probeFileSelectorLinkFilename({ url, signal: controller.signal })
        .then((filename) => {
          if (!filename || controller.signal.aborted) return;
          setIcons((current) => {
            if (controller.signal.aborted) return current;
            const next = new Map(
              [...current].filter(
                ([knownId, result]) =>
                  probes.current.get(knownId)?.controller.signal === result.signal
              )
            );
            return next.set(id, { url, icon: getFileIcon(filename), signal: controller.signal });
          });
        })
        .catch(() => {
          // 图标仅是展示增强，探测或处理结果的异常不能触发页面错误遮罩。
        });
    });
  }, [files]);

  return new Map(
    [...icons]
      .filter(
        ([id, { url, signal }]) =>
          !signal.aborted && files.some((file) => file.id === id && file.url === url && !file.key)
      )
      .map(([id, { url, icon }]) => [id, { url, icon }] as const)
  );
};
