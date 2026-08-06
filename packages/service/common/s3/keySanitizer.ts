/**
 * Normalize an object key before it is persisted or sent to object storage.
 * The transformation is deterministic and idempotent so every caller observes
 * the same key after schema parsing.
 */
export function sanitizeS3ObjectKey(key: string): string {
  if (!key) return key;

  const replaceParentheses = (value: string) =>
    value.replace(/[()]/g, (match) => (match === '(' ? '[' : ']'));

  return replaceParentheses(key)
    .replace(/\s/g, '_')
    .split('/')
    .map((segment) => {
      const sanitized = segment.replace(/\\/g, '_').replace(/[\u0000-\u001f\u007f]/gu, '_');
      if (sanitized.trim() === '.' || sanitized.trim() === '..') return '_';
      return sanitized || '_';
    })
    .join('/');
}
