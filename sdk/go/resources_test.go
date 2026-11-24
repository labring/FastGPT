package fastgpt

import (
	"bytes"
	"encoding/json"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"reflect"
	"slices"
	"strings"
	"testing"
)

func TestResourcesDualModeMultipartBinaryVoidRawResponseAndOpt(t *testing.T) {
	type capturedReq struct {
		method      string
		path        string
		rawQuery    string
		contentType string
		body        []byte
	}
	var captured []capturedReq

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		captured = append(captured, capturedReq{
			method:      r.Method,
			path:        r.URL.Path,
			rawQuery:    r.URL.RawQuery,
			contentType: r.Header.Get("Content-Type"),
			body:        body,
		})
		w.Header().Set("X-Request-Id", "req-res-1")

		switch {
		case strings.HasSuffix(r.URL.Path, "/v2/chat/completions"):
			var reqBody map[string]any
			_ = json.Unmarshal(body, &reqBody)
			if stream, _ := reqBody["stream"].(bool); stream {
				w.Header().Set("Content-Type", "text/event-stream")
				_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"流式回复\"}}]}\n\ndata: [DONE]\n\n")
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"id":"cmpl-1","model":"","usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":1},"choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"同步回复"}}]}`)

		case strings.HasSuffix(r.URL.Path, "/core/dataset/collection/batchDownload"):
			w.Header().Set("Content-Type", "application/zip")
			_, _ = w.Write([]byte{0x50, 0x4b, 0x03, 0x04})

		case strings.HasSuffix(r.URL.Path, "/core/chat/history/markRead"):
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"code":200,"statusText":"","message":"","data":null}`)

		case strings.HasSuffix(r.URL.Path, "/core/dataset/collection/create/localFile"):
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"code":200,"statusText":"","message":"","data":{"collectionId":"col-1","results":{"insertLen":1}}}`)

		default:
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"code":200,"statusText":"","message":"","data":{"total":0,"list":[]}}`)
		}
	}))
	defer srv.Close()

	client := NewClient(
		WithBaseURL(srv.URL),
		WithAPIKey("fastgpt-personal-key-123456"),
		WithDefaultAppID("68ad85a7463006c963799a05"),
	)

	// 1. Dual-mode CompletionsV2 (rawJson) vs CompletionsV2Stream (SSE) + Opt[bool] false/null + WithRawResponse.
	var syncRaw RawResponse
	syncRes, err := client.Chat.CompletionsV2(
		t.Context(),
		ChatCompletionsV2Params{
			ChatID:            String("c-1"),
			Messages:          Some([]ChatMessage{UserMessage("你好")}),
			Detail:            Bool(false),
			RetainDatasetCite: Null[bool](),
		},
		WithRawResponse(&syncRaw),
	)
	if err != nil {
		t.Fatalf("CompletionsV2() error = %v", err)
	}
	if syncRes.ID != "cmpl-1" || syncRaw.StatusCode != 200 || syncRaw.RequestID != "req-res-1" {
		t.Fatalf("syncRes=%+v syncRaw=%+v", syncRes, syncRaw)
	}
	var syncSent map[string]any
	if err := json.Unmarshal(captured[0].body, &syncSent); err != nil {
		t.Fatalf("unmarshal syncSent: %v", err)
	}
	if syncSent["stream"] != false {
		t.Fatalf("expected stream=false, got %v", syncSent["stream"])
	}
	if v, ok := syncSent["detail"]; !ok || v != false {
		t.Fatalf("expected explicit detail=false, got (%v, %v)", v, ok)
	}
	if v, ok := syncSent["retainDatasetCite"]; !ok || v != nil {
		t.Fatalf("expected explicit retainDatasetCite=null, got (%v, %v)", v, ok)
	}
	if _, hasShowSkill := syncSent["showSkillReferences"]; hasShowSkill {
		t.Fatal("unset Opt[bool] showSkillReferences should be omitted via omitzero")
	}

	var streamRaw RawResponse
	stream, err := client.Chat.CompletionsV2Stream(
		t.Context(),
		ChatCompletionsV2Params{
			ChatID:   String("c-1"),
			Messages: Some([]ChatMessage{UserMessage("你好")}),
		},
		WithRawResponse(&streamRaw),
	)
	if err != nil {
		t.Fatalf("CompletionsV2Stream() error = %v", err)
	}
	streamText, err := stream.FinalText()
	if err != nil || streamText != "流式回复" || streamRaw.StatusCode != 200 {
		t.Fatalf("streamText=%q err=%v raw=%+v", streamText, err, streamRaw)
	}

	// 2. Multipart fileAndJsonData upload (Datasets.Collections.CreateByLocalFile).
	created, err := client.Datasets.Collections.CreateByLocalFile(t.Context(), DatasetsCollectionsCreateByLocalFileParams{
		DatasetID:    "68ad85a7463006c963799a01",
		TrainingType: String("chunk"),
		File: FileUpload{
			Filename:    "readme.md",
			ContentType: "text/markdown",
			Bytes:       []byte("# Markdown Doc"),
		},
	})
	if err != nil {
		t.Fatalf("CreateByLocalFile() error = %v", err)
	}
	if created.CollectionID != "col-1" {
		t.Fatalf("CollectionID = %q, want col-1", created.CollectionID)
	}

	mpReq := captured[2]
	mediaType, mediaParams, err := mime.ParseMediaType(mpReq.contentType)
	if err != nil || !strings.HasPrefix(mediaType, "multipart/form-data") {
		t.Fatalf("unexpected multipart content-type %q (err=%v)", mpReq.contentType, err)
	}
	mr := multipart.NewReader(bytes.NewReader(mpReq.body), mediaParams["boundary"])
	partData := make(map[string]string)
	var gotFilename string
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("multipart NextPart: %v", err)
		}
		contentBytes, _ := io.ReadAll(part)
		partData[part.FormName()] = string(contentBytes)
		if part.FormName() == "file" {
			gotFilename = part.FileName()
		}
	}
	if gotFilename != "readme.md" || partData["file"] != "# Markdown Doc" {
		t.Fatalf("multipart file part = (%q, %q)", gotFilename, partData["file"])
	}
	var mpMeta map[string]any
	if err := json.Unmarshal([]byte(partData["data"]), &mpMeta); err != nil {
		t.Fatalf("unmarshal multipart data JSON: %v", err)
	}
	if mpMeta["datasetId"] != "68ad85a7463006c963799a01" || mpMeta["trainingType"] != "chunk" {
		t.Fatalf("multipart data JSON = %+v", mpMeta)
	}

	// 3. Binary download (Datasets.Collections.BatchDownload).
	zipBytes, err := client.Datasets.Collections.BatchDownload(t.Context(), DatasetsCollectionsBatchDownloadParams{
		Ticket: "archive-ticket-123",
	})
	if err != nil {
		t.Fatalf("BatchDownload() error = %v", err)
	}
	if !slices.Equal(zipBytes, []byte{0x50, 0x4b, 0x03, 0x04}) {
		t.Fatalf("zipBytes = %x, want 504b0304", zipBytes)
	}
	if captured[3].method != http.MethodGet || captured[3].rawQuery != "ticket=archive-ticket-123" {
		t.Fatalf("BatchDownload req = %+v", captured[3])
	}

	// 4. Void endpoint (Chat.Histories.MarkRead) + WithRawResponse.
	var voidRaw RawResponse
	if err := client.Chat.Histories.MarkRead(
		t.Context(),
		ChatHistoriesMarkReadParams{ChatID: "chat-1"},
		WithRawResponse(&voidRaw),
	); err != nil {
		t.Fatalf("MarkRead() error = %v", err)
	}
	if voidRaw.StatusCode != 200 || voidRaw.RequestID != "req-res-1" {
		t.Fatalf("voidRaw = %+v", voidRaw)
	}

	// 5. Tri-state Opt[int](0) / Opt[bool](false) / Opt[string]("") / Null[string]() on Datasets.Collections.List.
	_, err = client.Datasets.Collections.List(t.Context(), DatasetsCollectionsListParams{
		DatasetID:  "ds-1",
		Offset:     Int(0),
		Simple:     Bool(false),
		SearchText: String(""),
		ParentID:   Null[string](),
	})
	if err != nil {
		t.Fatalf("Collections.List() error = %v", err)
	}
	var listSent map[string]any
	if err := json.Unmarshal(captured[5].body, &listSent); err != nil {
		t.Fatalf("unmarshal listSent: %v", err)
	}
	if listSent["offset"] != float64(0) || listSent["simple"] != false || listSent["searchText"] != "" {
		t.Fatalf("tri-state zero values not preserved: %+v", listSent)
	}
	if val, ok := listSent["parentId"]; !ok || val != nil {
		t.Fatalf("explicit Null[string] parentId = (%v, %v), want (nil, true)", val, ok)
	}
	if _, hasSort := listSent["sortBy"]; hasSort {
		t.Fatal("unset sortBy should be omitted via omitzero")
	}
}

func TestSealedUnionHelpersAndResponseUnions(t *testing.T) {
	var bodies []map[string]any

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var m map[string]any
		_ = json.Unmarshal(raw, &m)
		bodies = append(bodies, m)
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"code":200,"statusText":"","message":"","data":null}`)
	}))
	defer srv.Close()

	client := NewClient(WithBaseURL(srv.URL), WithAPIKey("fastgpt-personal-key-123456"))

	// 1. Sealed request union constructors for delete/update/tags/messages/datasets.
	if err := client.Datasets.Collections.Delete(t.Context(), DeleteCollectionByID("col-1")); err != nil {
		t.Fatalf("Delete(ByID) error = %v", err)
	}
	if err := client.Datasets.Collections.Delete(t.Context(), DeleteCollectionsByIDs("col-1", "col-2")); err != nil {
		t.Fatalf("Delete(ByIDs) error = %v", err)
	}
	if err := client.Datasets.Collections.Delete(t.Context(), DeleteCollectionsByAPIFiles("ds-1", "ext-1")); err != nil {
		t.Fatalf("Delete(ByAPIFiles) error = %v", err)
	}
	if err := client.Datasets.Collections.Update(t.Context(), UpdateCollectionByID("col-1")); err != nil {
		t.Fatalf("Update(ByID) error = %v", err)
	}
	extUpdate := UpdateCollectionByExternalFile("ds-1", "ext-1")
	extUpdate.Name = String("renamed-ext")
	if err := client.Datasets.Collections.Update(t.Context(), extUpdate); err != nil {
		t.Fatalf("Update(ByExternalFile) error = %v", err)
	}

	if bodies[0]["id"] != "col-1" || len(bodies[0]) != 1 {
		t.Fatalf("DeleteByID body = %+v", bodies[0])
	}
	if _, ok := bodies[1]["collectionIds"]; !ok || len(bodies[1]) != 1 {
		t.Fatalf("DeleteByIDs body = %+v", bodies[1])
	}
	if bodies[2]["datasetId"] != "ds-1" || len(bodies[2]) != 2 {
		t.Fatalf("DeleteByAPIFiles body = %+v", bodies[2])
	}
	if bodies[3]["id"] != "col-1" || bodies[4]["externalFileId"] != "ext-1" || bodies[4]["name"] != "renamed-ext" {
		t.Fatalf("Update bodies = %+v / %+v", bodies[3], bodies[4])
	}

	// Verify message, tag, and dataset search union constructors serialize cleanly.
	msgBytes, err := json.Marshal([]ChatMessage{
		SystemMessage("sys"),
		UserMessageParts(TextPart("hi"), ImageURLPart("https://example.com/a.png")),
		AssistantMessage("ok"),
		ToolMessage("tc-1", "result"),
	})
	if err != nil || !strings.Contains(string(msgBytes), `"tool_call_id":"tc-1"`) {
		t.Fatalf("marshal ChatMessage union = (%s, %v)", msgBytes, err)
	}

	tagBytes, err := json.Marshal([]DatasetCollectionTagInput{
		TagName("legacy"),
		TagKV("env", TagString("prod")),
	})
	if err != nil || !strings.Contains(string(tagBytes), `"tag":"env"`) {
		t.Fatalf("marshal tag union = (%s, %v)", tagBytes, err)
	}

	// 2. Response unions & resilient unknown-variant decoding.
	var textContent ChatCompletionsV2ResChoicesItemMessageContent
	if err := json.Unmarshal([]byte(`"plain text"`), &textContent); err != nil {
		t.Fatalf("unmarshal text content: %v", err)
	}
	if !textContent.IsText() || textContent.IsParts() {
		t.Fatalf("unexpected textContent flags")
	}
	if s, ok := textContent.Text(); !ok || s != "plain text" {
		t.Fatalf("Text() = (%q, %v)", s, ok)
	}

	var partsContent ChatCompletionsV2ResChoicesItemMessageContent
	if err := json.Unmarshal([]byte(`[{"text":"hello"}]`), &partsContent); err != nil {
		t.Fatalf("unmarshal parts content: %v", err)
	}
	if !partsContent.IsParts() || partsContent.IsText() {
		t.Fatalf("unexpected partsContent flags")
	}
	if parts, ok := partsContent.Parts(); !ok || len(parts) != 1 || parts[0]["text"] != "hello" {
		t.Fatalf("Parts() = (%+v, %v)", parts, ok)
	}

	var initApp ChatInitRes
	if err := json.Unmarshal([]byte(`{"chatId":"c1","appId":"a1","variables":{},"app":{"name":"Demo","chatConfig":{}}}`), &initApp); err != nil {
		t.Fatalf("unmarshal ChatInitRes: %v", err)
	}
	if appVar, ok := initApp.AsApp(); !ok || appVar.AppID != "a1" {
		t.Fatalf("AsApp() = (%+v, %v)", appVar, ok)
	}
	var initFuture ChatInitRes
	if err := json.Unmarshal([]byte(`{"chatId":"c2","futureField":123}`), &initFuture); err != nil {
		t.Fatalf("unknown future ChatInitRes should not error: %v", err)
	}
	if len(initFuture.RawJSON) == 0 {
		t.Fatal("expected RawJSON preserved on ChatInitRes")
	}

	var modelSummary ModelsSummaryResModelsItem
	if err := json.Unmarshal([]byte(`{"modelId":"m1","status":"deleted"}`), &modelSummary); err != nil {
		t.Fatalf("unmarshal ModelsSummaryResModelsItem: %v", err)
	}
	if del, ok := modelSummary.AsDeleted(); !ok || del.ModelID != "m1" {
		t.Fatalf("AsDeleted() = (%+v, %v)", del, ok)
	}

	var errUnion ChatRecordsGetResponseDataResItemError
	if err := json.Unmarshal([]byte(`{"message":"boom"}`), &errUnion); err != nil {
		t.Fatalf("unmarshal error union object: %v", err)
	}
	if obj, ok := errUnion.Object(); !ok || obj["message"] != "boom" {
		t.Fatalf("Object() = (%+v, %v)", obj, ok)
	}
}

func TestClientSurfaceStrictlyExcludesSystemAndRawRequest(t *testing.T) {
	clientType := reflect.TypeFor[Client]()
	if _, hasSystem := clientType.FieldByName("System"); hasSystem {
		t.Fatal("Client must NOT expose System field")
	}
	for _, fieldName := range []string{"Apps", "Chat", "Datasets", "Models"} {
		if _, ok := clientType.FieldByName(fieldName); !ok {
			t.Fatalf("Client missing expected service field %q", fieldName)
		}
	}
	clientPtrType := reflect.TypeFor[*Client]()
	if _, hasRawReq := clientPtrType.MethodByName("RawRequest"); hasRawReq {
		t.Fatal("*Client must NOT expose RawRequest method")
	}
}
