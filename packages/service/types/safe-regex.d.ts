declare module 'safe-regex' {
  interface SafeRegexOptions {
    /** 解析的 AST 节点数上限，超过即视为不安全（默认 25） */
    limit?: number;
  }
  function safeRegex(re: RegExp | string, opts?: SafeRegexOptions): boolean;
  export default safeRegex;
}
