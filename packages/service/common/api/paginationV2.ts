/**
 * v2 list 接口的私有分页解析。
 *
 * 不复用 legacy `parsePaginationRequest`（packages/service/common/api/pagination.ts）：
 * 它基于"键存在/truthy"分支（仅当 body 含 pageSize 键才读取、offset 用 truthy 判断导致
 * offset:0 失效、接受数字字符串），与 v2 严格契约冲突；公共实现保持零改动。
 *
 * 输入为已通过 ListV2PaginationSchema 校验的 body（number 类型保证、offset/pageNum 互斥已校验）。
 */
export const parseV2Pagination = (body: {
  pageSize?: number;
  offset?: number;
  pageNum?: number;
}): { pageSize: number; offset: number } => {
  const pageSize = body.pageSize ?? 10; // 缺省 10（与 PaginationSchema 默认一致）
  const offset = body.offset ?? ((body.pageNum ?? 1) - 1) * pageSize; // ?? 语义：offset=0 正确生效
  return { pageSize, offset };
};
