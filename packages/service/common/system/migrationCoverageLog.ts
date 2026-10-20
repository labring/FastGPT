import { SECRET_MASK, getDomainSecretKeys } from '@fastgpt/global/common/system/config/permission';
import type { SystemInstanceConfigDomainKey } from '@fastgpt/global/common/system/config/schema';
import { getLogger, LogCategories } from '../logger';

const logger = getLogger(LogCategories.SYSTEM);

export type InstanceConfigReadSource =
  | 'instance-config'
  | 'env-fallback'
  | 'schema-default'
  | 'caller-override'
  | 'bridged-fe'
  | 'bridged-system-env'
  | 'pro-runtime'
  | 'admin-db'
  | 'migration';

type InstanceConfigLogField = {
  /** Full instance config path, for example `auth.openApiKeyMaxCount`. */
  path: string;
  value: unknown;
  /** Override the callsite-level source when one callsite reads multiple sources. */
  source?: InstanceConfigReadSource;
};

type LogInstanceConfigReadParams = {
  /** Stable identifier used to assert migration coverage from logs. */
  callsite: string;
  fields: InstanceConfigLogField[];
  source?: InstanceConfigReadSource;
  /** Log only the first execution for each caller location/path pair. */
  dedupe?: boolean;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !(value instanceof RegExp);

const getSecretKeys = (domain: string) => {
  const secretKeys = getDomainSecretKeys(domain as SystemInstanceConfigDomainKey);
  return secretKeys.size > 0 ? secretKeys : undefined;
};

/**
 * Mask registry-declared secret leaves before values enter logs.
 * Matching is path-based so composite reads such as `providers.documentParse`
 * cannot accidentally expose nested API keys.
 */
const maskSecretValues = ({
  domain,
  path,
  value,
  secretKeys
}: {
  domain: string;
  path: string;
  value: unknown;
  secretKeys?: Set<string>;
}): unknown => {
  if (secretKeys?.has(path)) {
    if (typeof value === 'string') {
      return value.trim().length > 0 ? SECRET_MASK : value;
    }
    return value ? SECRET_MASK : value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      maskSecretValues({
        domain,
        path: `${path}.${index}`,
        value: item,
        secretKeys
      })
    );
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        maskSecretValues({
          domain,
          path: path ? `${path}.${key}` : key,
          value: item,
          secretKeys
        })
      ])
    );
  }

  return value;
};

/** Keep logs readable while preserving enough value detail for migration debugging. */
const compactValue = (value: unknown): unknown => {
  if (value === undefined) return '<undefined>';
  if (value === null) return null;
  if (typeof value === 'string') {
    if (value.length === 0) return '<empty>';
    return value.length > 160 ? `${value.slice(0, 160)}...` : value;
  }
  if (Array.isArray(value)) {
    if (value.length <= 5) {
      return value.map(compactValue);
    }
    return {
      type: 'array',
      length: value.length,
      preview: value.slice(0, 3).map(compactValue)
    };
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 20)
        .map(([key, item]) => [key, compactValue(item)])
    );
  }
  return value;
};

const sanitizeField = ({
  field,
  defaultSource
}: {
  field: InstanceConfigLogField;
  defaultSource: InstanceConfigReadSource;
}) => {
  const [domain, ...segments] = field.path.split('.');
  const relativePath = segments.join('.');
  const state =
    field.value === undefined
      ? 'unset'
      : field.value === null
        ? 'null'
        : typeof field.value === 'string' && field.value.trim().length === 0
          ? 'empty'
          : Array.isArray(field.value) && field.value.length === 0
            ? 'empty-array'
            : 'set';

  return {
    path: field.path,
    source: field.source ?? defaultSource,
    state,
    ...(process.env.MIGRATION_VERIFY_INCLUDE_VALUES === 'true'
      ? {
          value: compactValue(
            maskSecretValues({
              domain,
              path: relativePath,
              value: field.value,
              secretKeys: getSecretKeys(domain)
            })
          )
        }
      : {})
  };
};

/** Build the path/source/state payload used by coverage logs and unit tests. */
export const buildInstanceConfigCoverageFields = ({
  fields,
  source = 'instance-config'
}: Pick<LogInstanceConfigReadParams, 'fields' | 'source'>) =>
  fields.map((field) => sanitizeField({ field, defaultSource: source }));

const getCallStack = () => {
  const stack = new Error().stack?.split('\n').slice(2) ?? [];
  return stack
    .map((line) => line.trim().replace(/^at\s+/, ''))
    .filter(
      (line) =>
        line.length > 0 && !line.includes('migrationCoverageLog') && !line.includes('node:internal')
    )
    .slice(0, 6);
};

const loggedCallLocations = new Set<string>();

const emitCoverageLog = ({
  action,
  callsite,
  fields,
  source,
  stack
}: {
  action: 'read' | 'write';
  callsite: string;
  fields: InstanceConfigLogField[];
  source: InstanceConfigReadSource;
  stack: string[];
}) => {
  logger.info(`[MIG-CONFIG] instance config ${action}`, {
    callsite,
    fields: buildInstanceConfigCoverageFields({ fields, source }),
    stack
  });
};

/**
 * Emit one structured coverage line for each real instance-config consumer.
 *
 * This is intentionally test-only: enabling `MIGRATION_VERIFY_LOG=true` makes
 * it possible to grep `[MIG-CONFIG]` after exercising the application and see
 * which callsites were visited, which config paths they read, and whether the
 * effective value came from the database, an env fallback, or a bridge.
 */
export const logInstanceConfigRead = ({
  callsite,
  fields,
  source = 'instance-config',
  dedupe = process.env.MIGRATION_VERIFY_LOG_EVERY_CALL !== 'true'
}: LogInstanceConfigReadParams) => {
  if (process.env.MIGRATION_VERIFY_LOG !== 'true') return;

  const stack = getCallStack();
  if (dedupe) {
    // Include a few frames so helper wrappers still distinguish their real callers.
    const key = `${stack.slice(0, 4).join('|') || callsite}:${fields
      .map((field) => field.path)
      .join(',')}`;
    if (loggedCallLocations.has(key)) return;
    loggedCallLocations.add(key);
  }

  emitCoverageLog({
    action: 'read',
    callsite,
    fields,
    source,
    stack
  });
};

/** Log an Admin or migration write using the same path-based secret masking. */
export const logInstanceConfigWrite = ({
  callsite,
  fields,
  source = 'admin-db'
}: Pick<LogInstanceConfigReadParams, 'callsite' | 'fields' | 'source'>) => {
  if (process.env.MIGRATION_VERIFY_LOG !== 'true') return;

  emitCoverageLog({
    action: 'write',
    callsite,
    fields,
    source,
    stack: getCallStack()
  });
};
