import {
  getChatCompletionResponseExamples,
  type CompletionExampleVersion
} from '@fastgpt/global/openapi/core/chat/completion/examples';
import React, { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from '@chakra-ui/react';
import styles from './CompletionResponseExamples.module.scss';

type ExampleTarget = {
  host: HTMLDivElement;
  id: string;
  version: CompletionExampleVersion;
  contentType: 'application/json' | 'text/event-stream';
};
/** 复用 Scalar 自带的代码块：由其负责高亮、复制和滚动，React 只负责挂载及回收 Vue 实例。 */
const ScalarResponseCode = ({ content, language }: { content: string; language: string }) => {
  const codeRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    const element = codeRef.current;
    if (!element) return;
    let disposed = false;
    let app: import('vue').App | undefined;

    // 延迟加载，避免 Vue 的 DOM 运行时和 Scalar 代码块参与服务端渲染。
    void Promise.all([import('vue'), import('@scalar/components/code-block')]).then(
      ([{ createApp, h }, { ScalarCodeBlock }]) => {
        if (disposed) return;
        app = createApp({
          render: () =>
            h(ScalarCodeBlock, { prettyPrintedContent: content, lang: language, copy: 'always' })
        });
        app.config.idPrefix = `completion-code-${id}`;
        app.mount(element);
      }
    );

    return () => {
      disposed = true;
      app?.unmount();
    };
  }, [content, language, id]);

  return <div ref={codeRef} className={styles.codeHost} role="region" aria-label="响应示例内容" />;
};

/** 标准 Tabs 展示 stream/detail 组合；标题保持单行，窄卡片内横向滚动。 */
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

  return (
    <Tabs
      className={styles.panel}
      aria-label={`${version} 响应示例选择`}
      display="flex"
      flexDirection="column"
      flex="1"
      minH={0}
      index={selectedIndex}
      onChange={setSelectedIndex}
      variant="unstyled"
      isLazy
    >
      <TabList className={styles.tabs} aria-label="stream / detail 组合">
        {modes.map((mode) => (
          <Tab
            key={mode.id}
            className={styles.tab}
            fontSize="12px"
            whiteSpace="nowrap"
            flexShrink={0}
          >
            {`stream=${mode.stream}, detail=${mode.detail}`}
          </Tab>
        ))}
      </TabList>
      <TabPanels className={styles.content}>
        {modes.map((mode) => (
          <TabPanel key={mode.id} p={0}>
            <p className={styles.description}>{mode.description}</p>
            <ScalarResponseCode
              content={
                typeof mode.value === 'string' ? mode.value : JSON.stringify(mode.value, null, 2)
              }
              language={mode.stream ? 'plaintext' : 'json'}
            />
          </TabPanel>
        ))}
      </TabPanels>
    </Tabs>
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
