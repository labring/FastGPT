import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  RetrievalTraceBranchNameEnum,
  RetrievalTraceStageNameEnum,
  RetrievalTraceStageStatusEnum
} from '@fastgpt/global/core/dataset/constants';

vi.mock('@chakra-ui/react', () => {
  const Container = ({ children }: { children?: React.ReactNode }) => children;
  return {
    Box: Container,
    Flex: Container,
    Grid: Container,
    HStack: Container
  };
});

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children?: React.ReactNode }) => children
}));
vi.mock('@/components/core/chat/ChatContainer/ChatBox/components/QuoteList', () => ({
  default: () => null
}));
vi.mock('@/components/core/chat/components/FormInputResult', () => ({ default: () => null }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/components/core/chat/components/WholeResponseModal/Row', async () => {
  const { createElement } = await import('react');
  return {
    responseRowValueBoxStyles: {},
    Row: ({ label, rawDom, value }: { label: string; rawDom?: React.ReactNode; value?: unknown }) =>
      createElement('section', {}, label, rawDom, value === undefined ? null : String(value))
  };
});

let DatasetSearchRows: typeof import('@/components/core/chat/components/WholeResponseModal/ResponseRows').DatasetSearchRows;

beforeAll(async () => {
  // 该项目的 Vitest JSX 转换使用 classic runtime，SSR 测试需显式提供 React 全局。
  (globalThis as any).React = React;
  ({ DatasetSearchRows } =
    await import('@/components/core/chat/components/WholeResponseModal/ResponseRows'));
});

describe('DatasetSearchRows retrieval trace', () => {
  it('renders recall branches separately from the post-merge pipeline with static labels', () => {
    const html = renderToStaticMarkup(
      React.createElement(DatasetSearchRows, {
        activeModule: {
          retrievalTrace: {
            branches: [
              {
                name: RetrievalTraceBranchNameEnum.text,
                stages: [
                  {
                    name: RetrievalTraceStageNameEnum.textEmbeddingRecall,
                    count: 4,
                    minScore: 0.2,
                    maxScore: 0.8
                  },
                  {
                    name: RetrievalTraceStageNameEnum.rerank,
                    count: 4,
                    status: RetrievalTraceStageStatusEnum.fallback
                  }
                ]
              },
              {
                name: RetrievalTraceBranchNameEnum.image,
                stages: [{ name: RetrievalTraceStageNameEnum.imageFusion, count: 2 }]
              }
            ],
            pipeline: [
              { name: RetrievalTraceStageNameEnum.mergedCandidates, count: 6 },
              {
                name: RetrievalTraceStageNameEnum.llmSelection,
                count: 3,
                status: RetrievalTraceStageStatusEnum.applied
              }
            ]
          }
        } as any
      })
    );

    expect(html).toContain('chat:response.retrieval_branch.text');
    expect(html).toContain('chat:response.retrieval_branch.image');
    expect(html).toContain('chat:response.retrieval_pipeline');
    expect(html).toContain('chat:response.retrieval_stage.textEmbeddingRecall');
    expect(html).toContain('chat:response.retrieval_stage.mergedCandidates');
    expect(html).toContain('chat:response.retrieval_status.fallback');
    expect(html).toContain('chat:response.retrieval_status.applied');
  });
});
