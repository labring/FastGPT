## ADDED Requirements

### Requirement: Export button on ConversationLogs list tab
The system SHALL provide an export button on the ConversationLogs page when `subTab === 'list'`, using the same `PopoverConfirm` pattern as the Logs page.

#### Scenario: Export button visible in list tab
- **WHEN** user is on the ConversationLogs page with `subTab === 'list'`
- **THEN** a `PopoverConfirm` wrapped export button SHALL be displayed alongside LogFilters
- **AND** the popover content SHALL show the total count using `app:logs_export_confirm_tip` i18n key

#### Scenario: Export button hidden in optimize tab
- **WHEN** user switches to `subTab === 'optimize'`
- **THEN** the list export button SHALL not be visible (optimize tab has its own export button)

### Requirement: Export uses LogFilters state
The system SHALL construct export parameters from the current LogFilters state, passing `feedbackFilter` directly without conversion.

#### Scenario: Export with all filters applied
- **WHEN** user has set date range, sources, users, feedback, and search in LogFilters and clicks export
- **THEN** the export request SHALL include dateStart/dateEnd from `logFilters.dateRange`, sources from `logFilters.chatSources`, tmbIds from `logFilters.selectTmbIds`, chatSearch from `logFilters.chatSearch`, and `feedbackFilter` from `logFilters.feedbackFilters` directly

#### Scenario: Export with partial feedback selection
- **WHEN** LogFilters has `feedbackFilters: [good]` only (isSelectAllFeedback = false)
- **THEN** the export request SHALL pass `feedbackFilter: [good]` directly to the backend

#### Scenario: Export with all feedback types selected
- **WHEN** LogFilters has `isSelectAllFeedback: true`
- **THEN** the export request SHALL omit `feedbackFilter` (equivalent to no filter)

#### Scenario: Export with noFeedback selected
- **WHEN** LogFilters has `feedbackFilters: [noFeedback]` only
- **THEN** the export request SHALL pass `feedbackFilter: [noFeedback]` directly to the backend for native handling

### Requirement: Total count display in export confirmation
The system SHALL display the total record count in the export confirmation popover.

#### Scenario: Total count from LogList
- **WHEN** LogList has loaded data with a specific total count
- **THEN** the export confirmation popover SHALL display that total count
- **AND** the total SHALL be shared from LogList to the parent component via callback

#### Scenario: Total count before data loads
- **WHEN** LogList has not yet loaded data (total is 0 or undefined)
- **THEN** the export confirmation SHALL display the current total (0), and export SHALL still be allowed

### Requirement: Export CSV format matches Logs page export
The system SHALL use the same `/api/core/app/logs/exportLogs` endpoint for ConversationLogs list export, producing the same CSV format.

#### Scenario: CSV includes enabled log keys
- **WHEN** LogFilters has specific logKeys enabled
- **THEN** the export CSV SHALL include only the enabled columns plus chatDetails

#### Scenario: CSV includes sourcesMap
- **WHEN** exporting ConversationLogs list data
- **THEN** the export request SHALL include a sourcesMap built from `ChatSourceMap` for proper source label display in the CSV
