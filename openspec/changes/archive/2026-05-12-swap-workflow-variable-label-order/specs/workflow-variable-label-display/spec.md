## ADDED Requirements

### Requirement: Extraction field label displays field name first

The system SHALL display text content extraction output labels in the format `{字段名} - {提取结果}` instead of `{提取结果}-{字段名}`.

#### Scenario: New extraction field label order

- **WHEN** user adds a new extraction field with key "dwa" in a text content extraction node
- **THEN** the output label SHALL be "dwa - 提取结果"

#### Scenario: Existing fields retain old labels

- **WHEN** an existing extraction field was created before this change
- **THEN** the output label SHALL remain unchanged until the user edits and re-saves the field
