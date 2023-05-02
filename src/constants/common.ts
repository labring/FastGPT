export enum UserAuthTypeEnum {
  register = 'register',
  findPassword = 'findPassword'
}

export const PRICE_SCALE = 100000;

export const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width initial-scale=1.0" />
    <title>FastGpt</title>
  </head>
  <style>
    .markdown > :first-child {
      margin-top: 0 !important;
    }
    .markdown > :last-child {
      margin-bottom: 0 !important;
    }
    .markdown a.absent {
      color: #cc0000;
    }
    .markdown a.anchor {
      bottom: 0;
      cursor: pointer;
      display: block;
      left: 0;
      margin-left: -30px;
      padding-left: 30px;
      position: absolute;
      top: 0;
    }
    .markdown h1,
    .markdown h2,
    .markdown h3,
    .markdown h4,
    .markdown h5,
    .markdown h6 {
      cursor: text;
      font-weight: bold;
      margin: 10px 0;
      padding: 0;
      position: relative;
    }
    .markdown h1 .mini-icon-link,
    .markdown h2 .mini-icon-link,
    .markdown h3 .mini-icon-link,
    .markdown h4 .mini-icon-link,
    .markdown h5 .mini-icon-link,
    .markdown h6 .mini-icon-link {
      display: none;
    }
    .markdown h1:hover a.anchor,
    .markdown h2:hover a.anchor,
    .markdown h3:hover a.anchor,
    .markdown h4:hover a.anchor,
    .markdown h5:hover a.anchor,
    .markdown h6:hover a.anchor {
      line-height: 1;
      margin-left: -22px;
      padding-left: 0;
      text-decoration: none;
      top: 15%;
    }
    .markdown h1:hover a.anchor .mini-icon-link,
    .markdown h2:hover a.anchor .mini-icon-link,
    .markdown h3:hover a.anchor .mini-icon-link,
    .markdown h4:hover a.anchor .mini-icon-link,
    .markdown h5:hover a.anchor .mini-icon-link,
    .markdown h6:hover a.anchor .mini-icon-link {
      display: inline-block;
    }
    .markdown h1 tt,
    .markdown h1 code,
    .markdown h2 tt,
    .markdown h2 code,
    .markdown h3 tt,
    .markdown h3 code,
    .markdown h4 tt,
    .markdown h4 code,
    .markdown h5 tt,
    .markdown h5 code,
    .markdown h6 tt,
    .markdown h6 code {
      font-size: inherit;
    }
    .markdown h1 {
      font-size: 28px;
    }
    .markdown h2 {
      font-size: 24px;
    }
    .markdown h3 {
      font-size: 18px;
    }
    .markdown h4 {
      font-size: 16px;
    }
    .markdown h5 {
      font-size: 14px;
    }
    .markdown h6 {
      font-size: 12px;
    }
    .markdown p,
    .markdown blockquote,
    .markdown ul,
    .markdown ol,
    .markdown dl,
    .markdown table,
    .markdown pre {
      margin: 10px 0;
    }
    .markdown > h2:first-child,
    .markdown > h1:first-child,
    .markdown > h1:first-child + h2,
    .markdown > h3:first-child,
    .markdown > h4:first-child,
    .markdown > h5:first-child,
    .markdown > h6:first-child {
      margin-top: 0;
      padding-top: 0;
    }
    .markdown a:first-child,
    .markdown > h1,
    .markdown a:first-child,
    .markdown > h2,
    .markdown a:first-child,
    .markdown > h3,
    .markdown a:first-child,
    .markdown > h4,
    .markdown a:first-child,
    .markdown > h5,
    .markdown a:first-child,
    .markdown > h6 {
      margin-top: 0;
      padding-top: 0;
    }
    .markdown h1 + p,
    .markdown h2 + p,
    .markdown h3 + p,
    .markdown h4 + p,
    .markdown h5 + p,
    .markdown h6 + p {
      margin-top: 0;
    }
    .markdown li p.first {
      display: inline-block;
    }
    .markdown ul,
    .markdown ol {
      padding-left: 2em;
    }
    .markdown ul.no-list,
    .markdown ol.no-list {
      list-style-type: none;
      padding: 0;
    }
    .markdown ul li > :first-child,
    .markdown ol li > :first-child {
      margin-top: 0;
    }
    .markdown ul ul,
    .markdown ul ol,
    .markdown ol ol,
    .markdown ol ul {
      margin-bottom: 0;
    }
    .markdown dl {
      padding: 0;
    }
    .markdown dl dt {
      font-size: 14px;
      font-style: italic;
      font-weight: bold;
      margin: 15px 0 5px;
      padding: 0;
    }
    .markdown dl dt:first-child {
      padding: 0;
    }
    .markdown dl dt > :first-child {
      margin-top: 0;
    }
    .markdown dl dt > :last-child {
      margin-bottom: 0;
    }
    .markdown dl dd {
      margin: 0 0 15px;
      padding: 0 15px;
    }
    .markdown dl dd > *:first-child {
      margin-top: 0;
    }
    .markdown dl dd > *last-child {
      margin-bottom: none;
    }

    .markdown blockquote {
      border-left: solid 4px #dddddd;
      color: #777777;
      padding-left: 15px;
    }

    .markdown blockquote > * :first-child {
      margin-top: 0;
    }

    .markdown blockquote > * :last-child {
      margin-bottom: 0;
    }

    .markdown table th {
      font-weight: bold;
    }
    .markdown table th,
    .markdown table td {
      padding: 6px 13px;
    }
    .markdown table tr {
      background-color: #ffffff;
    }
    .markdown table tr:nth-child(2n) {
      background-color: #f0f0f0;
    }
    .markdown img {
      max-width: 100%;
    }
    .markdown span.frame {
      display: block;
      overflow: hidden;
    }
    .markdown span.frame > span {
      border: 1px solid #dddddd;
      display: block;
      float: left;
      margin: 13px 0 0;
      overflow: hidden;
      padding: 7px;
      width: auto;
    }
    .markdown span.frame span img {
      display: block;
      float: left;
    }
    .markdown span.frame span span {
      clear: both;
      color: #333333;
      display: block;
      padding: 5px;
    }

    .markdown span.align-center {
      clear: both;
      display: block;
      overflow: hidden;
      text-align: center;
    }

    .markdown span.align-center > span {
      display: block;
      margin: 13px auto;
      overflow: hidden;
    }

    .markdown span.align-center span img {
      margin: 0 auto;
      text-align: center;
    }

    .markdown span.align-right {
      clear: both;
      display: block;
      overflow: hidden;
    }

    .markdown span.align-right > span {
      display: block;
      margin: 13px auto;
      overflow: hidden;
      text-align: right;
    }

    .markdown span.align-right img {
      margin: 0;
      text-align: right;
    }

    .markdown span.float-left {
      display: block;
      float: left;
      margin-right: 13px;
      overflow: hidden;
    }

    .markdown span.float-left > span {
      margin: 13px auto;
    }

    .markdown span.float-right {
      display: block;
      float: right;
      margin-left: 13px;
      overflow: hidden;
    }

    .markdown span.float-right > span {
      display: block;
      margin: 13px auto;
      overflow: hidden;
      text-align: right;
    }

    .markdown code,
    .markdown tt {
      border: 1px solid #eaeaea;
      border-radius: 3px;
      margin: 0 2px;
      padding: 0 5px;
    }
    .markdown pre > code {
      background-color: transparent;
      border: none;
      margin: 0;
      padding: 0;
      white-space: pre;
    }
    .markdown .highlight pre,
    .markdown pre {
      border: 1px solid #ccc;
      border-radius: 3px;
      font-size: max(0.9em, 14px);
      line-height: 19px;
      overflow: auto;
      padding: 6px 10px;
    }

    .markdown pre code,
    .markdown pre tt {
      background-color: #f8f8f8;
      border: none;
    }

    .markdown {
      text-align: justify;
      overflow-y: hidden;
      tab-size: 4;
      word-spacing: normal;
      word-break: break-all;
    }
    .markdown pre {
      display: block;
      width: 100%;
      padding: 15px;
      margin: 0;
      border: none;
      border-radius: none;
      background-color: #222 !important;
      overflow-x: auto;
      color: #fff;
    }
    .markdown pre code {
      background-color: #222 !important;
      width: 100%;
    }
    .markdown a {
      text-decoration: underline;
      color: var(--chakra-colors-blue-600);
    }
    .markdown table {
      border-collapse: separate;
      border-spacing: 0;
      color: #718096;
    }
    .markdown table thead tr:first-child th {
      border-bottom-width: 1px;
      border-left-width: 1px;
      border-top-width: 1px;
      border-color: #ccc;
      background-color: #edf2f7;
      overflow: hidden;
    }
    .markdown table thead tr:first-child th:first-child {
      border-top-left-radius: 0.375rem;
    }
    .markdown table thead tr:first-child th:last-child {
      border-right-width: 1px;
      border-top-right-radius: 0.375rem;
    }
    .markdown td {
      border-bottom-width: 1px;
      border-left-width: 1px;
      border-color: #ccc;
    }
    .markdown td:last-of-type {
      border-right-width: 1px;
    }
    .markdown tbody tr:last-child {
      overflow: hidden;
    }
    .markdown tbody tr:last-child td:first-child {
      border-bottom-left-radius: 0.375rem;
    }
    .markdown tbody tr:last-child td:last-child {
      border-bottom-right-radius: 0.375rem;
    }
    .markdown p {
      text-align: justify;
      white-space: pre-wrap;
    }
    code[class*='language-'] {
      color: #d4d4d4;
      text-shadow: none;
      direction: ltr;
      text-align: left;
      white-space: pre;
      word-spacing: normal;
      word-break: normal;
      line-height: 1.5;
      -moz-tab-size: 4;
      -o-tab-size: 4;
      tab-size: 4;
      -webkit-hyphens: none;
      -moz-hyphens: none;
      hyphens: none;
    }

    pre[class*='language-'] {
      color: #d4d4d4;
      text-shadow: none;
      direction: ltr;
      text-align: left;
      white-space: pre;
      word-spacing: normal;
      word-break: normal;
      line-height: 1.5;
      -moz-tab-size: 4;
      -o-tab-size: 4;
      tab-size: 4;
      -webkit-hyphens: none;
      -moz-hyphens: none;
      hyphens: none;
      padding: 1em;
      margin: 0.5em0;
      overflow: auto;
      background: #1e1e1e;
    }

    code[class*='language-'] ::selection,
    code[class*='language-']::selection,
    pre[class*='language-'] ::selection,
    pre[class*='language-']::selection {
      text-shadow: none;
      background: #264f78;
    }

    :not(pre) > code[class*='language-'] {
      padding: 0.1em 0.3em;
      border-radius: 0.3em;
      color: #db4c69;
      background: #1e1e1e;
    }

    .namespace {
      opacity: 0.7;
    }

    .doctype.doctype-tag {
      color: #569cd6;
    }

    .doctype.name {
      color: #9cdcfe;
    }

    comment {
      color: #6a9955;
    }

    prolog {
      color: #6a9955;
    }

    .language-html .language-css .token.punctuation,
    .language-html .language-javascript .token.punctuation {
      color: #d4d4d4;
    }

    punctuation {
      color: #d4d4d4;
    }

    boolean {
      color: #569cd6;
    }

    constant {
      color: #9cdcfe;
    }

    inserted {
      color: #b5cea8;
    }

    number {
      color: #b5cea8;
    }

    property {
      color: #9cdcfe;
    }

    symbol {
      color: #b5cea8;
    }

    tag {
      color: #569cd6;
    }

    unit {
      color: #b5cea8;
    }

    attr-name {
      color: #9cdcfe;
    }

    builtin {
      color: #ce9178;
    }

    char {
      color: #ce9178;
    }

    deleted {
      color: #ce9178;
    }

    selector {
      color: #d7ba7d;
    }

    string {
      color: #ce9178;
    }

    .language-css .token.string.url {
      text-decoration: underline;
    }

    entity {
      color: #569cd6;
    }

    operator {
      color: #d4d4d4;
    }

    operator.arrow {
      color: #569cd6;
    }

    atrule {
      color: #ce9178;
    }

    atrule.rule {
      color: #c586c0;
    }

    atrule.url {
      color: #9cdcfe;
    }

    atrule.url.function {
      color: #dcdcaa;
    }

    atrule.url.punctuation {
      color: #d4d4d4;
    }
    keyword {
      color: #569cd6;
    }

    keyword.control-flow {
      color: #c586c0;
    }

    keyword.module {
      color: #c586c0;
    }

    function {
      color: #dcdcaa;
    }

    function.maybe-class-name {
      color: #dcdcaa;
    }

    regex {
      color: #d16969;
    }

    important {
      color: #569cd6;
    }

    italic {
      font-style: italic;
    }

    class-name {
      color: #4ec9b0;
    }

    maybe-class-name {
      color: #4ec9b0;
    }

    console {
      color: #9cdcfe;
    }

    parameter {
      color: #9cdcfe;
    }

    interpolation {
      color: #9cdcfe;
    }
    punctuation.interpolation-punctuation {
      color: #569cd6;
    }
    exports.maybe-class-name {
      color: #9cdcfe;
    }
    imports.maybe-class-name {
      color: #9cdcfe;
    }
    variable {
      color: #9cdcfe;
    }
    escape {
      color: #d7ba7d;
    }
    tag.punctuation {
      color: grey;
    }
    cdata {
      color: grey;
    }
    attr-value {
      color: #ce9178;
    }
    attr-value.punctuation {
      color: #ce9178;
    }
    attr-value.punctuation.attr-equals {
      color: #d4d4d4;
    }
    namespace {
      color: #4ec9b0;
    }
    code[class*='language-javascript'],
    code[class*='language-jsx'],
    code[class*='language-tsx'],
    code[class*='language-typescript'] {
      color: #9cdcfe;
    }

    pre[class*='language-javascript'],
    pre[class*='language-jsx'],
    pre[class*='language-tsx'],
    pre[class*='language-typescript'] {
      color: #9cdcfe;
    }

    code[class*='language-css'] {
      color: #ce9178;
    }

    pre[class*='language-css'] {
      color: #ce9178;
    }

    code[class*='language-html'] {
      color: #d4d4d4;
    }

    pre[class*='language-html'] {
      color: #d4d4d4;
    }

    .language-regex .token.anchor {
      color: #dcdcaa;
    }

    .language-html .token.punctuation {
      color: grey;
    }

    pre[class*='language-'] > code[class*='language-'] {
      position: relative;
      z-index: 1;
    }

    .line-highlight.line-highlight {
      background: #f7ebc6;
      box-shadow: inset 5px 0 0 #f7d87c;
      z-index: 0;
    }
    * {
      box-sizing: border-box;
    }
    body,
    h1,
    h2,
    h3,
    h4,
    hr,
    p,
    blockquote,
    dl,
    dt,
    dd,
    ul,
    ol,
    li,
    pre,
    form,
    fieldset,
    legend,
    button,
    input,
    textarea,
    th,
    td,
    svg  {
      margin: 0;
    }
    body,
    html {
      font-size: 16px;
      background-color: #fff;
      color: rgba(0, 0, 0, 0.64);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif,
        'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';
    }
    pre,
    code,
    kbd,
    samp {
      font-family: SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 1em;
    }
    ::-webkit-scrollbar,
    ::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }
    ::-webkit-scrollbar-track,
    ::-webkit-scrollbar-track {
      background: transparent;
      border-radius: 2px;
    }
    ::-webkit-scrollbar-thumb,
    ::-webkit-scrollbar-thumb {
      background: #bfbfbf;
      border-radius: 10px;
    }
    ::-webkit-scrollbar-thumb:hover,
    ::-webkit-scrollbar-thumb:hover {
      background: #999;
    }
  </style>
  <style>
    .chat-item {
      display: flex;
      align-items: flex-start;
      padding: 20px 16px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.1);
      justify-content: center;
    }
    .chat-item img {
      width: 30px;
      max-height: 50px;
      object-fit: contain;
      margin-right: 10px;
    }
    .chat-item:nth-child(even) {
      background-color: #f6f6f6;
    }
    .chat-item:nth-child(odd) {
      background-color: #ffffff;
    }
    .markdown {
      overflow-x: hidden;
      max-width: 800px;
      width: 100%;
    }
    @media (max-width: 900px) {
      html {
        font-size: 14px;
      }
      ::-webkit-scrollbar,
      ::-webkit-scrollbar {
        width: 2px;
        height: 2px;
      }
      .chat-item img {
        width: 20px;
        max-height: 40px;
        margin-right: 4px;
      }
    }
  </style>
  <body>{{CHAT_CONTENT}}</body>
</html>
`;
