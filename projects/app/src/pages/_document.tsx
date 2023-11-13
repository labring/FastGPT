import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <title>{process.env.SYSTEM_NAME || 'FastGPT'}</title>
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
