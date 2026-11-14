import z from 'zod';

/**
 * Agent 工具固定参数字典，允许 constructor 等自有业务字段。
 * z.record 会通过 value.constructor 判断普通对象，导致同名参数被误拒绝；
 * 改为按原型检查字典，再由开放对象 Schema 校验并复制参数，保持现有宽松值类型。
 */
export const AgentToolConfigSchema = z.preprocess((value, ctx) => {
  if (
    typeof value !== 'object' ||
    value === null ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    ctx.addIssue({ code: 'invalid_type', expected: 'record' });
    return z.NEVER;
  }

  // 与原 record 一致，忽略 __proto__，避免开放对象解析时触发原型 setter。
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '__proto__'));
}, z.object({}).catchall(z.any()));
