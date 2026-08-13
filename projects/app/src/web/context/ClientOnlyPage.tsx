import type { AppProps } from 'next/app';

/**
 * 只阻止迁移中的页面输出服务端业务内容。
 * 该组件由 `next/dynamic` 以 `ssr: false` 加载，确保迁移中的页面不输出服务端业务内容。
 */
const ClientOnlyPage = ({ Component, pageProps }: AppProps) => <Component {...pageProps} />;

export default ClientOnlyPage;
