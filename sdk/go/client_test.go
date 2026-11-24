package fastgpt

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func newTestHTTPClient(fn roundTripFunc) *http.Client {
	return &http.Client{Transport: fn}
}

func jsonHTTPResponse(status int, body any, headers map[string]string) *http.Response {
	raw, err := json.Marshal(body)
	if err != nil {
		panic(err)
	}
	h := make(http.Header)
	h.Set("Content-Type", "application/json")
	for k, v := range headers {
		h.Set(k, v)
	}
	return &http.Response{
		StatusCode: status,
		Status:     http.StatusText(status),
		Header:     h,
		Body:       io.NopCloser(bytes.NewReader(raw)),
	}
}

type blockingReadCloser struct {
	ctx       context.Context
	delay     time.Duration
	payload   []byte
	sent      bool
	closeOnce sync.Once
	closedCh  chan struct{}
	onClose   func()
}

func newBlockingReadCloser(ctx context.Context, delay time.Duration, payload []byte, onClose func()) *blockingReadCloser {
	return &blockingReadCloser{
		ctx:      ctx,
		delay:    delay,
		payload:  payload,
		closedCh: make(chan struct{}),
		onClose:  onClose,
	}
}

func (b *blockingReadCloser) Read(p []byte) (int, error) {
	if b.sent {
		return 0, io.EOF
	}
	if b.delay > 0 {
		timer := time.NewTimer(b.delay)
		defer timer.Stop()
		select {
		case <-b.ctx.Done():
			return 0, b.ctx.Err()
		case <-b.closedCh:
			return 0, io.ErrClosedPipe
		case <-timer.C:
		}
	} else {
		select {
		case <-b.ctx.Done():
			return 0, b.ctx.Err()
		case <-b.closedCh:
			return 0, io.ErrClosedPipe
		default:
		}
	}
	n := copy(p, b.payload)
	b.payload = b.payload[n:]
	if len(b.payload) == 0 {
		b.sent = true
	}
	return n, nil
}

func (b *blockingReadCloser) Close() error {
	b.closeOnce.Do(func() {
		close(b.closedCh)
		if b.onClose != nil {
			b.onClose()
		}
	})
	return nil
}

func TestNormalizeAPIBaseURL(t *testing.T) {
	t.Setenv("FASTGPT_BASE_URL", "")
	if got := normalizeAPIBaseURL(""); got != "https://cloud.fastgpt.cn/api" {
		t.Fatalf("default normalizeAPIBaseURL = %q, want https://cloud.fastgpt.cn/api", got)
	}

	t.Setenv("FASTGPT_BASE_URL", "https://env.example.com/")
	if got := normalizeAPIBaseURL(""); got != "https://env.example.com/api" {
		t.Fatalf("env normalizeAPIBaseURL = %q, want https://env.example.com/api", got)
	}

	cases := []struct {
		in   string
		want string
	}{
		{"https://cloud.fastgpt.cn", "https://cloud.fastgpt.cn/api"},
		{"https://cloud.fastgpt.cn/", "https://cloud.fastgpt.cn/api"},
		{"https://host.example.com/api", "https://host.example.com/api"},
		{"https://host.example.com/api/", "https://host.example.com/api"},
	}
	for _, tc := range cases {
		if got := normalizeAPIBaseURL(tc.in); got != tc.want {
			t.Errorf("normalizeAPIBaseURL(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestClientSurfaceVersionAndHeader(t *testing.T) {
	clientType := reflect.TypeFor[Client]()
	var exportedFields []string
	for i := range clientType.NumField() {
		f := clientType.Field(i)
		if f.IsExported() {
			exportedFields = append(exportedFields, f.Name)
		}
	}
	wantFields := []string{"Apps", "Chat", "Datasets", "Models"}
	if !reflect.DeepEqual(exportedFields, wantFields) {
		t.Fatalf("Client exported fields = %v, want %v", exportedFields, wantFields)
	}

	ptrType := reflect.TypeFor[*Client]()
	if _, ok := ptrType.MethodByName("RawRequest"); ok {
		t.Fatal("Client must not expose RawRequest")
	}
	if _, ok := clientType.FieldByName("System"); ok {
		t.Fatal("Client must not expose System")
	}

	var capturedHeader string
	client := NewClient(
		WithAPIKey("fastgpt-key"),
		WithHTTPClient(newTestHTTPClient(func(req *http.Request) (*http.Response, error) {
			capturedHeader = req.Header.Get("X-FastGPT-Client")
			return jsonHTTPResponse(200, map[string]any{
				"code": 200,
				"data": map[string]any{"models": []any{}, "providers": []any{}},
			}, nil), nil
		})),
	)

	if _, err := client.Models.List(t.Context()); err != nil {
		t.Fatalf("Models.List() error = %v", err)
	}
	if capturedHeader != "fastgpt-go-sdk/"+Version {
		t.Fatalf("X-FastGPT-Client = %q, want %q", capturedHeader, "fastgpt-go-sdk/"+Version)
	}
}

func TestAuthKeyResolutionAndPublicModelList(t *testing.T) {
	t.Setenv("FASTGPT_API_KEY", "")

	type callRecord struct {
		url  string
		auth string
	}
	var calls []callRecord

	hc := newTestHTTPClient(func(req *http.Request) (*http.Response, error) {
		calls = append(calls, callRecord{
			url:  req.URL.String(),
			auth: req.Header.Get("Authorization"),
		})
		return jsonHTTPResponse(200, map[string]any{
			"code": 200,
			"data": map[string]any{"models": []any{}, "providers": []any{}, "version": "v1"},
		}, nil), nil
	})

	// 1. Missing API key on protected endpoint fails with ErrAuth without HTTP call.
	unauthClient := NewClient(WithBaseURL("https://api.example.com"), WithHTTPClient(hc))
	_, err := unauthClient.Models.Catalog(t.Context(), ModelsCatalogParams{})
	if !errors.Is(err, ErrAuth) || !errors.Is(err, ErrAPI) {
		t.Fatalf("expected ErrAuth & ErrAPI, got %v", err)
	}
	if len(calls) != 0 {
		t.Fatalf("expected 0 HTTP calls on missing API key, got %d", len(calls))
	}

	// 2. Public /core/ai/model/list works without API key and omits Authorization header.
	if _, err := unauthClient.Models.List(t.Context()); err != nil {
		t.Fatalf("public Models.List() error = %v", err)
	}
	if len(calls) != 1 || calls[0].auth != "" {
		t.Fatalf("unexpected public call record: %+v", calls)
	}

	// 3. Dynamic key provider rotates keys per call.
	var seq atomic.Int64
	dynamicClient := NewClient(
		WithBaseURL("https://api.example.com"),
		WithHTTPClient(hc),
		WithAPIKeyProvider(func(context.Context) (string, error) {
			n := seq.Add(1)
			return "fastgpt-rotated-" + string(rune('0'+n)), nil
		}),
	)
	if _, err := dynamicClient.Models.Catalog(t.Context(), ModelsCatalogParams{}); err != nil {
		t.Fatalf("dynamic Catalog #1 error = %v", err)
	}
	if _, err := dynamicClient.Models.Catalog(t.Context(), ModelsCatalogParams{}); err != nil {
		t.Fatalf("dynamic Catalog #2 error = %v", err)
	}
	if calls[1].auth != "Bearer fastgpt-rotated-1" || calls[2].auth != "Bearer fastgpt-rotated-2" {
		t.Fatalf("unexpected rotated auth headers: %+v", calls[1:])
	}

	// 4. Env fallback + per-request key override.
	t.Setenv("FASTGPT_API_KEY", "fastgpt-from-env-123456")
	envClient := NewClient(WithBaseURL("https://api.example.com"), WithHTTPClient(hc))
	if _, err := envClient.Models.Catalog(t.Context(), ModelsCatalogParams{}); err != nil {
		t.Fatalf("env Catalog error = %v", err)
	}
	if calls[3].auth != "Bearer fastgpt-from-env-123456" {
		t.Fatalf("env auth = %q, want Bearer fastgpt-from-env-123456", calls[3].auth)
	}

	if _, err := envClient.Models.Catalog(
		t.Context(),
		ModelsCatalogParams{},
		WithRequestAPIKey("fastgpt-req-override-99"),
	); err != nil {
		t.Fatalf("request override Catalog error = %v", err)
	}
	if calls[4].auth != "Bearer fastgpt-req-override-99" {
		t.Fatalf("override auth = %q, want Bearer fastgpt-req-override-99", calls[4].auth)
	}
}

func TestIdentityAndAppIDInjectionAndExclusivity(t *testing.T) {
	type capturedReq struct {
		url      string
		jsonBody map[string]any
	}
	var captured []capturedReq

	hc := newTestHTTPClient(func(req *http.Request) (*http.Response, error) {
		entry := capturedReq{url: req.URL.String()}
		if req.Body != nil {
			raw, _ := io.ReadAll(req.Body)
			if len(raw) > 0 {
				_ = json.Unmarshal(raw, &entry.jsonBody)
			}
		}
		captured = append(captured, entry)
		return jsonHTTPResponse(200, map[string]any{
			"code": 200,
			"data": map[string]any{"total": 0, "list": []any{}, "chatId": "c-1", "app": map[string]any{}},
		}, nil), nil
	})

	rootClient := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey("fastgpt-personal-key"),
		WithDefaultAppID("68ad85a7463006c963799a05"),
		WithHTTPClient(hc),
	)
	userClient := rootClient.WithIdentity(IdentityCustomUID("end-user-42"))

	// 1. Query carrier injection (GET /core/chat/init) + Opt[bool](false) preserved.
	if _, err := userClient.Chat.Init(t.Context(), ChatInitParams{
		ChatID:              "chat-1",
		LoadCustomFeedbacks: Bool(false),
	}); err != nil {
		t.Fatalf("Chat.Init() error = %v", err)
	}
	q0 := captured[0].url
	if !strings.Contains(q0, "appId=68ad85a7463006c963799a05") ||
		!strings.Contains(q0, "customUid=end-user-42") ||
		!strings.Contains(q0, "loadCustomFeedbacks=false") {
		t.Fatalf("unexpected query injection URL: %s", q0)
	}

	// 2. Preserve raw string authProxy query without overlaying client identity.
	rawProxyStr := `{"username":"bob"}`
	if _, err := userClient.Chat.Init(t.Context(), ChatInitParams{
		ChatID:    "chat-2",
		AuthProxy: AuthProxyString(rawProxyStr),
	}); err != nil {
		t.Fatalf("Chat.Init() with string authProxy error = %v", err)
	}
	if !strings.Contains(captured[1].url, "authProxy=%7B%22username%22%3A%22bob%22%7D") ||
		strings.Contains(captured[1].url, "customUid=") {
		t.Fatalf("unexpected string authProxy URL: %s", captured[1].url)
	}

	// 3. JSON body carrier injection + WithRequestIdentity + WithRequestAppID override.
	if _, err := userClient.Chat.Histories.List(
		t.Context(),
		ChatHistoriesListParams{PageSize: Int(10)},
		WithRequestIdentity(IdentityAuthProxy(AuthProxyByUsername("alice"))),
		WithRequestAppID("app-override-99"),
	); err != nil {
		t.Fatalf("Chat.Histories.List() error = %v", err)
	}
	body2 := captured[2].jsonBody
	if body2["appId"] != "app-override-99" {
		t.Fatalf("body.appId = %v, want app-override-99", body2["appId"])
	}
	if _, hasUID := body2["customUid"]; hasUID {
		t.Fatalf("expected customUid removed when authProxy overrides, got %v", body2)
	}
	if ap, ok := body2["authProxy"].(map[string]any); !ok || ap["username"] != "alice" {
		t.Fatalf("unexpected authProxy in body: %v", body2["authProxy"])
	}

	// 4. Unrelated route (datasets.list) must NOT receive appId or customUid.
	if _, err := userClient.Datasets.List(t.Context(), DatasetsListParams{
		SearchKey: String("kb"),
	}); err != nil {
		t.Fatalf("Datasets.List() error = %v", err)
	}
	if _, hasApp := captured[3].jsonBody["appId"]; hasApp {
		t.Fatalf("datasets.list unexpectedly polluted with appId: %v", captured[3].jsonBody)
	}
	if _, hasUID := captured[3].jsonBody["customUid"]; hasUID {
		t.Fatalf("datasets.list unexpectedly polluted with customUid: %v", captured[3].jsonBody)
	}

	// 5. Mutual exclusivity -> ErrBadRequest across WithIdentity, WithRequestIdentity, and payload.
	badClient := rootClient.WithIdentity(Identity{
		CustomUID: "u1",
		AuthProxy: &AuthProxy{TmbID: "t1"},
	})
	if _, err := badClient.Chat.Init(t.Context(), ChatInitParams{ChatID: "c1"}); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("bad WithIdentity error = %v, want ErrBadRequest", err)
	}
	if _, err := rootClient.Chat.Init(
		t.Context(),
		ChatInitParams{ChatID: "c1"},
		WithRequestIdentity(Identity{CustomUID: "u1", AuthProxy: &AuthProxy{TmbID: "t1"}}),
	); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("bad WithRequestIdentity error = %v, want ErrBadRequest", err)
	}
	if _, err := rootClient.Chat.Histories.List(
		t.Context(),
		ChatHistoriesListParams{
			CustomUID: String("u1"),
			AuthProxy: Some(AuthProxyByUsername("alice")),
		},
	); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("bad payload customUid+authProxy error = %v, want ErrBadRequest", err)
	}
}

func TestWithIdentityAndWithOptionsIsolationAndPoolSharing(t *testing.T) {
	parentHC := newTestHTTPClient(func(req *http.Request) (*http.Response, error) {
		return jsonHTTPResponse(200, map[string]any{
			"code": 200,
			"data": map[string]any{"version": req.Header.Get("X-Env")},
		}, nil), nil
	})
	parent := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey("fastgpt-root-key-1234"),
		WithDefaultAppID("app-root"),
		WithDefaultHeader("X-Env", "prod"),
		WithHTTPClient(parentHC),
	)

	derived := parent.WithOptions(
		WithDefaultAppID("app-staging"),
		WithDefaultHeader("X-Env", "staging"),
		WithTimeout(12*time.Second),
	)
	withID := parent.WithIdentity(IdentityCustomUID("u-derived"))

	if derived.httpClient != parent.httpClient || withID.httpClient != parent.httpClient {
		t.Fatal("derived clients must share parent *http.Client pool")
	}
	if parent.cfg.defaultAppID != "app-root" || parent.cfg.defaultHeaders.Get("X-Env") != "prod" {
		t.Fatalf("parent config mutated: %+v", parent.cfg)
	}
	if parent.cfg.identity != nil {
		t.Fatalf("parent identity mutated: %+v", parent.cfg.identity)
	}

	resParent, err := parent.Models.Catalog(t.Context(), ModelsCatalogParams{})
	if err != nil || resParent.Version != "prod" {
		t.Fatalf("parent Models.Catalog() = (%+v, %v), want prod", resParent, err)
	}
	resDerived, err := derived.Models.Catalog(t.Context(), ModelsCatalogParams{})
	if err != nil || resDerived.Version != "staging" {
		t.Fatalf("derived Models.Catalog() = (%+v, %v), want staging", resDerived, err)
	}
}

func TestWithRawResponse(t *testing.T) {
	var callCount atomic.Int32
	client := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey("fastgpt-key"),
		WithHTTPClient(newTestHTTPClient(func(req *http.Request) (*http.Response, error) {
			callCount.Add(1)
			return jsonHTTPResponse(200, map[string]any{
				"code": 200,
				"data": map[string]any{"version": "v1"},
			}, map[string]string{
				"X-Request-Id": "req-abc-999",
				"X-Extra":      "ok",
			}), nil
		})),
	)

	var raw RawResponse
	res, err := client.Models.Catalog(t.Context(), ModelsCatalogParams{}, WithRawResponse(&raw))
	if err != nil {
		t.Fatalf("Models.Catalog() error = %v", err)
	}
	if callCount.Load() != 1 {
		t.Fatalf("callCount = %d, want 1", callCount.Load())
	}
	if res.Version != "v1" {
		t.Fatalf("res.Version = %q, want v1", res.Version)
	}
	if raw.StatusCode != 200 || raw.RequestID != "req-abc-999" || raw.Header.Get("X-Extra") != "ok" {
		t.Fatalf("unexpected RawResponse: %+v", raw)
	}
	if raw.URL != "https://api.example.com/api/core/ai/model/catalog" {
		t.Fatalf("raw.URL = %q", raw.URL)
	}
}

func TestErrorMappingPriorityAndSecretRedaction(t *testing.T) {
	cases := []struct {
		name       string
		httpStatus int
		body       any
		wantKind   error
	}{
		{
			name:       "http 200 code 514 tokenInvalid",
			httpStatus: 200,
			body: map[string]any{
				"code":       514,
				"statusText": "tokenInvalid",
				"message":    "Invalid token fastgpt-1234567890",
			},
			wantKind: ErrAuth,
		},
		{
			name:       "http 401",
			httpStatus: 401,
			body:       map[string]any{"code": 514, "statusText": "unAuthApiKey", "message": "Invalid API Key"},
			wantKind:   ErrAuth,
		},
		{
			name:       "http 403",
			httpStatus: 403,
			body:       map[string]any{"code": 403, "message": "Forbidden resource"},
			wantKind:   ErrAuth,
		},
		{
			name:       "http 500 openapiUnAuth",
			httpStatus: 500,
			body:       map[string]any{"code": 506001, "statusText": "openapiUnAuth", "message": "OpenAPI unauthorized"},
			wantKind:   ErrAuth,
		},
		{
			name:       "http 404",
			httpStatus: 404,
			body:       map[string]any{"code": 404, "message": "Dataset not found"},
			wantKind:   ErrNotFound,
		},
		{
			name:       "http 410",
			httpStatus: 410,
			body:       map[string]any{"code": 502005, "statusText": "workflowBuilderVersionExpired", "message": "Version expired"},
			wantKind:   ErrNotFound,
		},
		{
			name:       "http 500 appUnExist",
			httpStatus: 500,
			body:       map[string]any{"code": 502000, "statusText": "appUnExist", "message": "App does not exist"},
			wantKind:   ErrNotFound,
		},
		{
			name:       "http 402",
			httpStatus: 402,
			body:       map[string]any{"code": 510, "statusText": "insufficientQuota", "message": "Insufficient quota"},
			wantKind:   ErrBadRequest,
		},
		{
			name:       "http 413",
			httpStatus: 413,
			body:       map[string]any{"code": 501025, "statusText": "archiveLimitExceeded", "message": "Archive too large"},
			wantKind:   ErrBadRequest,
		},
		{
			name:       "http 409",
			httpStatus: 409,
			body:       map[string]any{"code": 409, "message": "Duplicate collection"},
			wantKind:   ErrConflict,
		},
		{
			name:       "http 429",
			httpStatus: 429,
			body:       map[string]any{"code": 429, "message": "Rate limit exceeded"},
			wantKind:   ErrRateLimit,
		},
		{
			name:       "http 429 overrides legacy auth statusText",
			httpStatus: 429,
			body:       map[string]any{"code": 506001, "statusText": "openapiUnAuth", "message": "Gateway rate limited"},
			wantKind:   ErrRateLimit,
		},
		{
			name:       "http 503 overrides legacy notFound statusText",
			httpStatus: 503,
			body:       map[string]any{"code": 502000, "statusText": "appUnExist", "message": "Upstream temporarily unavailable"},
			wantKind:   ErrServer,
		},
		{
			name:       "http 200 code 500 bearer redaction",
			httpStatus: 200,
			body: map[string]any{
				"code":       500,
				"statusText": "core.chat.error",
				"message":    "Bearer secretValue987654321 failed",
			},
			wantKind: ErrServer,
		},
		{
			name:       "http 200 non-200 envelope code",
			httpStatus: 200,
			body: map[string]any{
				"code":       500,
				"statusText": "chatIsGenerating",
				"message":    "Chat is generating",
			},
			wantKind: ErrConflict,
		},
		{
			name:       "http 200 uploadFileIntervalLimit",
			httpStatus: 200,
			body: map[string]any{
				"code":       500,
				"statusText": "uploadFileIntervalLimit",
				"message":    "Too frequent",
			},
			wantKind: ErrRateLimit,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			client := NewClient(
				WithBaseURL("https://api.example.com"),
				WithAPIKey("fastgpt-key"),
				WithMaxRetries(0),
				WithHTTPClient(newTestHTTPClient(func(req *http.Request) (*http.Response, error) {
					return jsonHTTPResponse(tc.httpStatus, tc.body, map[string]string{
						"X-Fastgpt-Request-Id": "trace-77",
					}), nil
				})),
			)

			_, err := client.Models.Catalog(t.Context(), ModelsCatalogParams{})
			if !errors.Is(err, tc.wantKind) || !errors.Is(err, ErrAPI) {
				t.Fatalf("err = %v, want %v & ErrAPI", err, tc.wantKind)
			}
			var apiErr *APIError
			if !errors.As(err, &apiErr) {
				t.Fatalf("expected *APIError, got %T", err)
			}
			if apiErr.RequestID != "trace-77" {
				t.Fatalf("RequestID = %q, want trace-77", apiErr.RequestID)
			}
			if strings.Contains(err.Error(), "fastgpt-1234567890") || strings.Contains(err.Error(), "secretValue987654321") {
				t.Fatalf("secret leaked in error message: %s", err.Error())
			}
		})
	}
}

func TestGETRetryRespectsRetryAfterAndNonGETDoesNotRetry(t *testing.T) {
	var getAttempts, postAttempts atomic.Int32

	client := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey("fastgpt-key"),
		WithHTTPClient(newTestHTTPClient(func(req *http.Request) (*http.Response, error) {
			if req.Method == http.MethodGet {
				if getAttempts.Add(1) == 1 {
					return jsonHTTPResponse(503, map[string]any{"message": "Temporary overload"}, map[string]string{
						"Retry-After": "0",
					}), nil
				}
				return jsonHTTPResponse(200, map[string]any{
					"code": 200,
					"data": map[string]any{"version": "v1"},
				}, nil), nil
			}
			postAttempts.Add(1)
			return jsonHTTPResponse(503, map[string]any{"message": "Service unavailable"}, nil), nil
		})),
	)

	res, err := client.Models.Catalog(t.Context(), ModelsCatalogParams{})
	if err != nil || res.Version != "v1" {
		t.Fatalf("GET retry Catalog() = (%+v, %v), want v1", res, err)
	}
	if getAttempts.Load() != 2 {
		t.Fatalf("getAttempts = %d, want 2", getAttempts.Load())
	}

	_, err = client.Datasets.List(t.Context(), DatasetsListParams{})
	if !errors.Is(err, ErrServer) {
		t.Fatalf("POST error = %v, want ErrServer", err)
	}
	if postAttempts.Load() != 1 {
		t.Fatalf("postAttempts = %d, want 1", postAttempts.Load())
	}

	// Explicit WithRequestMaxRetries(1) opts a POST into retrying.
	postAttempts.Store(0)
	_, _ = client.Datasets.List(t.Context(), DatasetsListParams{}, WithRequestMaxRetries(1))
	if postAttempts.Load() != 2 {
		t.Fatalf("explicit retry postAttempts = %d, want 2", postAttempts.Load())
	}

	if d, ok := parseRetryAfterDelay("2"); !ok || d != 2*time.Second {
		t.Fatalf("parseRetryAfterDelay(\"2\") = (%v, %v)", d, ok)
	}
	if d, ok := parseRetryAfterDelay("999"); !ok || d != maxRetryAfterDelay {
		t.Fatalf("parseRetryAfterDelay(\"999\") = (%v, %v), want cap %v", d, ok, maxRetryAfterDelay)
	}
}

func TestTimeoutsAndContextAbortAcrossHeadersBodyAndStreams(t *testing.T) {
	// 1. Handshake timeout during RoundTrip returns ErrTimeout without retrying.
	var timeoutAttempts atomic.Int32
	slowHandshakeClient := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey("fastgpt-key"),
		WithTimeout(25*time.Millisecond),
		WithHTTPClient(newTestHTTPClient(func(req *http.Request) (*http.Response, error) {
			timeoutAttempts.Add(1)
			<-req.Context().Done()
			return nil, req.Context().Err()
		})),
	)
	_, err := slowHandshakeClient.Models.Catalog(t.Context(), ModelsCatalogParams{})
	if !errors.Is(err, ErrTimeout) || !errors.Is(err, ErrAPI) {
		t.Fatalf("handshake timeout err = %v, want ErrTimeout", err)
	}
	if timeoutAttempts.Load() != 1 {
		t.Fatalf("timeoutAttempts = %d, want 1", timeoutAttempts.Load())
	}

	// 2. Timeout AFTER headers arrive while body stalls for 80ms (> 15ms timeout) returns ErrTimeout.
	slowBodyClient := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey("fastgpt-key"),
		WithMaxRetries(0),
		WithTimeout(15*time.Millisecond),
		WithHTTPClient(newTestHTTPClient(func(req *http.Request) (*http.Response, error) {
			payload := []byte(`{"code":200,"data":{"version":"v1"}}`)
			return &http.Response{
				StatusCode: 200,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       newBlockingReadCloser(req.Context(), 80*time.Millisecond, payload, nil),
			}, nil
		})),
	)
	_, err = slowBodyClient.Models.Catalog(t.Context(), ModelsCatalogParams{})
	if !errors.Is(err, ErrTimeout) {
		t.Fatalf("slow body err = %v, want ErrTimeout", err)
	}

	// 3. External context cancel during body read returns ErrAborted wrapping custom cause.
	userCancelSentinel := errors.New("user cancelled")
	extCtx, cancelExt := context.WithCancelCause(t.Context())
	abortBodyClient := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey("fastgpt-key"),
		WithMaxRetries(0),
		WithHTTPClient(newTestHTTPClient(func(req *http.Request) (*http.Response, error) {
			time.AfterFunc(10*time.Millisecond, func() { cancelExt(userCancelSentinel) })
			return &http.Response{
				StatusCode: 200,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       newBlockingReadCloser(req.Context(), 2*time.Second, []byte("{}"), nil),
			}, nil
		})),
	)
	_, err = abortBodyClient.Models.Catalog(extCtx, ModelsCatalogParams{})
	if !errors.Is(err, ErrAborted) || !errors.Is(err, userCancelSentinel) {
		t.Fatalf("external cancel body err = %v, want ErrAborted + userCancelSentinel", err)
	}

	// 4. SSE stream clears handshake timeout once connected (first chunk at 30ms > 15ms handshake timeout),
	//    and external context cancel still aborts the stream cleanly.
	var reqCtxCanceled atomic.Bool
	sseClient := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey("fastgpt-key"),
		WithTimeout(15*time.Millisecond),
		WithHTTPClient(newTestHTTPClient(func(req *http.Request) (*http.Response, error) {
			context.AfterFunc(req.Context(), func() {
				reqCtxCanceled.Store(true)
			})
			chunk := []byte("data: {\"choices\":[{\"delta\":{\"content\":\"晚到分片\"}}]}\n\n")
			return &http.Response{
				StatusCode: 200,
				Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
				Body:       newBlockingReadCloser(req.Context(), 30*time.Millisecond, chunk, nil),
			}, nil
		})),
	)

	sseCtx, cancelSSE := context.WithCancel(t.Context())
	stream, err := sseClient.Chat.CompletionsV2Stream(sseCtx, ChatCompletionsV2Params{
		ChatID:   String("c-abort"),
		Messages: Some([]ChatMessage{UserMessage("hi")}),
	})
	if err != nil {
		t.Fatalf("CompletionsV2Stream() handshake error = %v", err)
	}

	if !stream.Next() {
		t.Fatalf("expected first slow SSE chunk after handshake, err=%v", stream.Err())
	}
	ans, ok := stream.Current().(ChatSSEAnswerEvent)
	if !ok || ans.TextDelta != "晚到分片" {
		t.Fatalf("unexpected first SSE event: %#v", stream.Current())
	}
	cancelSSE()
	if stream.Next() {
		t.Fatal("expected stream to stop after context cancel")
	}
	if !errors.Is(stream.Err(), ErrAborted) || stream.State() != ChatStreamStateAborted {
		t.Fatalf("stream terminal = (%v, %s), want (ErrAborted, aborted)", stream.Err(), stream.State())
	}
	if !reqCtxCanceled.Load() {
		t.Fatal("expected underlying HTTP request context to be canceled after stream Close/abort")
	}

	// 5. SSE handshake JSON error closes body & raises mapped API error.
	var errorBodyClosed atomic.Bool
	jsonErrStreamClient := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey("fastgpt-key"),
		WithHTTPClient(newTestHTTPClient(func(req *http.Request) (*http.Response, error) {
			payload := []byte(`{"code":514,"statusText":"tokenInvalid","message":"Invalid stream token"}`)
			return &http.Response{
				StatusCode: 200,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       newBlockingReadCloser(req.Context(), 0, payload, func() { errorBodyClosed.Store(true) }),
			}, nil
		})),
	)
	_, err = jsonErrStreamClient.Chat.CompletionsV2Stream(t.Context(), ChatCompletionsV2Params{})
	if !errors.Is(err, ErrAuth) || !errorBodyClosed.Load() {
		t.Fatalf("SSE JSON handshake error = %v, bodyClosed=%v, want ErrAuth + closed", err, errorBodyClosed.Load())
	}
}

func TestMultipartBinaryAndVoidWireEncoding(t *testing.T) {
	var (
		gotMultipartData string
		gotFileContent   string
		gotFileHeaderCT  string
		gotFilename      string
	)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/core/dataset/collection/create/localFile"):
			mediaType, params, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if err != nil || mediaType != "multipart/form-data" {
				http.Error(w, "bad content-type", http.StatusBadRequest)
				return
			}
			mr := multipart.NewReader(r.Body, params["boundary"])
			for {
				part, err := mr.NextPart()
				if err == io.EOF {
					break
				}
				if err != nil {
					http.Error(w, err.Error(), http.StatusBadRequest)
					return
				}
				data, _ := io.ReadAll(part)
				switch part.FormName() {
				case "file":
					gotFileContent = string(data)
					gotFilename = part.FileName()
					gotFileHeaderCT = part.Header.Get("Content-Type")
				case "data":
					gotMultipartData = string(data)
				}
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"code":200,"data":{"collectionId":"col-1","results":{"insertLen":1}}}`))
		case strings.HasSuffix(r.URL.Path, "/core/dataset/collection/batchDownload"):
			if r.URL.Query().Get("ticket") != "t-zip" {
				http.Error(w, "missing ticket", http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Type", "application/zip")
			_, _ = w.Write([]byte{0x50, 0x4b, 0x03, 0x04})
		case strings.HasSuffix(r.URL.Path, "/core/chat/history/markRead"):
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"code":200,"data":null}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	client := NewClient(WithBaseURL(srv.URL), WithAPIKey("fastgpt-key"))

	res, err := client.Datasets.Collections.CreateByLocalFile(t.Context(), DatasetsCollectionsCreateByLocalFileParams{
		DatasetID:    "ds-1",
		TrainingType: String("chunk"),
		ImageIndex:   Bool(false),
		File: FileUpload{
			Filename:    "readme.md",
			ContentType: "text/markdown",
			Reader:      strings.NewReader("# Markdown Doc"),
		},
	})
	if err != nil || res.CollectionID != "col-1" {
		t.Fatalf("CreateByLocalFile() = (%+v, %v)", res, err)
	}
	if gotFileContent != "# Markdown Doc" || gotFilename != "readme.md" || gotFileHeaderCT != "text/markdown" {
		t.Fatalf("unexpected multipart file part: content=%q name=%q ct=%q", gotFileContent, gotFilename, gotFileHeaderCT)
	}
	var parsedData map[string]any
	if err := json.Unmarshal([]byte(gotMultipartData), &parsedData); err != nil {
		t.Fatalf("invalid multipart data JSON %q: %v", gotMultipartData, err)
	}
	if parsedData["datasetId"] != "ds-1" || parsedData["trainingType"] != "chunk" || parsedData["imageIndex"] != false {
		t.Fatalf("unexpected multipart data JSON: %v", parsedData)
	}

	dlStream, err := client.Datasets.Collections.BatchDownload(t.Context(), DatasetsCollectionsBatchDownloadParams{
		Ticket: "t-zip",
	})
	if err != nil {
		t.Fatalf("BatchDownload() error = %v", err)
	}
	defer func() {
		_ = dlStream.Close()
	}()
	zipBytes, err := dlStream.Bytes()
	if err != nil || !bytes.Equal(zipBytes, []byte{0x50, 0x4b, 0x03, 0x04}) {
		t.Fatalf("BatchDownload().Bytes() = (%x, %v)", zipBytes, err)
	}

	if err := client.Chat.Histories.MarkRead(t.Context(), ChatHistoriesMarkReadParams{ChatID: "c-1"}); err != nil {
		t.Fatalf("MarkRead() error = %v", err)
	}
}

type chunkCallbackWriter struct {
	buf     bytes.Buffer
	onChunk func([]byte)
	mu      sync.Mutex
}

func (w *chunkCallbackWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	n, err := w.buf.Write(p)
	w.mu.Unlock()
	if w.onChunk != nil && n > 0 {
		w.onChunk(p[:n])
	}
	return n, err
}

type trackingPipeBody struct {
	pr        *io.PipeReader
	closed    atomic.Bool
	closeOnce sync.Once
	closedCh  chan struct{}
}

func newTrackingPipeBody(pr *io.PipeReader) *trackingPipeBody {
	return &trackingPipeBody{
		pr:       pr,
		closedCh: make(chan struct{}),
	}
}

func (b *trackingPipeBody) Read(p []byte) (int, error) {
	return b.pr.Read(p)
}

func (b *trackingPipeBody) Close() error {
	b.closeOnce.Do(func() {
		b.closed.Store(true)
		close(b.closedCh)
	})
	return b.pr.Close()
}

type failingReaderBody struct {
	firstChunk []byte
	sentFirst  bool
	readErr    error
	closed     atomic.Bool
}

func (b *failingReaderBody) Read(p []byte) (int, error) {
	if !b.sentFirst {
		b.sentFirst = true
		n := copy(p, b.firstChunk)
		return n, nil
	}
	return 0, b.readErr
}

func (b *failingReaderBody) Close() error {
	b.closed.Store(true)
	return nil
}

func TestBinaryDownloadStreamingCancelCloseAndNonRetryable(t *testing.T) {
	// 1. Streaming WriteTo delivers first chunk before producer closes pipe (no full-body io.ReadAll buffering).
	pr, pw := io.Pipe()
	bodyStream := newTrackingPipeBody(pr)
	firstChunkSeen := make(chan struct{})
	var firstChunkOnce sync.Once
	producerDone := make(chan error, 1)

	go func() {
		defer close(producerDone)
		if _, err := pw.Write([]byte("ZIP-PART-1:")); err != nil {
			producerDone <- err
			return
		}
		select {
		case <-firstChunkSeen:
		case <-time.After(2 * time.Second):
			producerDone <- errors.New("timed out waiting for incremental consumer read")
			_ = pw.CloseWithError(errors.New("consumer did not stream incrementally"))
			return
		}
		if _, err := pw.Write([]byte("ZIP-PART-2")); err != nil {
			producerDone <- err
			return
		}
		producerDone <- pw.Close()
	}()

	client := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey("fastgpt-key"),
		WithMaxRetries(2),
		WithHTTPClient(newTestHTTPClient(func(_ *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode:    200,
				ContentLength: 21,
				Header: http.Header{
					"Content-Type":        []string{"application/zip"},
					"Content-Disposition": []string{`attachment; filename="bundle.zip"`},
					"X-Request-Id":        []string{"req-bin-stream"},
				},
				Body: bodyStream,
			}, nil
		})),
	)

	var raw RawResponse
	dl, err := client.Datasets.Collections.BatchDownload(
		t.Context(),
		DatasetsCollectionsBatchDownloadParams{Ticket: "ticket-stream-1"},
		WithRawResponse(&raw),
	)
	if err != nil {
		t.Fatalf("BatchDownload() error = %v", err)
	}
	if dl.ContentType() != "application/zip" || dl.ContentLength() != 21 || dl.Response().RequestID != "req-bin-stream" || raw.StatusCode != 200 {
		t.Fatalf("unexpected metadata: ct=%q len=%d resp=%+v raw=%+v", dl.ContentType(), dl.ContentLength(), dl.Response(), raw)
	}

	sink := &chunkCallbackWriter{
		onChunk: func(chunk []byte) {
			if strings.Contains(string(chunk), "ZIP-PART-1:") {
				firstChunkOnce.Do(func() { close(firstChunkSeen) })
			}
		},
	}
	written, err := dl.WriteTo(sink)
	if err != nil {
		t.Fatalf("WriteTo() error = %v", err)
	}
	if err := <-producerDone; err != nil {
		t.Fatalf("producer error = %v", err)
	}
	if written != 21 || sink.buf.String() != "ZIP-PART-1:ZIP-PART-2" {
		t.Fatalf("streamed bytes = (%d, %q), want (21, ZIP-PART-1:ZIP-PART-2)", written, sink.buf.String())
	}
	if !bodyStream.closed.Load() {
		t.Fatal("expected underlying HTTP body to be closed after WriteTo")
	}

	// 2. Mid-read context cancellation immediately closes body, yields ErrAborted, and emits OnError once.
	prCancel, pwCancel := io.Pipe()
	cancelBody := newTrackingPipeBody(prCancel)
	go func() {
		_, _ = pwCancel.Write([]byte("HALF"))
		// Keep pipe open until reader closes on context cancel.
	}()

	var cancelErrHooks atomic.Int32
	cancelClient := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey("fastgpt-key"),
		WithHooks(Hooks{
			OnError: func(_ context.Context, _ ErrorHookContext) {
				cancelErrHooks.Add(1)
			},
		}),
		WithHTTPClient(newTestHTTPClient(func(_ *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: 200,
				Header: http.Header{
					"Content-Type": []string{"application/zip"},
					"X-Request-Id": []string{"req-bin-cancel"},
				},
				Body: cancelBody,
			}, nil
		})),
	)

	cancelCtx, cancelDownload := context.WithCancelCause(t.Context())
	cancelStream, err := cancelClient.Datasets.Collections.BatchDownload(
		cancelCtx,
		DatasetsCollectionsBatchDownloadParams{Ticket: "secret-cancel-ticket"},
	)
	if err != nil {
		t.Fatalf("BatchDownload() cancel setup error = %v", err)
	}
	buf := make([]byte, 4)
	n, err := cancelStream.Read(buf)
	if err != nil || n != 4 || string(buf) != "HALF" {
		t.Fatalf("first Read() = (%d, %q, %v), want (4, HALF, nil)", n, string(buf), err)
	}

	cancelDownload(errors.New("caller aborted download"))
	select {
	case <-cancelBody.closedCh:
	case <-time.After(time.Second):
		t.Fatal("expected mid-read context cancel to close underlying response body")
	}
	_, err = cancelStream.Read(buf)
	if !errors.Is(err, ErrAborted) {
		t.Fatalf("Read() after cancel = %v, want ErrAborted", err)
	}
	if strings.Contains(err.Error(), "secret-cancel-ticket") {
		t.Fatalf("ticket leaked in aborted read error: %s", err.Error())
	}
	if cancelErrHooks.Load() != 1 {
		t.Fatalf("expected OnError once on mid-stream abort, got %d", cancelErrHooks.Load())
	}

	// 3. Explicit Close prevents subsequent reads and mid-read transport failure maps to ErrNetwork.
	failBody := &failingReaderBody{
		firstChunk: []byte("OK"),
		readErr:    errors.New("connection reset by peer"),
	}
	var failHooks atomic.Int32
	failClient := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey("fastgpt-key"),
		WithHooks(Hooks{
			OnError: func(_ context.Context, _ ErrorHookContext) {
				failHooks.Add(1)
			},
		}),
		WithHTTPClient(newTestHTTPClient(func(_ *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: 200,
				Header:     http.Header{"Content-Type": []string{"application/zip"}},
				Body:       failBody,
			}, nil
		})),
	)
	failStream, err := failClient.Datasets.Collections.BatchDownload(
		t.Context(),
		DatasetsCollectionsBatchDownloadParams{Ticket: "t-fail"},
	)
	if err != nil {
		t.Fatalf("BatchDownload() fail setup error = %v", err)
	}
	var sinkBuf bytes.Buffer
	_, writeErr := failStream.WriteTo(&sinkBuf)
	if !errors.Is(writeErr, ErrNetwork) {
		t.Fatalf("WriteTo() mid-stream error = %v, want ErrNetwork", writeErr)
	}
	if !failBody.closed.Load() || failHooks.Load() != 1 {
		t.Fatalf("expected closed=true & OnError=1, got closed=%v hooks=%d", failBody.closed.Load(), failHooks.Load())
	}

	// Closing an unused stream transitions Read to ErrAborted.
	closedStream, err := client.Datasets.Collections.BatchDownload(
		t.Context(),
		DatasetsCollectionsBatchDownloadParams{Ticket: "t-close"},
	)
	if err != nil {
		t.Fatalf("BatchDownload() close setup error = %v", err)
	}
	if err := closedStream.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if _, err := closedStream.Read(make([]byte, 8)); !errors.Is(err, ErrAborted) {
		t.Fatalf("Read() after Close() = %v, want ErrAborted", err)
	}

	// 4. Non-retryable one-time ticket GET operation NEVER replays on transport failure or 503,
	// even when WithMaxRetries(2) AND WithRequestMaxRetries(2) are configured.
	var dropAttempts atomic.Int32
	noReplayTransportClient := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey("fastgpt-key"),
		WithMaxRetries(2),
		WithHTTPClient(newTestHTTPClient(func(_ *http.Request) (*http.Response, error) {
			if dropAttempts.Add(1) == 1 {
				return nil, errors.New("unexpected EOF reading response headers")
			}
			return jsonHTTPResponse(410, map[string]any{
				"code":       501024,
				"statusText": "archiveInvalidTicket",
				"message":    "Ticket already consumed",
			}, nil), nil
		})),
	)
	_, err = noReplayTransportClient.Datasets.Collections.BatchDownload(
		t.Context(),
		DatasetsCollectionsBatchDownloadParams{Ticket: "one-time-ticket"},
		WithRequestMaxRetries(2),
	)
	if !errors.Is(err, ErrNetwork) || errors.Is(err, ErrNotFound) {
		t.Fatalf("BatchDownload() error = %v, want first ErrNetwork without 410 replay", err)
	}
	if dropAttempts.Load() != 1 {
		t.Fatalf("BatchDownload() sent %d attempts on transport error, want 1", dropAttempts.Load())
	}

	var status503Attempts atomic.Int32
	noReplay503Client := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey("fastgpt-key"),
		WithMaxRetries(2),
		WithHTTPClient(newTestHTTPClient(func(_ *http.Request) (*http.Response, error) {
			status503Attempts.Add(1)
			return jsonHTTPResponse(503, map[string]any{"message": "Temporary overload"}, map[string]string{
				"Retry-After": "0",
			}), nil
		})),
	)
	_, err = noReplay503Client.Datasets.Collections.BatchDownload(
		t.Context(),
		DatasetsCollectionsBatchDownloadParams{Ticket: "one-time-503"},
		WithRequestMaxRetries(2),
	)
	if !errors.Is(err, ErrServer) || status503Attempts.Load() != 1 {
		t.Fatalf("BatchDownload() 503 attempts=%d err=%v, want 1 & ErrServer", status503Attempts.Load(), err)
	}
}

func TestChatGeneratingConflictDataRedactedHooksAndSSE(t *testing.T) {
	// 1. HTTP 409 chatIsGenerating preserves recovery fields in APIError.ChatGeneratingConflict() / Data,
	// while hooks and slog records observe ONLY the redacted summary without Data payload leakage.
	logger, records, logMu := newRecordingLogger()
	var hookErr error

	client := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey("fastgpt-secret-api-key-12345"),
		WithLogger(logger),
		WithHooks(Hooks{
			OnError: func(_ context.Context, ctx ErrorHookContext) {
				hookErr = ctx.Error
			},
		}),
		WithHTTPClient(newTestHTTPClient(func(_ *http.Request) (*http.Response, error) {
			return jsonHTTPResponse(409, map[string]any{
				"code":       409,
				"statusText": "chatIsGenerating",
				"message":    "Chat busy with fastgpt-secret-api-key-12345",
				"data": map[string]any{
					"responseChatItemId": "ai-turn-recover-99",
					"reusePreviousAi":    true,
					"leakedHint":         "Bearer fastgpt-secret-api-key-12345",
				},
			}, map[string]string{
				"X-Request-Id": "req-conflict-409",
			}), nil
		})),
	)

	var raw RawResponse
	_, err := client.Chat.CompletionsV2(
		t.Context(),
		ChatCompletionsV2Params{
			ChatID: String("chat-conflict-1"),
		},
		WithRawResponse(&raw),
	)
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("CompletionsV2() err = %v, want ErrConflict", err)
	}
	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *APIError, got %T", err)
	}
	if apiErr.HTTPStatus != 409 || apiErr.StatusText != "chatIsGenerating" || len(apiErr.Data) == 0 {
		t.Fatalf("unexpected apiErr metadata: %+v", apiErr)
	}
	if strings.Contains(string(apiErr.Data), "fastgpt-secret-api-key-12345") {
		t.Fatalf("secret leaked in apiErr.Data: %s", string(apiErr.Data))
	}
	conflict, ok := apiErr.ChatGeneratingConflict()
	if !ok || conflict.ResponseChatItemID != "ai-turn-recover-99" || !conflict.ReusePreviousAI {
		t.Fatalf("ChatGeneratingConflict() = (%+v, %v), want (ai-turn-recover-99, true)", conflict, ok)
	}

	// Verify logs & hook view strip Data and redact secrets.
	var hookAPIErr *APIError
	if !errors.As(hookErr, &hookAPIErr) || len(hookAPIErr.Data) != 0 {
		t.Fatalf("expected hook Error to strip Data, got %+v", hookErr)
	}
	if strings.Contains(hookErr.Error(), "ai-turn-recover-99") || strings.Contains(hookErr.Error(), "fastgpt-secret-api-key-12345") {
		t.Fatalf("hookErr.Error() leaked raw data/secret: %s", hookErr.Error())
	}
	logMu.Lock()
	serializedLogs, _ := json.Marshal(*records)
	logMu.Unlock()
	if strings.Contains(string(serializedLogs), "ai-turn-recover-99") || strings.Contains(string(serializedLogs), "fastgpt-secret-api-key-12345") {
		t.Fatalf("slog leaked conflict Data or secret: %s", string(serializedLogs))
	}

	// 2. HTTP 200 JSON handshake error on streaming endpoint preserves reusePreviousAi too.
	reuseClient := NewClient(
		WithBaseURL("https://api.example.com"),
		WithAPIKey("fastgpt-key"),
		WithHTTPClient(newTestHTTPClient(func(_ *http.Request) (*http.Response, error) {
			return jsonHTTPResponse(200, map[string]any{
				"code":       409,
				"statusText": "chatIsGenerating",
				"message":    "Interactive turn generating",
				"data": map[string]any{
					"reusePreviousAi": true,
				},
			}, nil), nil
		})),
	)
	_, err = reuseClient.Chat.CompletionsV2Stream(t.Context(), ChatCompletionsV2Params{
		ChatID: String("chat-conflict-2"),
	})
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("CompletionsV2Stream() err = %v, want ErrConflict", err)
	}
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *APIError, got %T", err)
	}
	conflict, ok = apiErr.ChatGeneratingConflict()
	if !ok || !conflict.ReusePreviousAI || conflict.ResponseChatItemID != "" {
		t.Fatalf("ChatGeneratingConflict() = (%+v, %v), want ReusePreviousAI=true", conflict, ok)
	}
}

func TestBinaryDownloadNoReplayOnReusedKeepAliveConn(t *testing.T) {
	var (
		mu             sync.Mutex
		lastWarmRemote string
		wireErrs       []string
	)
	var dropHits atomic.Int32
	var okHits atomic.Int32

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/core/ai/model/list"):
			mu.Lock()
			lastWarmRemote = r.RemoteAddr
			mu.Unlock()
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"code":200,"data":{"models":[],"providers":[]}}`))
		case strings.HasSuffix(r.URL.Path, "/core/dataset/collection/batchDownload"):
			if r.Method != http.MethodGet || len(r.TransferEncoding) > 0 || r.ContentLength > 0 ||
				r.Header.Get("Transfer-Encoding") != "" || r.Header.Get("Content-Length") != "" {
				mu.Lock()
				wireErrs = append(wireErrs, "unexpected request framing on bodyless GET")
				mu.Unlock()
			}
			ticket := r.URL.Query().Get("ticket")
			if ticket == "drop-ticket" {
				mu.Lock()
				sameConn := r.RemoteAddr == lastWarmRemote
				mu.Unlock()
				if !sameConn {
					mu.Lock()
					wireErrs = append(wireErrs, "batchDownload did not reuse warmed keep-alive connection")
					mu.Unlock()
				}
				if dropHits.Add(1) == 1 {
					if hj, ok := w.(http.Hijacker); ok {
						if conn, _, err := hj.Hijack(); err == nil {
							_ = conn.Close()
							return
						}
					}
				}
				w.WriteHeader(http.StatusGone)
				return
			}
			if ticket == "ok-ticket" {
				mu.Lock()
				sameConn := r.RemoteAddr == lastWarmRemote
				mu.Unlock()
				if !sameConn {
					mu.Lock()
					wireErrs = append(wireErrs, "ok batchDownload did not reuse warmed keep-alive connection")
					mu.Unlock()
				}
				okHits.Add(1)
				w.Header().Set("Content-Type", "application/zip")
				_, _ = w.Write([]byte{0x50, 0x4b, 0x03, 0x04})
				return
			}
			http.NotFound(w, r)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	tr := &http.Transport{
		MaxIdleConns:        1,
		MaxIdleConnsPerHost: 1,
		IdleConnTimeout:     30 * time.Second,
	}
	defer tr.CloseIdleConnections()

	client := NewClient(
		WithBaseURL(srv.URL),
		WithAPIKey("fastgpt-key"),
		WithHTTPClient(&http.Client{Transport: tr}),
	)

	// 1. Warm the idle keep-alive socket, then drop the socket before response headers on BatchDownload.
	if _, err := client.Models.List(t.Context()); err != nil {
		t.Fatalf("warm Models.List() error = %v", err)
	}
	_, err := client.Datasets.Collections.BatchDownload(t.Context(), DatasetsCollectionsBatchDownloadParams{
		Ticket: "drop-ticket",
	})
	if !errors.Is(err, ErrNetwork) {
		t.Fatalf("BatchDownload(drop-ticket) err = %v, want ErrNetwork without silent replay", err)
	}
	if dropHits.Load() != 1 {
		t.Fatalf("drop-ticket server hits = %d, want 1 (net/http must not replay non-retryable ticket)", dropHits.Load())
	}

	// 2. Warm a fresh keep-alive socket and verify normal BatchDownload over reused keep-alive still succeeds with clean GET framing.
	if _, err := client.Models.List(t.Context()); err != nil {
		t.Fatalf("rewarm Models.List() error = %v", err)
	}
	stream, err := client.Datasets.Collections.BatchDownload(t.Context(), DatasetsCollectionsBatchDownloadParams{
		Ticket: "ok-ticket",
	})
	if err != nil {
		t.Fatalf("BatchDownload(ok-ticket) error = %v", err)
	}
	defer func() {
		_ = stream.Close()
	}()
	data, err := stream.Bytes()
	if err != nil || !bytes.Equal(data, []byte{0x50, 0x4b, 0x03, 0x04}) {
		t.Fatalf("BatchDownload(ok-ticket).Bytes() = (%x, %v)", data, err)
	}
	if okHits.Load() != 1 {
		t.Fatalf("ok-ticket hits = %d, want 1", okHits.Load())
	}

	mu.Lock()
	defer mu.Unlock()
	if len(wireErrs) > 0 {
		t.Fatalf("wire/keep-alive verification errors: %v", wireErrs)
	}
}

func TestBinaryDownloadEOFAfterReadFullDoesNotReportAborted(t *testing.T) {
	payload := []byte("0123456789abcdef")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/core/dataset/collection/batchDownload") {
			w.Header().Set("Content-Type", "application/octet-stream")
			w.Header().Set("Content-Length", "16")
			_, _ = w.Write(payload)
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	var onErrCount atomic.Int32
	client := NewClient(
		WithBaseURL(srv.URL),
		WithAPIKey("fastgpt-key"),
		WithHooks(Hooks{
			OnError: func(_ context.Context, _ ErrorHookContext) {
				onErrCount.Add(1)
			},
		}),
	)

	stream, err := client.Datasets.Collections.BatchDownload(t.Context(), DatasetsCollectionsBatchDownloadParams{
		Ticket: "eof-ticket",
	})
	if err != nil {
		t.Fatalf("BatchDownload() error = %v", err)
	}
	defer func() {
		_ = stream.Close()
	}()

	buf := make([]byte, len(payload))
	n, err := io.ReadFull(stream, buf)
	if err != nil || n != len(payload) || !bytes.Equal(buf, payload) {
		t.Fatalf("io.ReadFull() = (%d, %v, %q), want (%d, nil, %q)", n, err, buf, len(payload), payload)
	}

	// Drive EOF and call Read repeatedly after EOF as well as after Close().
	extra := make([]byte, 8)
	for range 2 {
		rn, rErr := stream.Read(extra)
		if rn != 0 || !errors.Is(rErr, io.EOF) {
			t.Fatalf("post-ReadFull Read() = (%d, %v), want (0, io.EOF)", rn, rErr)
		}
	}
	if err := stream.Close(); err != nil {
		t.Fatalf("Close() after EOF error = %v", err)
	}
	rn, rErr := stream.Read(extra)
	if rn != 0 || !errors.Is(rErr, io.EOF) {
		t.Fatalf("Read() after EOF + Close() = (%d, %v), want (0, io.EOF)", rn, rErr)
	}
	if onErrCount.Load() != 0 {
		t.Fatalf("OnError called %d times after clean EOF, want 0", onErrCount.Load())
	}
}
