/** STT 单价固定按每 60 秒或每百万 Tokens 配置，不接受模型自定义分母。 */
export const STT_PRICE_UNITS = { duration: 60, tokens: 1_000_000 } as const;
