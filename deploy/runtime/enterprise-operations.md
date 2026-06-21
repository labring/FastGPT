# Enterprise Operations Runbook

This runbook covers the internal-enterprise hardening APIs and UI for admin permissions, audit export, role-based operations, knowledge sync operations, and staging validation.

## Enterprise UI

Team managers can open the Enterprise Operations page from Account -> Enterprise, or visit:

```text
/account/enterprise
```

The page includes:

- audit log filters, pagination, and CSV export
- enterprise RBAC binding management
- knowledge sync status, retry, and scheduler reconcile actions
- staging smoke execution against a configured base URL

## Admin Permission

Enterprise operation APIs support dedicated enterprise roles with a team-manage compatibility fallback:

- `enterprise_owner`: can manage enterprise RBAC and use every enterprise operation endpoint
- `audit_admin`: can read and export enterprise audit logs
- `knowledge_admin`: can run knowledge sync reconcile operations

Root users always pass. Existing team managers are still allowed as a compatibility fallback while teams migrate to explicit RBAC bindings.

Manage role bindings from the Enterprise UI, or through the RBAC APIs.

List bindings:

```bash
curl -H "Authorization: Bearer $FASTGPT_TOKEN" \
  "$FASTGPT_BASE_URL/api/support/enterprise/rbac/list"
```

Upsert one user's roles:

```bash
curl -X POST -H "Authorization: Bearer $FASTGPT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER_ID\",\"roles\":[\"audit_admin\",\"knowledge_admin\"]}" \
  "$FASTGPT_BASE_URL/api/support/enterprise/rbac/upsert"
```

Remove one user's binding:

```bash
curl -X DELETE -H "Authorization: Bearer $FASTGPT_TOKEN" \
  "$FASTGPT_BASE_URL/api/support/enterprise/rbac/delete?userId=$USER_ID"
```

## Audit Logs

List audit logs:

```bash
curl -H "Authorization: Bearer $FASTGPT_TOKEN" \
  "$FASTGPT_BASE_URL/api/support/enterprise/audit/list?pageNum=1&pageSize=20"
```

Useful filters:

- `action`: for example `app.update`, `dataset.delete`, `knowledge_sync.run`
- `result`: `success` or `failure`
- `actorType`: `user`, `root`, `apikey`, `system`, `anonymous`
- `actorUserId`
- `resourceType`
- `resourceId`
- `startTime` and `endTime`: ISO datetime strings
- `searchKey`: matches action, actor name, resource name, request id, or client IP

Export audit logs as CSV:

```bash
curl -L -H "Authorization: Bearer $FASTGPT_TOKEN" \
  "$FASTGPT_BASE_URL/api/support/enterprise/audit/export?limit=10000" \
  -o enterprise-audit.csv
```

Every export writes an `audit.export` event into the enterprise audit log.

## Knowledge Sync Operations

Check one dataset sync state:

```bash
curl -H "Authorization: Bearer $FASTGPT_TOKEN" \
  "$FASTGPT_BASE_URL/api/core/dataset/sync/status?datasetId=$DATASET_ID"
```

Retry one dataset sync:

```bash
curl -X POST -H "Authorization: Bearer $FASTGPT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"datasetId\":\"$DATASET_ID\"}" \
  "$FASTGPT_BASE_URL/api/core/dataset/sync/retry"
```

Reconcile missing auto-sync schedulers:

```bash
curl -X POST -H "Authorization: Bearer $FASTGPT_TOKEN" \
  "$FASTGPT_BASE_URL/api/core/dataset/sync/reconcile"
```

`retry` and `reconcile` write `knowledge_sync.run` audit events with success or failure status.

## Staging Validation

Prepare a staging env file from `deploy/enterprise/.env.example`, then run:

```bash
node deploy/enterprise/staging-smoke.mjs /path/to/staging.env
```

The smoke check validates:

- required enterprise env variables
- Docker Compose config rendering
- optional HTTP reachability when `FASTGPT_STAGING_BASE_URL` is set

To probe a running staging deployment:

```bash
FASTGPT_STAGING_BASE_URL=https://fastgpt-staging.example.com \
  node deploy/enterprise/staging-smoke.mjs /path/to/staging.env
```

The HTTP probe calls `/api/common/system/getInitData` and expects a JSON response.
