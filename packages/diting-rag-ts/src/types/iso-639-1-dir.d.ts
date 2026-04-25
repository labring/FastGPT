declare module 'iso-639-1-dir' {
  interface ISO6391 {
    getName(code: string): string;
    getNativeName(code: string): string;
  }
  const mod: ISO6391;
  export default mod;
}
