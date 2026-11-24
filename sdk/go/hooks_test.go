package fastgpt

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

type capturedLogRecord struct {
	Level   slog.Level
	Message string
	Attrs   map[string]string
}

type recordingLogHandler struct {
	mu      *sync.Mutex
	records *[]capturedLogRecord
}

func newRecordingLogger() (*slog.Logger, *[]capturedLogRecord, *sync.Mutex) {
	mu := &sync.Mutex{}
	records := &[]capturedLogRecord{}
	h := &recordingLogHandler{mu: mu, records: records}
	return slog.New(h), records, mu
}

func (h *recordingLogHandler) Enabled(context.Context, slog.Level) bool { return true }

func (h *recordingLogHandler) Handle(_ context.Context, r slog.Record) error {
	attrs := make(map[string]string)
	r.Attrs(func(a slog.Attr) bool {
		attrs[a.Key] = fmt.Sprint(a.Value.Any())
		return true
	})
	h.mu.Lock()
	*h.records = append(*h.records, capturedLogRecord{
		Level:   r.Level,
		Message: r.Message,
		Attrs:   attrs,
	})
	h.mu.Unlock()
	return nil
}

func (h *recordingLogHandler) WithAttrs([]slog.Attr) slog.Handler { return h }
func (h *recordingLogHandler) WithGroup(string) slog.Handler      { return h }

type leakyRawCauseError struct {
	msg     string
	headers map[string]string
	apiKey  string
	inner   error
}

func (e *leakyRawCauseError) Error() string { return e.msg }
func (e *leakyRawCauseError) Unwrap() error { return e.inner }

func TestHooksOnRequestOnResponseAndRedactedSlog(t *testing.T) {
	var (
		reqContexts  []RequestHookContext
		respContexts []ResponseHookContext
		errContexts  []ErrorHookContext
		mu           sync.Mutex
		attemptCount atomic.Int32
	)
	logger, records, logMu := newRecordingLogger()

	client := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey("fastgpt-supersecretkey9999"),
		WithLogger(logger),
		WithHooks(Hooks{
			OnRequest: func(_ context.Context, ctx RequestHookContext) {
				mu.Lock()
				reqContexts = append(reqContexts, ctx)
				mu.Unlock()
			},
			OnResponse: func(_ context.Context, ctx ResponseHookContext) {
				mu.Lock()
				respContexts = append(respContexts, ctx)
				mu.Unlock()
			},
			OnError: func(_ context.Context, ctx ErrorHookContext) {
				mu.Lock()
				errContexts = append(errContexts, ctx)
				mu.Unlock()
			},
		}),
		WithHTTPClient(newTestHTTPClient(func(req *http.Request) (*http.Response, error) {
			if req.Header.Get("Authorization") != "Bearer fastgpt-supersecretkey9999" {
				t.Fatalf("unexpected wire authorization header: %q", req.Header.Get("Authorization"))
			}
			if attemptCount.Add(1) == 1 {
				return jsonHTTPResponse(503, map[string]any{"message": "overload"}, map[string]string{
					"Retry-After": "0",
				}), nil
			}
			return &http.Response{
				StatusCode: 200,
				Header: http.Header{
					"Content-Type": []string{"application/zip"},
					"X-Request-Id": []string{"req-hook-1"},
				},
				Body: newBlockingReadCloser(req.Context(), 0, []byte{0x50, 0x4b, 0x03, 0x04}, nil),
			}, nil
		})),
	)

	data, err := client.Datasets.Collections.BatchDownload(t.Context(), DatasetsCollectionsBatchDownloadParams{
		Ticket: "secret-ticket-888",
	})
	if err != nil {
		t.Fatalf("BatchDownload() error = %v", err)
	}
	if !bytes.Equal(data, []byte{0x50, 0x4b, 0x03, 0x04}) {
		t.Fatalf("unexpected bytes: %x", data)
	}

	if len(reqContexts) != 2 || reqContexts[0].Attempt != 0 || reqContexts[1].Attempt != 1 {
		t.Fatalf("unexpected reqContexts: %+v", reqContexts)
	}
	if strings.Contains(reqContexts[0].Headers.Get("Authorization"), "supersecretkey9999") {
		t.Fatalf("hook authorization not redacted: %q", reqContexts[0].Headers.Get("Authorization"))
	}
	if strings.Contains(reqContexts[0].URL, "secret-ticket-888") {
		t.Fatalf("hook URL ticket not redacted: %q", reqContexts[0].URL)
	}
	if len(respContexts) != 2 || respContexts[0].StatusCode != 503 || respContexts[1].StatusCode != 200 || respContexts[1].RequestID != "req-hook-1" {
		t.Fatalf("unexpected respContexts: %+v", respContexts)
	}
	if len(errContexts) != 0 {
		t.Fatalf("expected 0 errContexts, got %d", len(errContexts))
	}

	logMu.Lock()
	serializedLogs, _ := json.Marshal(*records)
	logMu.Unlock()
	if strings.Contains(string(serializedLogs), "supersecretkey9999") || strings.Contains(string(serializedLogs), "secret-ticket-888") {
		t.Fatalf("secrets leaked in slog records: %s", serializedLogs)
	}
}

func TestHooksOnErrorOnceAndPanicIsolation(t *testing.T) {
	var errContexts []ErrorHookContext
	logger, records, logMu := newRecordingLogger()

	client := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey("fastgpt-key-12345678"),
		WithMaxRetries(0),
		WithLogger(logger),
		WithHooks(Hooks{
			OnRequest: func(context.Context, RequestHookContext) {
				panic("telemetry sink offline")
			},
			OnError: func(_ context.Context, ctx ErrorHookContext) {
				errContexts = append(errContexts, ctx)
			},
		}),
		WithHTTPClient(newTestHTTPClient(func(*http.Request) (*http.Response, error) {
			return jsonHTTPResponse(200, map[string]any{
				"code":       500,
				"statusText": "internalErr",
				"message":    "Upstream failure",
			}, nil), nil
		})),
	)

	_, err := client.Models.Catalog(t.Context(), ModelsCatalogParams{})
	if !errors.Is(err, ErrServer) {
		t.Fatalf("Catalog() err = %v, want ErrServer", err)
	}
	if len(errContexts) != 1 || errContexts[0].OperationID != "models.catalog" || !errors.Is(errContexts[0].Error, ErrServer) {
		t.Fatalf("unexpected errContexts: %+v", errContexts)
	}

	logMu.Lock()
	var sawOnRequestWarn bool
	for _, rec := range *records {
		if rec.Level == slog.LevelWarn && strings.Contains(rec.Message, "OnRequest") {
			sawOnRequestWarn = true
		}
	}
	logMu.Unlock()
	if !sawOnRequestWarn {
		t.Fatal("expected warn log mentioning OnRequest panic")
	}
}

func TestHooksStandaloneRedactedErrorAndCauseView(t *testing.T) {
	var errContexts []ErrorHookContext
	logger, records, logMu := newRecordingLogger()
	sentinelInner := errors.New("socket closed Bearer innerSecretToken5555")

	rawCause := &leakyRawCauseError{
		msg:     "Upstream Bearer secretCauseToken9999 failed for fastgpt-causekey123456 at /api/core/dataset/collection/batchDownload?ticket=leak-ticket-1 and /system/file/u/uploadsession9999",
		headers: map[string]string{"authorization": "Bearer rawHeaderSecret7777"},
		apiKey:  "fastgpt-rawpropkey8888",
		inner:   sentinelInner,
	}

	client := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey("fastgpt-clientkey123456"),
		WithMaxRetries(0),
		WithLogger(logger),
		WithHooks(Hooks{
			OnRequest: func(context.Context, RequestHookContext) {
				panic("Hook crash with Bearer hookSecretToken1111 and fastgpt-hookapikey2222 ?token=hook-tok")
			},
			OnError: func(_ context.Context, ctx ErrorHookContext) {
				errContexts = append(errContexts, ctx)
			},
		}),
		WithHTTPClient(newTestHTTPClient(func(*http.Request) (*http.Response, error) {
			return nil, rawCause
		})),
	)

	_, caughtErr := client.Models.Catalog(t.Context(), ModelsCatalogParams{})
	if !errors.Is(caughtErr, ErrNetwork) || !errors.Is(caughtErr, sentinelInner) {
		t.Fatalf("caughtErr = %v, want ErrNetwork wrapping sentinelInner", caughtErr)
	}
	if len(errContexts) != 1 {
		t.Fatalf("expected 1 errContext, got %d", len(errContexts))
	}

	hookErr := errContexts[0].Error
	if hookErr == caughtErr {
		t.Fatal("OnError must receive a standalone sanitized copy, not the original error pointer")
	}
	if errors.Unwrap(hookErr) == rawCause {
		t.Fatal("OnError error.Cause must not expose rawCause pointer")
	}
	var leakyCheck *leakyRawCauseError
	if errors.As(hookErr, &leakyCheck) {
		t.Fatal("OnError error chain must strip rawCause concrete struct fields")
	}

	var combined strings.Builder
	for cur := hookErr; cur != nil; cur = errors.Unwrap(cur) {
		combined.WriteString(cur.Error())
		combined.WriteByte('\n')
	}
	if apiErr, ok := hookErr.(*APIError); ok {
		combined.WriteString(apiErr.URL)
	}
	combinedText := combined.String()
	for _, secret := range []string{
		"secretCauseToken9999",
		"fastgpt-causekey123456",
		"leak-ticket-1",
		"uploadsession9999",
		"innerSecretToken5555",
		"rawHeaderSecret7777",
		"fastgpt-rawpropkey8888",
	} {
		if strings.Contains(combinedText, secret) || strings.Contains(caughtErr.Error(), secret) {
			t.Fatalf("secret %q leaked in hook or caught error: hook=%q caught=%q", secret, combinedText, caughtErr.Error())
		}
	}

	logMu.Lock()
	serializedLogs, _ := json.Marshal(*records)
	logMu.Unlock()
	for _, hookSecret := range []string{"hookSecretToken1111", "fastgpt-hookapikey2222", "hook-tok"} {
		if strings.Contains(string(serializedLogs), hookSecret) {
			t.Fatalf("hook panic secret %q leaked in slog: %s", hookSecret, serializedLogs)
		}
	}
}

func TestHooksScrubsOpenAPIAndCustomOEMKeys(t *testing.T) {
	const (
		customOEMKey = "acme-oemsecretkey987654321"
		openapiKey   = "openapi-liveserverkey123456789"
	)
	var (
		reqContexts []RequestHookContext
		errContexts []ErrorHookContext
	)
	logger, records, logMu := newRecordingLogger()

	client := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey(customOEMKey),
		WithMaxRetries(0),
		WithDefaultHeader("X-Trace-Key", customOEMKey),
		WithLogger(logger),
		WithHooks(Hooks{
			OnRequest: func(_ context.Context, ctx RequestHookContext) {
				reqContexts = append(reqContexts, ctx)
				panic("hook failed with " + customOEMKey + " and " + openapiKey)
			},
			OnError: func(_ context.Context, ctx ErrorHookContext) {
				errContexts = append(errContexts, ctx)
			},
		}),
		WithHTTPClient(newTestHTTPClient(func(*http.Request) (*http.Response, error) {
			return nil, errors.New("upstream rejected " + customOEMKey + " and " + openapiKey)
		})),
	)

	_, caughtErr := client.Models.Catalog(t.Context(), ModelsCatalogParams{})
	if !errors.Is(caughtErr, ErrNetwork) {
		t.Fatalf("expected ErrNetwork, got %v", caughtErr)
	}
	if strings.Contains(caughtErr.Error(), customOEMKey) || strings.Contains(caughtErr.Error(), openapiKey) {
		t.Fatalf("OEM/openapi key leaked in caught error: %s", caughtErr.Error())
	}
	if len(reqContexts) != 1 || strings.Contains(reqContexts[0].Headers.Get("X-Trace-Key"), customOEMKey) {
		t.Fatalf("OEM key leaked in X-Trace-Key hook header: %+v", reqContexts)
	}
	if len(errContexts) != 1 ||
		strings.Contains(errContexts[0].Error.Error(), customOEMKey) ||
		strings.Contains(errContexts[0].Error.Error(), openapiKey) {
		t.Fatalf("OEM/openapi key leaked in OnError view: %+v", errContexts)
	}

	logMu.Lock()
	serializedLogs, _ := json.Marshal(*records)
	logMu.Unlock()
	if strings.Contains(string(serializedLogs), customOEMKey) || strings.Contains(string(serializedLogs), openapiKey) {
		t.Fatalf("OEM/openapi key leaked in slog records: %s", serializedLogs)
	}
}

func TestHooksConcurrentRotatingKeysAndExplicitAuthHeadersUnderRace(t *testing.T) {
	// 1. Explicit Authorization / X-Api-Key headers without client apiKey must still be redacted.
	const (
		explicitBearerSecret  = "explicit-custom-bearer-secret-9999"
		explicitRawAuthSecret = "CustomScheme raw-opaque-secret-8888"
	)
	var (
		explicitReqCtxs []RequestHookContext
		explicitErrCtxs []ErrorHookContext
	)
	logger, records, logMu := newRecordingLogger()

	explicitClient := NewClient(
		WithBaseURL("https://api.example.com"),
		WithMaxRetries(0),
		WithLogger(logger),
		WithHooks(Hooks{
			OnRequest: func(_ context.Context, ctx RequestHookContext) {
				explicitReqCtxs = append(explicitReqCtxs, ctx)
			},
			OnError: func(_ context.Context, ctx ErrorHookContext) {
				explicitErrCtxs = append(explicitErrCtxs, ctx)
			},
		}),
		WithHTTPClient(newTestHTTPClient(func(*http.Request) (*http.Response, error) {
			return nil, fmt.Errorf("upstream bounced %s and %s raw-opaque-secret-8888", explicitBearerSecret, explicitRawAuthSecret)
		})),
	)

	_, err := explicitClient.Models.Catalog(
		t.Context(),
		ModelsCatalogParams{},
		WithRequestHeader("Authorization", "Bearer "+explicitBearerSecret),
		WithRequestHeader("X-Api-Key", explicitRawAuthSecret),
	)
	if !errors.Is(err, ErrNetwork) {
		t.Fatalf("expected ErrNetwork, got %v", err)
	}
	logMu.Lock()
	explicitSerializedLogs, _ := json.Marshal(*records)
	logMu.Unlock()
	explicitCheck := fmt.Sprintf(
		"%+v %+v %s %s",
		explicitReqCtxs,
		explicitErrCtxs,
		err.Error(),
		explicitSerializedLogs,
	)
	if strings.Contains(explicitCheck, explicitBearerSecret) || strings.Contains(explicitCheck, explicitRawAuthSecret) {
		t.Fatalf("explicit auth secret leaked: %s", explicitCheck)
	}

	// 2. 45 concurrent requests with rotating API keys: request #0 stalls until 44 faster requests
	//    complete, then fails with its own secret; per-request secretScope must scrub #0 cleanly under -race.
	var (
		seq          atomic.Int64
		rotatingMu   sync.Mutex
		rotatingErrs []string
	)
	slowStarted := make(chan struct{})
	releaseSlow := make(chan struct{})
	const slowSecret = "oemrot-slow-request-secret-0000"

	rotatingClient := NewClient(
		WithBaseURL("https://api.example.com"),
		WithMaxRetries(0),
		WithAPIKeyProvider(func(context.Context) (string, error) {
			cur := seq.Add(1) - 1
			if cur == 0 {
				return slowSecret, nil
			}
			return fmt.Sprintf("oemrot-fast-request-secret-%04d", cur), nil
		}),
		WithHooks(Hooks{
			OnError: func(_ context.Context, ctx ErrorHookContext) {
				rotatingMu.Lock()
				rotatingErrs = append(rotatingErrs, ctx.Error.Error())
				rotatingMu.Unlock()
			},
		}),
		WithHTTPClient(newTestHTTPClient(func(req *http.Request) (*http.Response, error) {
			rawToken := strings.TrimPrefix(req.Header.Get("Authorization"), "Bearer ")
			if rawToken == slowSecret {
				close(slowStarted)
				<-releaseSlow
				return nil, errors.New("slow request failed with leaked " + slowSecret)
			}
			return jsonHTTPResponse(200, map[string]any{
				"code": 200,
				"data": map[string]any{"version": "ok"},
			}, nil), nil
		})),
	)

	var (
		slowErr error
		slowWG  sync.WaitGroup
	)
	slowWG.Add(1)
	go func() {
		defer slowWG.Done()
		_, slowErr = rotatingClient.Models.Catalog(t.Context(), ModelsCatalogParams{})
	}()

	<-slowStarted

	var fastWG sync.WaitGroup
	fastErrs := make([]error, 44)
	for i := range 44 {
		fastWG.Add(1)
		go func(idx int) {
			defer fastWG.Done()
			_, fastErrs[idx] = rotatingClient.Models.Catalog(t.Context(), ModelsCatalogParams{})
		}(i)
	}
	fastWG.Wait()
	for i, ferr := range fastErrs {
		if ferr != nil {
			t.Fatalf("fast request #%d error = %v", i, ferr)
		}
	}

	close(releaseSlow)
	slowWG.Wait()

	if !errors.Is(slowErr, ErrNetwork) {
		t.Fatalf("slowErr = %v, want ErrNetwork", slowErr)
	}
	if strings.Contains(slowErr.Error(), slowSecret) {
		t.Fatalf("slowSecret leaked in returned error: %s", slowErr.Error())
	}
	rotatingMu.Lock()
	defer rotatingMu.Unlock()
	if len(rotatingErrs) != 1 || strings.Contains(rotatingErrs[0], slowSecret) {
		t.Fatalf("slowSecret leaked in OnError hook: %+v", rotatingErrs)
	}
}
