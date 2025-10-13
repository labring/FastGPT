// Type declarations for external packages without proper TypeScript support

/**
 * franc - Language detection library
 * Detects the language of text using character n-gram frequency analysis
 */
declare module 'franc' {
  /**
   * Detect the language of text
   * @param text - Text to analyze for language detection
   * @param options - Detection options
   * @returns ISO 639-3 language code (e.g., 'eng' for English, 'cmn' for Chinese)
   */
  export function franc(
    text: string,
    options?: {
      minLength?: number;
      whitelist?: string[];
      blacklist?: string[];
    }
  ): string;

  export default franc;
}

/**
 * chinese-conv - Chinese character conversion library
 * Converts between simplified and traditional Chinese
 */
declare module 'chinese-conv' {
  /**
   * Convert simplified Chinese to traditional Chinese
   * @param text - Simplified Chinese text to convert
   * @returns Traditional Chinese text
   */
  export function tify(text: string): string;

  /**
   * Convert traditional Chinese to simplified Chinese
   * @param text - Traditional Chinese text to convert
   * @returns Simplified Chinese text
   */
  export function sify(text: string): string;

  /**
   * Convert JSON object with simplified Chinese to traditional Chinese
   * @param obj - JSON object to convert
   * @returns Converted JSON object
   */
  export function tifyJson<T>(obj: T): T;
}
