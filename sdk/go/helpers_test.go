package fastgpt

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
)

func TestInteractiveDetectionUnwrapAndReply(t *testing.T) {
	var sentBodies []map[string]any

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rawBytes, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read request body: %v", err)
		}
		var body map[string]any
		if err := json.Unmarshal(rawBytes, &body); err != nil {
			t.Fatalf("unmarshal request body: %v", err)
		}
		sentBodies = append(sentBodies, body)

		if streamFlag, _ := body["stream"].(bool); streamFlag {
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"恢复流完成\"}}]}\n\ndata: [DONE]\n\n")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"id":"cmpl-resume","model":"","usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":1},"choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"已继续执行完成"}}]}`)
	}))
	defer srv.Close()

	client := NewClient(
		WithBaseURL(srv.URL),
		WithAPIKey("fastgpt-app-key-123456"),
	)

	// 1. Extract & unwrap nested childrenInteractive -> userSelect from typed ChatCompletionsV2Res.
	completionJSON := []byte(`{
		"id": "cmpl-1",
		"model": "",
		"usage": {"prompt_tokens":1,"completion_tokens":1,"total_tokens":1},
		"choices": [{
			"index": 0,
			"finish_reason": "stop",
			"message": {
				"role": "assistant",
				"content": [{
					"interactive": {
						"type": "childrenInteractive",
						"params": {
							"childrenResponse": {
								"type": "loopInteractive",
								"params": {
									"childrenResponse": {
										"type": "userSelect",
										"params": {
											"description": "请选择审批路径",
											"userSelectOptions": [
												{"key": "opt1", "value": "通过"},
												{"key": "opt2", "value": "驳回"}
											]
										}
									}
								}
							}
						}
					}
				}]
			}
		}]
	}`)
	var nonStreamCompletion ChatCompletionsV2Res
	if err := json.Unmarshal(completionJSON, &nonStreamCompletion); err != nil {
		t.Fatalf("unmarshal ChatCompletionsV2Res: %v", err)
	}

	if !client.Chat.Interactive.IsInteractivePending(&nonStreamCompletion) {
		t.Fatal("expected IsInteractivePending to be true")
	}
	outer := client.Chat.Interactive.ExtractInteractive(&nonStreamCompletion)
	if outer == nil || outer.Type != InteractiveTypeChildrenInteractive {
		t.Fatalf("outer interactive = %+v, want childrenInteractive", outer)
	}
	inner := client.Chat.Interactive.UnwrapInteractive(outer)
	if inner == nil || inner.Type != InteractiveTypeUserSelect {
		t.Fatalf("inner interactive = %+v, want userSelect", inner)
	}
	if !IsUserSelectInteractive(inner) || IsUserInputInteractive(inner) || IsPaymentPauseInteractive(inner) {
		t.Fatalf("unexpected interactive predicate flags for %+v", inner)
	}
	if inner.UserSelect.UserSelectOptions[0].Value != "通过" {
		t.Fatalf("first option value = %q, want 通过", inner.UserSelect.UserSelectOptions[0].Value)
	}

	// 2. Extract from ChatStreamFinalResult and handle unknown interactive node safely.
	unknownPrompt := client.Chat.Interactive.ExtractInteractive(map[string]any{
		"interactive": map[string]any{
			"type":   "futureCustomNode",
			"params": map[string]any{"step": float64(1)},
		},
	})
	if unknownPrompt == nil || unknownPrompt.Type != InteractiveTypeUnknown || unknownPrompt.RawType != "futureCustomNode" {
		t.Fatalf("unknownPrompt = %+v, want InteractiveTypeUnknown with RawType=futureCustomNode", unknownPrompt)
	}

	// UserInput and PaymentPause payloads.
	formPrompt := ExtractInteractive(map[string]any{
		"type": "userInput",
		"params": map[string]any{
			"description": "填写信息",
			"inputForm": []any{
				map[string]any{"key": "project", "type": "input"},
			},
		},
	})
	if !IsUserInputInteractive(formPrompt) {
		t.Fatalf("expected userInput interactive, got %+v", formPrompt)
	}
	pausePrompt := ExtractInteractive(map[string]any{
		"type": "paymentPause",
		"params": map[string]any{
			"description": "余额不足",
			"continue":    false,
		},
	})
	if !IsPaymentPauseInteractive(pausePrompt) {
		t.Fatalf("expected paymentPause interactive, got %+v", pausePrompt)
	}

	// Non-interactive completion returns nil.
	if got := client.Chat.Interactive.ExtractInteractive(map[string]any{
		"choices": []any{map[string]any{"message": map[string]any{"content": "普通回复"}}},
	}); got != nil {
		t.Fatalf("expected nil for plain text completion, got %+v", got)
	}

	// 3. ReplyUserSelect & ReplyUserSelectStream.
	res1, err := client.Chat.Interactive.ReplyUserSelect(t.Context(), ReplyUserSelectParams{
		ChatID: "c-interactive",
		Value:  "通过",
	})
	if err != nil {
		t.Fatalf("ReplyUserSelect() error = %v", err)
	}
	if text, ok := res1.Choices[0].Message.Content.Text(); !ok || text != "已继续执行完成" {
		t.Fatalf("unexpected reply text: (%q, %v)", text, ok)
	}
	if gotStream, _ := sentBodies[0]["stream"].(bool); gotStream {
		t.Fatal("ReplyUserSelect should send stream=false")
	}

	stream1, err := client.Chat.Interactive.ReplyUserSelectStream(t.Context(), ReplyUserSelectParams{
		ChatID: "c-interactive",
		Value:  "通过",
	})
	if err != nil {
		t.Fatalf("ReplyUserSelectStream() error = %v", err)
	}
	streamText, err := stream1.FinalText()
	if err != nil || streamText != "恢复流完成" {
		t.Fatalf("ReplyUserSelectStream FinalText = (%q, %v)", streamText, err)
	}

	// 4. ReplyUserForm & ReplyUserFormStream serialize form values as JSON content.
	_, err = client.Chat.Interactive.ReplyUserForm(t.Context(), ReplyUserFormParams{
		ChatID: "c-interactive",
		Values: map[string]any{"project": "FastGPT", "budget": 1000},
	})
	if err != nil {
		t.Fatalf("ReplyUserForm() error = %v", err)
	}
	msgs, _ := sentBodies[2]["messages"].([]any)
	msg0, _ := msgs[0].(map[string]any)
	var decodedForm map[string]any
	if err := json.Unmarshal([]byte(msg0["content"].(string)), &decodedForm); err != nil {
		t.Fatalf("unmarshal form message content: %v", err)
	}
	if decodedForm["project"] != "FastGPT" || decodedForm["budget"] != float64(1000) {
		t.Fatalf("decoded form values = %+v", decodedForm)
	}

	stream2, err := client.Chat.Interactive.ReplyUserFormStream(t.Context(), ReplyUserFormParams{
		ChatID: "c-interactive",
		Values: map[string]any{"ok": true},
	})
	if err != nil {
		t.Fatalf("ReplyUserFormStream() error = %v", err)
	}
	if text, err := stream2.FinalText(); err != nil || text != "恢复流完成" {
		t.Fatalf("ReplyUserFormStream FinalText = (%q, %v)", text, err)
	}
}

func TestAutoPaginationOffsetPageNumAndCursor(t *testing.T) {
	// 1. Offset pagination across Datasets.Data.ListAutoPaging (Pages, All, Collect, Next/Current/Err, WithPageSize, WithMaxItems, WithMaxPages).
	allChunks := make([]map[string]any, 5)
	for i := range 5 {
		allChunks[i] = map[string]any{
			"_id":       "chunk-" + string(rune('1'+i)),
			"datasetId": "ds-1",
			"q":         "Q",
			"a":         "A",
		}
	}
	var requestedOffsets []int
	var lastPagerHeader string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if h := r.Header.Get("X-Pager-Test"); h != "" {
			lastPagerHeader = h
		}
		w.Header().Set("Content-Type", "application/json")
		rawBytes, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(rawBytes, &body)

		switch {
		case strings.HasSuffix(r.URL.Path, "/core/dataset/data/v2/list"):
			off := int(body["offset"].(float64))
			ps := int(body["pageSize"].(float64))
			requestedOffsets = append(requestedOffsets, off)
			end := min(off+ps, len(allChunks))
			var slice []map[string]any
			if off < len(allChunks) {
				slice = allChunks[off:end]
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"code": 200,
				"data": map[string]any{
					"total": len(allChunks),
					"list":  slice,
				},
			})

		case strings.HasSuffix(r.URL.Path, "/core/app/logs/search"):
			if body["cursor"] == nil {
				_ = json.NewEncoder(w).Encode(map[string]any{
					"code": 200,
					"data": map[string]any{
						"list": []map[string]any{
							{"_id": "log-1", "chatId": "c1", "updateTime": "2026-01-02T00:00:00.000Z", "source": "api"},
							{"_id": "log-2", "chatId": "c2", "updateTime": "2026-01-01T00:00:00.000Z", "source": "api"},
						},
						"nextCursor": map[string]any{"timestamp": 1735689600000, "id": "cur-1"},
					},
				})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"code": 200,
				"data": map[string]any{
					"list": []map[string]any{
						{"_id": "log-3", "chatId": "c3", "updateTime": "2025-12-31T00:00:00.000Z", "source": "api"},
					},
				},
			})

		default:
			_ = json.NewEncoder(w).Encode(map[string]any{
				"code": 200,
				"data": map[string]any{"total": 0, "list": []any{}},
			})
		}
	}))
	defer srv.Close()

	client := NewClient(
		WithBaseURL(srv.URL),
		WithAPIKey("fastgpt-personal-key-123456"),
		WithDefaultAppID("app-1"),
	)

	// 1a. All() iterator across 3 pages (0, 2, 4) + forwarded RequestOptions.
	var gotIDs []string
	for item, err := range client.Datasets.Data.ListAutoPaging(
		t.Context(),
		DatasetsDataListParams{CollectionID: "col-1"},
		WithPageSize(2),
		WithPagerRequestOptions(WithRequestHeader("X-Pager-Test", "ok")),
	).All() {
		if err != nil {
			t.Fatalf("All() error = %v", err)
		}
		gotIDs = append(gotIDs, item.ID_)
	}
	if lastPagerHeader != "ok" {
		t.Fatalf("lastPagerHeader = %q, want ok", lastPagerHeader)
	}
	wantIDs := []string{"chunk-1", "chunk-2", "chunk-3", "chunk-4", "chunk-5"}
	if !slices.Equal(gotIDs, wantIDs) {
		t.Fatalf("All() IDs = %v, want %v", gotIDs, wantIDs)
	}
	if !slices.Equal(requestedOffsets, []int{0, 2, 4}) {
		t.Fatalf("requestedOffsets = %v, want [0 2 4]", requestedOffsets)
	}

	// 1b. Pages() + WithMaxItems(3).
	requestedOffsets = nil
	var pageSizes []int
	for page, err := range client.Datasets.Data.ListAutoPaging(
		t.Context(),
		DatasetsDataListParams{CollectionID: "col-1"},
		WithPageSize(2),
		WithMaxItems(3),
	).Pages() {
		if err != nil {
			t.Fatalf("Pages() error = %v", err)
		}
		pageSizes = append(pageSizes, len(page))
	}
	if !slices.Equal(pageSizes, []int{2, 1}) || !slices.Equal(requestedOffsets, []int{0, 2}) {
		t.Fatalf("pageSizes=%v offsets=%v, want [2 1] / [0 2]", pageSizes, requestedOffsets)
	}

	// 1c. Next()/Current()/Err() cursor loop + WithMaxPages(2).
	requestedOffsets = nil
	pager := client.Datasets.Data.ListAutoPaging(
		t.Context(),
		DatasetsDataListParams{CollectionID: "col-1"},
		WithPageSize(2),
		WithMaxPages(2),
	)
	var nextIDs []string
	for pager.Next() {
		nextIDs = append(nextIDs, pager.Current().ID_)
	}
	if err := pager.Err(); err != nil {
		t.Fatalf("pager.Err() = %v", err)
	}
	if !slices.Equal(nextIDs, []string{"chunk-1", "chunk-2", "chunk-3", "chunk-4"}) {
		t.Fatalf("Next() IDs = %v, want first 4 chunks", nextIDs)
	}

	// 1d. Pre-canceled context aborts immediately with ErrAborted.
	abortedCtx, cancel := context.WithCancelCause(t.Context())
	cancel(errors.New("stop"))
	if _, err := client.Datasets.Data.ListAutoPaging(
		abortedCtx,
		DatasetsDataListParams{CollectionID: "col-1"},
	).Collect(); !errors.Is(err, ErrAborted) {
		t.Fatalf("expected ErrAborted, got %v", err)
	}

	// 2. Cursor pagination via Apps.Logs.SearchAutoPaging + Collect().
	logs, err := client.Apps.Logs.SearchAutoPaging(t.Context(), AppsLogsSearchParams{
		DateStart: "2025-12-01T00:00:00.000Z",
		DateEnd:   "2026-01-03T00:00:00.000Z",
	}).Collect()
	if err != nil {
		t.Fatalf("SearchAutoPaging().Collect() error = %v", err)
	}
	if len(logs) != 3 || logs[0].ID_ != "log-1" || logs[2].ID_ != "log-3" {
		t.Fatalf("unexpected logs: %+v", logs)
	}

	// 3. Verify all remaining *AutoPaging facade constructors compile & work cleanly.
	for _, run := range []func() error{
		func() error {
			_, err := client.Apps.Logs.ListUsersAutoPaging(t.Context(), AppsLogsListUsersParams{DateStart: "a", DateEnd: "b"}).Collect()
			return err
		},
		func() error {
			_, err := client.Chat.Histories.ListAutoPaging(t.Context(), ChatHistoriesListParams{}).Collect()
			return err
		},
		func() error {
			_, err := client.Chat.Records.ListAutoPaging(t.Context(), ChatRecordsListParams{}).Collect()
			return err
		},
		func() error {
			_, err := client.Datasets.ListAutoPaging(t.Context(), DatasetsListParams{}).Collect()
			return err
		},
		func() error {
			_, err := client.Datasets.Collections.ListAutoPaging(t.Context(), DatasetsCollectionsListParams{DatasetID: "ds-1"}).Collect()
			return err
		},
	} {
		if err := run(); err != nil {
			t.Fatalf("AutoPaging endpoint call failed: %v", err)
		}
	}
}

func TestPageNumPaginatorClampingAndMetadata(t *testing.T) {
	// 1. Basic 1-indexed pageNum pagination.
	var pageNums []int
	basicItems, err := NewPageNumPaginator(
		t.Context(),
		1,
		2,
		func(_ context.Context, pageNum int, pageSize int) (PageSlice[string], error) {
			pageNums = append(pageNums, pageNum)
			all := []string{"a", "b", "c"}
			start := min((pageNum-1)*pageSize, len(all))
			end := min(start+pageSize, len(all))
			return PageSlice[string]{
				List:  all[start:end],
				Total: Int(len(all)),
			}, nil
		},
	).Collect()
	if err != nil {
		t.Fatalf("basic PageNum Collect() error = %v", err)
	}
	if !slices.Equal(pageNums, []int{1, 2}) || !slices.Equal(basicItems, []string{"a", "b", "c"}) {
		t.Fatalf("pageNums=%v items=%v", pageNums, basicItems)
	}

	// 2. Server clamps pageSize=100 down to 50 when starting from initialPageNum=3 (total=120).
	// Must keep sending pageSize=100 (preserving page addressing baseline) and return items 101..120 without duplicates.
	items120 := make([]int, 120)
	for i := range 120 {
		items120[i] = i + 1
	}
	type pageCall struct{ pageNum, pageSize int }
	var clampedCalls []pageCall
	tailItems, err := NewPageNumPaginator(
		t.Context(),
		3,
		100,
		func(_ context.Context, pageNum int, pageSize int) (PageSlice[int], error) {
			clampedCalls = append(clampedCalls, pageCall{pageNum, pageSize})
			clamped := min(pageSize, 50)
			start := min((pageNum-1)*clamped, len(items120))
			end := min(start+clamped, len(items120))
			return PageSlice[int]{
				List:  items120[start:end],
				Total: Int(len(items120)),
			}, nil
		},
	).Collect()
	if err != nil {
		t.Fatalf("clamped PageNum Collect() error = %v", err)
	}
	if len(tailItems) != 20 || tailItems[0] != 101 || tailItems[19] != 120 {
		t.Fatalf("tailItems = %v, want 101..120", tailItems)
	}
	if !slices.Equal(clampedCalls, []pageCall{{3, 100}, {4, 100}}) {
		t.Fatalf("clampedCalls = %+v, want [{3 100} {4 100}]", clampedCalls)
	}

	// 3. When server reports PageSize metadata, stops immediately without probing empty page 4.
	var metaCalls []pageCall
	metaItems, err := NewPageNumPaginator(
		t.Context(),
		3,
		100,
		func(_ context.Context, pageNum int, pageSize int) (PageSlice[int], error) {
			metaCalls = append(metaCalls, pageCall{pageNum, pageSize})
			clamped := min(pageSize, 50)
			start := min((pageNum-1)*clamped, len(items120))
			end := min(start+clamped, len(items120))
			return PageSlice[int]{
				List:     items120[start:end],
				Total:    Int(len(items120)),
				PageSize: clamped,
			}, nil
		},
	).Collect()
	if err != nil || len(metaItems) != 20 || len(metaCalls) != 1 {
		t.Fatalf("metaItems=%d metaCalls=%+v err=%v", len(metaItems), metaCalls, err)
	}

	// 4. Honors explicit HasMore metadata.
	var hasMoreCalls []int
	hmItems, err := NewPageNumPaginator(
		t.Context(),
		2,
		50,
		func(_ context.Context, pageNum int, _ int) (PageSlice[int], error) {
			hasMoreCalls = append(hasMoreCalls, pageNum)
			return PageSlice[int]{
				List:    []int{pageNum},
				Total:   Int(200),
				HasMore: Bool(pageNum < 3),
			}, nil
		},
	).Collect()
	if err != nil || !slices.Equal(hmItems, []int{2, 3}) || !slices.Equal(hasMoreCalls, []int{2, 3}) {
		t.Fatalf("hmItems=%v hasMoreCalls=%v err=%v", hmItems, hasMoreCalls, err)
	}

	// 5. Generic NewCursorPaginator limits (WithMaxItems, WithMaxPages).
	capped, err := NewCursorPaginator(
		t.Context(),
		nil,
		func(_ context.Context, cursor *string) (CursorPageSlice[string, string], error) {
			if cursor == nil {
				next := "cur-2"
				return CursorPageSlice[string, string]{List: []string{"a", "b"}, NextCursor: &next}, nil
			}
			next := "cur-3"
			return CursorPageSlice[string, string]{List: []string{"c", "d"}, NextCursor: &next}, nil
		},
		WithMaxItems(3),
		WithMaxPages(2),
	).Collect()
	if err != nil || !slices.Equal(capped, []string{"a", "b", "c"}) {
		t.Fatalf("capped = %v, err = %v", capped, err)
	}
}
