## ADDED Requirements

### Requirement: Export parameters match list query parameters
The system SHALL use the same filter parameters for export as used for the table list query, ensuring consistent results between displayed and exported data.

#### Scenario: unreadOnly consistency
- **WHEN** `feedbackType` is `'all'` and user triggers export
- **THEN** the export request SHALL send `unreadOnly: undefined` (same as list query), NOT `unreadOnly: false`

#### Scenario: feedbackType filter preserved
- **WHEN** user has active feedback filter (e.g., `feedbackType: 'good'`) and triggers export
- **THEN** the export request SHALL include the same `feedbackType` and `unreadOnly` values as the current list query

### Requirement: Export error handling provides user feedback
The system SHALL notify the user when an export operation fails.

#### Scenario: Export API returns error
- **WHEN** the export API returns a non-2xx response
- **THEN** the system SHALL display an error toast message to the user

#### Scenario: Export produces empty file
- **WHEN** the export API returns a CSV with only headers (no data rows) due to no matching records
- **THEN** the system SHALL still allow download (the empty file accurately reflects the filtered state)

### Requirement: Backend export logging
The system SHALL log cursor-level errors during export to facilitate debugging.

#### Scenario: MongoDB cursor error during export
- **WHEN** the aggregation cursor encounters an error
- **THEN** the error SHALL be logged with relevant context (appId, query parameters)

### Requirement: Backend supports feedbackFilter parameter
The `exportLogs.ts` and `list.ts` API handlers SHALL consume the `feedbackFilter` parameter natively in their MongoDB where clauses.

#### Scenario: feedbackFilter with all types selected
- **WHEN** `feedbackFilter` is not provided or contains all 3 enum values (good, bad, noFeedback)
- **THEN** no feedback filter SHALL be applied to the MongoDB query

#### Scenario: feedbackFilter with only good selected
- **WHEN** `feedbackFilter: ['good']` is received
- **THEN** the query SHALL filter `{ hasGoodFeedback: true }`

#### Scenario: feedbackFilter with only bad selected
- **WHEN** `feedbackFilter: ['bad']` is received
- **THEN** the query SHALL filter `{ hasBadFeedback: true }`

#### Scenario: feedbackFilter with only noFeedback selected
- **WHEN** `feedbackFilter: ['noFeedback']` is received
- **THEN** the query SHALL filter `{ hasGoodFeedback: {$ne: true}, hasBadFeedback: {$ne: true} }`

#### Scenario: feedbackFilter with good and bad selected
- **WHEN** `feedbackFilter: ['good', 'bad']` is received
- **THEN** the query SHALL filter `{ $or: [{hasGoodFeedback: true}, {hasBadFeedback: true}] }`

#### Scenario: feedbackFilter coexists with feedbackType
- **WHEN** both `feedbackFilter` and `feedbackType` are provided in the same request
- **THEN** `feedbackFilter` SHALL take precedence and `feedbackType` SHALL be ignored (ConversationLogs pages use `feedbackFilter`, Logs page uses `feedbackType` — they never send both)
