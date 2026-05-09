import { SpanStatusCode } from '@opentelemetry/api';
import type { ZodError, z } from 'zod';
import type { ApiRequestProps } from '../../type/next';
import { getLogger, LogCategories } from '../logger';

type SpanAttributeValue = string | number | boolean;

type ValidationSpan = {
  setAttribute: (key: string, value: SpanAttributeValue) => unknown;
  setStatus: (status: { code: SpanStatusCode; message?: string }) => unknown;
};

type NormalizedZodIssue = {
  path: string;
  code: string;
  message: string;
  expected?: string;
  received?: string;
};

type InputSummary = {
  body: {
    topLevelKeys: string[];
  };
  query: {
    topLevelKeys: string[];
  };
};

export type HttpZodValidationErrorReportProps = {
  error: ZodError;
  req: ApiRequestProps;
  span: ValidationSpan;
  request: {
    requestId: string;
    method: string;
    url: string;
    route: string;
    ip?: string;
    userAgent?: string | string[];
  };
};

const logger = getLogger(LogCategories.HTTP.ERROR);

const normalizePath = (path: z.core.$ZodIssue['path']) => path.map(String).join('.');

export const normalizeZodIssues = (error: ZodError): NormalizedZodIssue[] =>
  error.issues.map((issue) => {
    const issueWithType = issue as z.core.$ZodIssue & {
      expected?: unknown;
      received?: unknown;
    };

    return {
      path: normalizePath(issue.path),
      code: issue.code,
      message: issue.message,
      expected: issueWithType.expected === undefined ? undefined : String(issueWithType.expected),
      received: issueWithType.received === undefined ? undefined : String(issueWithType.received)
    };
  });

const getTopLevelKeys = (value: unknown): string[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value);
};

export const getRequestInputSummary = (req: ApiRequestProps): InputSummary => ({
  body: {
    topLevelKeys: getTopLevelKeys(req.body)
  },
  query: {
    topLevelKeys: getTopLevelKeys(req.query)
  }
});

const setValidationSpanAttributes = ({
  span,
  issueCount,
  paths
}: {
  span: ValidationSpan;
  issueCount: number;
  paths: string[];
}) => {
  span.setAttribute('http.response.status_code', 400);
  span.setAttribute('error.type', 'ZodError');
  span.setAttribute('validation.error', true);
  span.setAttribute('validation.issue_count', issueCount);
  span.setAttribute('validation.paths', paths.join(','));
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: 'Data validation error'
  });
};

export const reportHttpZodValidationError = ({
  error,
  req,
  span,
  request
}: HttpZodValidationErrorReportProps) => {
  const issues = normalizeZodIssues(error);
  const paths = Array.from(new Set(issues.map((issue) => issue.path).filter(Boolean)));
  const issueCount = issues.length;

  setValidationSpanAttributes({
    span,
    issueCount,
    paths
  });

  logger.error('HTTP Zod validation error', {
    event: 'http.zod_validation_error',
    requestId: request.requestId,
    method: request.method,
    url: request.url,
    route: request.route,
    ip: request.ip,
    userAgent: request.userAgent,
    issueCount,
    paths,
    issues,
    inputSummary: getRequestInputSummary(req)
  });
};
