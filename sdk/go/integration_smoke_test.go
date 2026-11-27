package fastgpt

import (
	"errors"
	"os"
	"strings"
	"testing"
	"time"
)

func requireSmokeConfig(t *testing.T) (string, string, string) {
	t.Helper()
	baseURL := strings.TrimSpace(os.Getenv("FASTGPT_SMOKE_BASE_URL"))
	apiKey := strings.TrimSpace(os.Getenv("FASTGPT_SMOKE_API_KEY"))
	appID := strings.TrimSpace(os.Getenv("FASTGPT_SMOKE_APP_ID"))
	if baseURL == "" || apiKey == "" {
		t.Skip("skipping live integration smoke test: set FASTGPT_SMOKE_BASE_URL and FASTGPT_SMOKE_API_KEY")
	}
	return baseURL, apiKey, appID
}

func TestLiveModelsSmoke(t *testing.T) {
	baseURL, apiKey, appID := requireSmokeConfig(t)
	opts := []ClientOption{WithBaseURL(baseURL), WithAPIKey(apiKey)}
	if appID != "" {
		opts = append(opts, WithDefaultAppID(appID))
	}
	client := NewClient(opts...)

	var raw RawResponse
	publicModels, err := client.Models.List(t.Context(), WithRawResponse(&raw))
	if err != nil {
		t.Fatalf("Models.List() error = %v", err)
	}
	if raw.StatusCode != 200 {
		t.Fatalf("Models.List() status = %d, want 200", raw.StatusCode)
	}
	if publicModels == nil || publicModels.Models == nil || publicModels.Providers == nil {
		t.Fatalf("unexpected Models.List() payload: %+v", publicModels)
	}

	catalog, err := client.Models.Catalog(t.Context(), ModelsCatalogParams{})
	if err != nil {
		t.Fatalf("Models.Catalog() error = %v", err)
	}
	if catalog.Version == "" {
		t.Fatal("expected non-empty Models.Catalog().Version")
	}
}

func TestLiveDatasetsSmoke(t *testing.T) {
	baseURL, apiKey, appID := requireSmokeConfig(t)
	opts := []ClientOption{WithBaseURL(baseURL), WithAPIKey(apiKey)}
	if appID != "" {
		opts = append(opts, WithDefaultAppID(appID))
	}
	client := NewClient(opts...)

	res, err := client.Datasets.List(t.Context(), DatasetsListParams{PageSize: Int(5)})
	if err != nil {
		// App-scoped API keys may lack permission to list personal datasets.
		if errors.Is(err, ErrAuth) {
			return
		}
		t.Fatalf("Datasets.List() error = %v", err)
	}
	if res == nil || res.List == nil {
		t.Fatalf("unexpected Datasets.List() response: %+v", res)
	}
}

func TestLiveChatAndLogsSmoke(t *testing.T) {
	baseURL, apiKey, appID := requireSmokeConfig(t)
	if appID == "" {
		t.Skip("skipping live chat/logs smoke test: FASTGPT_SMOKE_APP_ID not set")
	}

	client := NewClient(
		WithBaseURL(baseURL),
		WithAPIKey(apiKey),
		WithDefaultAppID(appID),
	)

	stream, err := client.Chat.CompletionsV2Stream(t.Context(), ChatCompletionsV2Params{
		Messages: Some([]ChatMessage{UserMessage("请只回复 OK")}),
		Detail:   Bool(true),
	})
	if err != nil {
		t.Fatalf("CompletionsV2Stream() error = %v", err)
	}

	chunkCount := 0
	for ev, err := range stream.Events() {
		if err != nil {
			t.Fatalf("stream.Events() error = %v", err)
		}
		if ans, ok := ev.(ChatSSEAnswerEvent); ok && ans.TextDelta != "" {
			chunkCount++
		}
	}
	summary, err := stream.FinalResult()
	if err != nil {
		t.Fatalf("stream.FinalResult() error = %v", err)
	}
	if chunkCount == 0 || strings.TrimSpace(summary.Text) == "" {
		t.Fatalf("expected non-empty stream response, chunks=%d text=%q", chunkCount, summary.Text)
	}

	now := time.Now().UTC()
	weekAgo := now.Add(-7 * 24 * time.Hour)
	logs, err := client.Apps.Logs.Search(t.Context(), AppsLogsSearchParams{
		DateStart: weekAgo.Format(time.RFC3339),
		DateEnd:   now.Format(time.RFC3339),
	})
	if err != nil {
		t.Fatalf("Apps.Logs.Search() error = %v", err)
	}
	if logs.List == nil {
		t.Fatal("expected non-nil Apps.Logs.Search().List")
	}

	pagedLogs, err := client.Apps.Logs.SearchAutoPaging(
		t.Context(),
		AppsLogsSearchParams{
			DateStart: weekAgo.Format(time.RFC3339),
			DateEnd:   now.Format(time.RFC3339),
		},
		WithMaxPages(1),
		WithMaxItems(10),
	).Collect()
	if err != nil {
		t.Fatalf("Apps.Logs.SearchAutoPaging().Collect() error = %v", err)
	}
	_ = pagedLogs
}
