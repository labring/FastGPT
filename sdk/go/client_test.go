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

	zipBytes, err := client.Datasets.Collections.BatchDownload(t.Context(), DatasetsCollectionsBatchDownloadParams{
		Ticket: "t-zip",
	})
	if err != nil || !bytes.Equal(zipBytes, []byte{0x50, 0x4b, 0x03, 0x04}) {
		t.Fatalf("BatchDownload() = (%x, %v)", zipBytes, err)
	}

	if err := client.Chat.Histories.MarkRead(t.Context(), ChatHistoriesMarkReadParams{ChatID: "c-1"}); err != nil {
		t.Fatalf("MarkRead() error = %v", err)
	}
}
