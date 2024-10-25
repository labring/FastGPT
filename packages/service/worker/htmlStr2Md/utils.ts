import { serverRequestBaseUrl } from '../../common/api/serverRequest';
import init, { html2md as wasm_html2md } from './pkg/html2md_rust';

await init(fetch(serverRequestBaseUrl + '/wasm/html2md_rust_bg.wasm'));
export const html2md = (html: string): string => {
  try {
    return wasm_html2md(html);
  } catch (error) {
    console.log('html 2 markdown error', error);
    return '';
  }
};
