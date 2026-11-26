import type { WorkflowIssueLike } from '@/web/core/workflow/issueView';
import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';

const referenceIssueCodes = new Set([
  'invalid_reference',
  'invalid_reference_type',
  'unreachable_reference',
  WorkflowDiagnosticCodeEnum.referenceTypeMismatch
]);

const getIssueFieldKey = (issue: WorkflowIssueLike) =>
  `${'nodeId' in issue ? issue.nodeId : ''}\0${issue.inputKey ?? ''}`;

/** 统计变量变更后新增的引用字段；同一字段上的多条问题只算一处。 */
export const countNewReferenceIssues = (
  before: readonly WorkflowIssueLike[],
  after: readonly WorkflowIssueLike[]
) => {
  const beforeFields = new Set(
    before.filter((issue) => referenceIssueCodes.has(issue.code)).map(getIssueFieldKey)
  );
  const afterFields = new Set(
    after.filter((issue) => referenceIssueCodes.has(issue.code)).map(getIssueFieldKey)
  );

  return [...afterFields].filter((key) => !beforeFields.has(key)).length;
};
