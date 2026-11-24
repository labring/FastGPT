# `github.com/labring/FastGPT/sdk/go`

Official Go SDK (`package fastgpt`) for the FastGPT System OpenAPI.

- **Zero third-party dependencies** — built exclusively on the Go 1.24 standard library (`net/http`, `encoding/json`, `iter.Seq2`, `context.AfterFunc`, `log/slog`).
- **47 System OpenAPI operations** — deterministic domain service tree (`client.Apps.Logs`, `client.Chat`, `client.Datasets`, `client.Models`) generated from FastGPT's OpenAPI IR alongside `@fastgpt/sdk` (TypeScript).
- **Tri-state optional fields (`Opt[T]`)** — leverages Go 1.24 `json:",omitzero"` to distinguish omitted fields, explicit zero values (`fastgpt.Bool(false)`, `fastgpt.Int(0)`, `fastgpt.String("")`), and explicit JSON `null` (`fastgpt.Null[T]()`).
- **Streaming, interactive workflows & auto-pagination** — incremental WHATWG SSE stream (`ChatStream`), workflow human-in-the-loop recovery (`client.Chat.Interactive`), and offset/pageNum/cursor `*AutoPaging` (`*Pager[T]`).

---

## Installation

Requires **Go 1.24+**.

```bash
go get github.com/labring/FastGPT/sdk/go
```

---

## Quick Start & Authentication

Supports both **Personal API Keys** (full System OpenAPI access) and **App API Keys** (bound to a single app; `appId` is optional):

```go
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	fastgpt "github.com/labring/FastGPT/sdk/go"
)

func main() {
	ctx := context.Background()

	// Supports static keys (or FASTGPT_BASE_URL / FASTGPT_API_KEY env vars)
	// and dynamic rotation via fastgpt.WithAPIKeyProvider(...)
	client := fastgpt.NewClient(
		fastgpt.WithBaseURL(os.Getenv("FASTGPT_BASE_URL")),
		fastgpt.WithAPIKey(os.Getenv("FASTGPT_API_KEY")),
		fastgpt.WithDefaultAppID(os.Getenv("FASTGPT_APP_ID")), // optional for personal keys
	)

	catalog, err := client.Models.Catalog(ctx, fastgpt.ModelsCatalogParams{})
	if err != nil {
		log.Fatal(err)
	}
	count := 0
	if catalog.Data != nil {
		count = len(catalog.Data.Models)
	}
	fmt.Printf("version=%s models=%d\n", catalog.Version, count)
}
```

### End-User Identity Isolation (`WithIdentity`) & Per-Request Overrides

FastGPT accepts `customUid` (end-user isolation) or `authProxy` (team member proxy for personal keys) in `query` or `body` depending on the endpoint. `client.WithIdentity(...)` injects the identity automatically while sharing the underlying `*http.Client` connection pool:

```go
userClient := client.WithIdentity(fastgpt.IdentityCustomUID("customer_42"))

histories, err := userClient.Chat.Histories.List(ctx, fastgpt.ChatHistoriesListParams{
	PageSize: fastgpt.Int(20),
})

// Per-request overrides and raw HTTP response inspection
var raw fastgpt.RawResponse
detail, err := client.Datasets.Detail(
	ctx,
	fastgpt.DatasetsDetailParams{ID: "68ad85a7463006c963799a05"},
	fastgpt.WithRequestAPIKey(os.Getenv("FASTGPT_PERSONAL_KEY")),
	fastgpt.WithRequestTimeout(10*time.Second),
	fastgpt.WithRawResponse(&raw),
)
fmt.Println(detail.Name, raw.StatusCode, raw.RequestID)
```

---

## Chat Completions (Sync & SSE Streaming)

Streaming and non-streaming variants of `POST /v2/chat/completions` are exposed as `CompletionsV2` and `CompletionsV2Stream`:

```go
// Non-streaming completion
completion, err := userClient.Chat.CompletionsV2(ctx, fastgpt.ChatCompletionsV2Params{
	ChatID:   fastgpt.String("chat_001"),
	Messages: fastgpt.Some([]fastgpt.ChatMessage{fastgpt.UserMessage("Summarize today's release notes.")}),
	Detail:   fastgpt.Bool(true),
})

// Streaming SSE via Go 1.24 iter.Seq2 range loop
stream, err := userClient.Chat.CompletionsV2Stream(ctx, fastgpt.ChatCompletionsV2Params{
	ChatID:   fastgpt.String("chat_001"),
	Messages: fastgpt.Some([]fastgpt.ChatMessage{fastgpt.UserMessage("Summarize today's release notes.")}),
	Detail:   fastgpt.Bool(true),
})
if err != nil {
	log.Fatal(err)
}
defer stream.Close()

for ev, err := range stream.Events() {
	if err != nil {
		log.Fatal(err)
	}
	switch e := ev.(type) {
	case fastgpt.ChatSSEAnswerEvent:
		fmt.Print(e.TextDelta)
	case fastgpt.ChatSSEFlowNodeStatusEvent:
		fmt.Printf("\nNode: %s (%s)\n", e.Name, e.Status)
	}
}

// Safely callable both after iterating Events()/Next() or directly without iterating
summary, err := stream.FinalResult()
fmt.Printf("Title=%q Quotes=%d\n", summary.ChatTitle, len(summary.Quotes))
```

### Workflow Interactive Pause & Resume (`client.Chat.Interactive`)

```go
if userClient.Chat.Interactive.IsInteractivePending(completion) {
	outer := userClient.Chat.Interactive.ExtractInteractive(completion)
	prompt := userClient.Chat.Interactive.UnwrapInteractive(outer)

	switch {
	case fastgpt.IsUserSelectInteractive(prompt):
		_, err = userClient.Chat.Interactive.ReplyUserSelect(ctx, fastgpt.ReplyUserSelectParams{
			ChatID: "chat_001",
			Value:  prompt.UserSelect.UserSelectOptions[0].Value,
		})
	case fastgpt.IsUserInputInteractive(prompt):
		_, err = userClient.Chat.Interactive.ReplyUserForm(ctx, fastgpt.ReplyUserFormParams{
			ChatID: "chat_001",
			Values: map[string]any{"project": "FastGPT", "priority": "P0"},
		})
	}
}
```

---

## Datasets: Multipart Uploads, Unions & Auto-Pagination

```go
// Upload a local file (multipart/form-data file + JSON data)
created, err := client.Datasets.Collections.CreateByLocalFile(ctx, fastgpt.DatasetsCollectionsCreateByLocalFileParams{
	DatasetID:    "68ad85a7463006c963799a05",
	TrainingType: fastgpt.String("chunk"),
	File: fastgpt.FileUpload{
		Filename:    "handbook.md",
		ContentType: "text/markdown",
		Bytes:       markdownBytes,
	},
})

// Sealed union request helpers (e.g. DeleteCollectionByID / DeleteCollectionsByIDs / DeleteCollectionsByAPIFiles)
err = client.Datasets.Collections.Delete(ctx, fastgpt.DeleteCollectionByID(created.CollectionID))

// Offset auto-pagination (`All()`, `Pages()`, `Collect()`, or `Next()/Current()/Err()`)
for chunk, err := range client.Datasets.Data.ListAutoPaging(
	ctx,
	fastgpt.DatasetsDataListParams{CollectionID: created.CollectionID},
	fastgpt.WithPageSize(50),
	fastgpt.WithMaxItems(500),
).All() {
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(chunk.ID_, chunk.Q)
}

// Cursor auto-pagination for app logs (`POST /core/app/logs/search`)
logs, err := client.Apps.Logs.SearchAutoPaging(
	ctx,
	fastgpt.AppsLogsSearchParams{
		DateStart: "2026-01-01T00:00:00.000Z",
		DateEnd:   "2026-01-31T23:59:59.999Z",
	},
	fastgpt.WithMaxPages(5),
).Collect()
```

---

## Observability & Structured Errors

All SDK errors implement `*fastgpt.APIError` with secret-redacted messages, URLs, causes, hooks, and `slog` output:

```go
client := fastgpt.NewClient(
	fastgpt.WithAPIKey(os.Getenv("FASTGPT_API_KEY")),
	fastgpt.WithLogger(slog.Default()),
	fastgpt.WithHooks(fastgpt.Hooks{
		OnRequest: func(_ context.Context, r fastgpt.RequestHookContext) {
			log.Printf("-> %s %s (attempt %d)", r.Method, r.URL, r.Attempt)
		},
		OnResponse: func(_ context.Context, r fastgpt.ResponseHookContext) {
			log.Printf("<- %d reqId=%s (%s)", r.StatusCode, r.RequestID, r.Duration)
		},
		OnError: func(_ context.Context, e fastgpt.ErrorHookContext) {
			log.Printf("!! %s: %v", e.OperationID, e.Error)
		},
	}),
)

if _, err := client.Chat.Histories.List(ctx, fastgpt.ChatHistoriesListParams{}); err != nil {
	switch {
	case errors.Is(err, fastgpt.ErrAuth):
		// 401 / 403 / serverCode 514 (unAuthApiKey)
	case errors.Is(err, fastgpt.ErrConflict):
		// 409 / chatIsGenerating; check apiErr.ChatGeneratingConflict() for recovery fields
	case errors.Is(err, fastgpt.ErrRateLimit):
		// 429 / tooManyRequest
	case errors.Is(err, fastgpt.ErrNetwork):
		// Transport failure or truncated SSE stream before [DONE]
	case errors.Is(err, fastgpt.ErrAborted):
		// Caller context cancellation
	}
}
```

---

## Testing

Run unit tests (with race detector):

```bash
go test -count=1 -race -v ./...
```

Run live backend smoke tests (opt-in; skipped unless `FASTGPT_SMOKE_BASE_URL` and `FASTGPT_SMOKE_API_KEY` are set):

```bash
FASTGPT_SMOKE_BASE_URL=http://localhost:3000 \
FASTGPT_SMOKE_API_KEY=fastgpt-xxxx \
FASTGPT_SMOKE_APP_ID=68ad85a7463006c963799a05 \
go test -count=1 -v -run TestLive ./...
```
