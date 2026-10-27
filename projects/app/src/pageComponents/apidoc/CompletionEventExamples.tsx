import {
  getChatCompletionResponseExamples,
  type CompletionExampleVersion
} from '@fastgpt/global/openapi/core/chat/completion/examples';
import React, { useEffect, useMemo, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import styles from './CompletionEventExamples.module.scss';

type EventExampleTarget = {
  host: HTMLDivElement;
  id: string;
  version: CompletionExampleVersion;
};

/**
 * 按接口版本列出 event。分支标题显示为序号，复制时保留 SSE 注释前缀以保证协议可解析。
 */
const EventExampleSelect = ({ version }: { version: CompletionExampleVersion }) => {
  const events = useMemo(() => getChatCompletionResponseExamples(version).events, [version]);
  const [selectedEventName, setSelectedEventName] = useState('answer');
  const [copyMessage, setCopyMessage] = useState('');
  const selected = events.find((event) => event.name === selectedEventName) ?? events[0];

  const selectEvent = (name: string) => {
    setSelectedEventName(name);
    setCopyMessage('');
  };
  const copyExample = async () => {
    try {
      await navigator.clipboard.writeText(selected.value);
      setCopyMessage('已复制');
    } catch {
      setCopyMessage('复制失败，请手动选择代码');
    }
  };

  return (
    <section className={styles.panel} aria-label={`${version} event 示例`}>
      <h4 className={styles.heading}>event 示例（{version}）</h4>
      <label className={styles.control}>
        <span>event</span>
        <select value={selected.name} onChange={(event) => selectEvent(event.target.value)}>
          {events.map((event) => (
            <option key={event.name} value={event.name}>
              {event.name} · {event.label}
            </option>
          ))}
        </select>
      </label>
      <div>
        <p className={styles.description}>
          <strong>{selected.label}</strong>
          {selected.description}
        </p>
        <div className={styles.codeBlock}>
          <div className={styles.codeHeader}>
            <span>text/event-stream</span>
            <button type="button" onClick={copyExample} aria-label="复制 event 示例">
              {copyMessage === '已复制' ? '已复制' : '复制示例'}
            </button>
          </div>
          <pre className={styles.code}>
            <code>
              {selected.value.split('\n').map((line, index, lines) => (
                <span
                  key={index}
                  className={line.startsWith('event:') ? styles.eventLine : undefined}
                >
                  {line.startsWith(': ') ? line.slice(2) : line}
                  {index < lines.length - 1 ? '\n' : ''}
                </span>
              ))}
            </code>
          </pre>
        </div>
        <span className={styles.copyStatus} role="status">
          {copyMessage}
        </span>
      </div>
    </section>
  );
};

/**
 * 在 completions 的 text/event-stream 响应说明下挂载对应版本的 event 选择器。
 * Scalar 延迟渲染或切换为 JSON/收起响应时，按当前 SSE 说明节点挂载和回收，不改动原生响应内容。
 */
export const CompletionEventExamples = ({ rootRef }: { rootRef: RefObject<HTMLDivElement> }) => {
  const [targets, setTargets] = useState<EventExampleTarget[]>([]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const mounted = new Map<HTMLElement, EventExampleTarget>();
    const selector =
      'section[id$="/POST/v1/chat/completions"], section[id$="/POST/v2/chat/completions"]';
    const syncTargets = () => {
      const active = new Set<HTMLElement>();
      for (const operation of root.querySelectorAll<HTMLElement>(selector)) {
        const description = [
          ...operation.querySelectorAll<HTMLElement>(
            '.operation-details .parameter-item-container > .property > .property-description'
          )
        ].find((element) => element.textContent?.trim().startsWith('工作流 SSE 事件流'));
        if (!description) continue;
        active.add(description);
        const existing = mounted.get(description);
        if (existing && description.nextElementSibling === existing.host) continue;
        existing?.host.remove();
        const host = document.createElement('div');
        host.className = styles.host;
        description.after(host);
        mounted.set(description, {
          host,
          id: operation.id,
          version: operation.id.endsWith('/POST/v1/chat/completions') ? 'v1' : 'v2'
        });
      }
      for (const [description, target] of mounted) {
        if (active.has(description)) continue;
        target.host.remove();
        mounted.delete(description);
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
      {targets.map(({ host, id, version }) =>
        createPortal(<EventExampleSelect version={version} />, host, id)
      )}
    </>
  );
};
