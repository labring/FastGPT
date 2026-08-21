import React, { Suspense, type ReactNode } from 'react';
import ClientI18nErrorFallback from './ClientI18nErrorFallback';
import { isClientI18nLoadError } from './ClientI18nLoadError';

type ClientI18nErrorBoundaryProps = {
  language: string;
  children: ReactNode;
};

type ClientI18nErrorBoundaryState = {
  error?: unknown;
};

/** 隔离客户端 namespace 加载失败，避免错误冒泡导致整页白屏。 */
class ClientI18nErrorBoundary extends React.Component<
  ClientI18nErrorBoundaryProps,
  ClientI18nErrorBoundaryState
> {
  state: ClientI18nErrorBoundaryState = {};

  static getDerivedStateFromError(error: unknown): ClientI18nErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(previousProps: ClientI18nErrorBoundaryProps) {
    if (previousProps.language !== this.props.language && this.state.error !== undefined) {
      this.setState({ error: undefined });
    }
  }

  render() {
    if (this.state.error === undefined) return this.props.children;
    if (!isClientI18nLoadError(this.state.error)) throw this.state.error;

    return <ClientI18nErrorFallback language={this.props.language} error={this.state.error} />;
  }
}

/** 为客户端 namespace 的异步加载提供统一加载态和错误态。 */
const ClientI18nBoundary = ({
  language,
  fallback,
  children
}: {
  language: string;
  fallback: ReactNode;
  children: ReactNode;
}) => (
  <ClientI18nErrorBoundary language={language}>
    <Suspense fallback={fallback}>{children}</Suspense>
  </ClientI18nErrorBoundary>
);

export default ClientI18nBoundary;
