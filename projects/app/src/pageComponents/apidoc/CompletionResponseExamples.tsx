import {
  getChatCompletionResponseExamples,
  type CompletionExampleVersion
} from '@fastgpt/global/openapi/core/chat/completion/examples';
import React, { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import styles from './CompletionResponseExamples.module.scss';

type ExampleTarget = {
  host: HTMLDivElement;
  id: string;
  version: CompletionExampleVersion;
  contentType: 'application/json' | 'text/event-stream';
};
/** JSON 模式展示非流式示例，text 模式用四个 tab 对比 stream/detail 组合，不修改请求参数。 */
const ResponseExamplePanel = ({
  version,
  contentType
}: {
  version: CompletionExampleVersion;
  contentType: ExampleTarget['contentType'];
}) => {
  const examples = useMemo(() => getChatCompletionResponseExamples(version), [version]);
  const modes = useMemo(
    () =>
      [
        { id: 'json-basic', stream: false, detail: false, ...examples.json.detailFalseStreamFalse },
        { id: 'json-detail', stream: false, detail: true, ...examples.json.detailTrueStreamFalse },
        { id: 'sse-basic', stream: true, detail: false, ...examples.sse.detailFalseStreamTrue },
        { id: 'sse-detail', stream: true, detail: true, ...examples.sse.detailTrueStreamTrue }
      ].filter((mode) => contentType === 'text/event-stream' || !mode.stream),
    [examples, contentType]
  );
  const [selectedIndex, setSelectedIndex] = useState(contentType === 'text/event-stream' ? 2 : 0);
  const [copyMessage, setCopyMessage] = useState('');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const sample = modes[selectedIndex];
  const content =
    typeof sample.value === 'string' ? sample.value : JSON.stringify(sample.value, null, 2);
  const lines = content.split('\n');
  const panelId = `${id}-panel`;

  const selectMode = (index: number) => {
    setSelectedIndex(index);
    setCopyMessage('');
  };
  const copyExample = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopyMessage('已复制');
    } catch {
      setCopyMessage('复制失败，请手动选择示例内容');
    }
  };

  return (
    <section className={styles.panel} aria-label={`${version} 响应示例选择`}>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="stream / detail 组合"
        data-count={modes.length}
      >
        {modes.map((mode, index) => (
          <button
            key={mode.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            className={styles.tab}
            type="button"
            role="tab"
            id={`${id}-${mode.id}`}
            aria-label={`stream=${mode.stream}, detail=${mode.detail}`}
            aria-controls={panelId}
            aria-selected={index === selectedIndex}
            tabIndex={index === selectedIndex ? 0 : -1}
            onClick={() => selectMode(index)}
            onKeyDown={(event) => {
              const nextIndex = (() => {
                if (event.key === 'ArrowRight') return (index + 1) % modes.length;
                if (event.key === 'ArrowLeft') return (index + modes.length - 1) % modes.length;
                if (event.key === 'Home') return 0;
                if (event.key === 'End') return modes.length - 1;
              })();
              if (nextIndex === undefined) return;
              event.preventDefault();
              selectMode(nextIndex);
              tabRefs.current[nextIndex]?.focus();
            }}
          >
            <span>stream={String(mode.stream)}</span>
            <span>detail={String(mode.detail)}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={`${id}-${sample.id}`}>
        <p className={styles.description}>{sample.description}</p>
        <div className={styles.codeHeader}>
          <span>{sample.stream ? 'text/event-stream' : 'application/json'}</span>
          <button type="button" onClick={copyExample} aria-label="复制响应示例">
            {copyMessage === '已复制' ? '已复制' : '复制示例'}
          </button>
        </div>
        <pre className={styles.code} tabIndex={0} aria-label="响应示例内容">
          <code>
            {lines.map((line, index) => (
              <span
                key={index}
                className={line.startsWith('event:') ? styles.eventLine : undefined}
              >
                {line}
                {index < lines.length - 1 ? '\n' : ''}
              </span>
            ))}
          </code>
        </pre>
        <div className={styles.note}>
          <span>
            仅切换示例，不修改请求参数。流片段省略 id / object / created / model 占位字段。
          </span>
          <span role="status">{copyMessage}</span>
        </div>
      </div>
    </section>
  );
};

/**
 * 将 React 示例面板挂到 Scalar 延迟创建的响应卡片内，保留原生 Schema 开关。
 * 只匹配 completions 的 operation，并读取左侧 200 响应的 MIME 选择，确定展示两种 JSON 组合或全部四种组合。
 * Scalar 修改文本节点时也同步；卡片移除时回收 portal，页面销毁时断开监听。
 */
export const CompletionResponseExamples = ({ rootRef }: { rootRef: RefObject<HTMLDivElement> }) => {
  const [targets, setTargets] = useState<ExampleTarget[]>([]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const mounted = new Map<HTMLElement, ExampleTarget>();
    const selector =
      'section[id$="/POST/v1/chat/completions"], section[id$="/POST/v2/chat/completions"]';
    const syncTargets = () => {
      const active = new Set<HTMLElement>();
      for (const operation of root.querySelectorAll<HTMLElement>(selector)) {
        const card = operation.querySelector<HTMLElement>('.examples .response-card');
        if (!card) continue;
        active.add(card);
        const existing = mounted.get(card);
        // 不依赖翻译文案，也不读取请求体/其他状态码的格式；收起响应时 MIME 按钮仍然存在。
        const contentType = (() => {
          const response = [
            ...operation.querySelectorAll<HTMLElement>('.operation-details .parameter-item')
          ].find(
            (item) => item.querySelector('.parameter-item-name')?.textContent?.trim() === '200'
          );
          for (const label of response?.querySelectorAll(
            'button[aria-haspopup="listbox"] > span, .selected-content-type > span'
          ) ?? []) {
            const value = label.textContent?.trim();
            if (value === 'application/json' || value === 'text/event-stream') return value;
          }
          return existing?.contentType ?? 'application/json';
        })();
        if (existing && card.contains(existing.host)) {
          if (existing.contentType !== contentType) mounted.set(card, { ...existing, contentType });
          continue;
        }
        const host = document.createElement('div');
        host.className = styles.host;
        card.append(host);
        mounted.set(card, {
          host,
          id: operation.id,
          version: operation.id.endsWith('/POST/v1/chat/completions') ? 'v1' : 'v2',
          contentType
        });
      }
      for (const [card, target] of mounted) {
        if (active.has(card)) continue;
        target.host.remove();
        mounted.delete(card);
      }
      const next = [...mounted.values()];
      setTargets((previous) =>
        previous.length === next.length && previous.every((target, index) => target === next[index])
          ? previous
          : next
      );
    };
    const observer = new MutationObserver(syncTargets);
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    syncTargets();
    return () => {
      observer.disconnect();
      mounted.forEach(({ host }) => host.remove());
    };
  }, [rootRef]);

  return (
    <>
      {targets.map(({ host, id, version, contentType }) =>
        createPortal(
          <ResponseExamplePanel key={contentType} version={version} contentType={contentType} />,
          host,
          id
        )
      )}
    </>
  );
};
