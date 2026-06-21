# Enterprise Knowledge Sync Baseline

FastGPT already includes collection sync and dataset auto-sync scheduling for link/API-backed collections. This fork adds enterprise audit coverage around manual collection sync so internal operators can trace who synced what and whether it succeeded.

## Supported Baseline

| Capability | Status |
| --- | --- |
| Manual collection sync | Implemented by `POST /api/core/dataset/collection/sync`. |
| Link collection refresh | Supported when the collection type can sync. |
| API dataset file refresh | Supported through configured API dataset servers. |
| Dataset auto-sync scheduler | Available through existing `autoSync` dataset setting and BullMQ scheduler reconciliation. |
| Enterprise audit event | Added as `knowledge_sync.run` for success and failure. |

## Audit Payload

The enterprise audit record includes:

| Field | Description |
| --- | --- |
| `actor` | User/team/member that triggered sync. |
| `resource` | Collection ID and collection name. |
| `metadata.datasetId` | Dataset containing the collection. |
| `metadata.datasetName` | Dataset display name when available. |
| `metadata.collectionType` | Source type, such as link or API-backed collection. |
| `metadata.syncResult` | `success`, `sameRaw`, or `failed` on successful API completion. |
| `metadata.error` | Error message when sync throws. |

## Operator Flow

1. Create a dataset backed by an approved source.
2. Add link/API-backed collections only from allowed internal sources.
3. Trigger `POST /api/core/dataset/collection/sync` for one collection and confirm the response.
4. Check enterprise audit logs for `knowledge_sync.run`.
5. Enable dataset `autoSync` for scheduled daily refresh where appropriate.
6. Run scheduler reconciliation after deployment if Redis scheduler state was lost.

## Source-1 Recommendation

Use one source as the first production pilot: SharePoint or Feishu, depending on the corporate source of truth. Keep permissions coarse in phase one by binding each source to a department dataset; defer document-level permission mirroring until the identity group mapping is stable.
