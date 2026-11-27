package fastgpt

import (
	"cmp"
	"context"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	defaultBaseURL       = "https://cloud.fastgpt.cn"
	defaultTimeout       = 60 * time.Second
	defaultGETMaxRetries = 2
	maxRetryAfterDelay   = 30 * time.Second
	maxBackoffDelay      = 5 * time.Second
)

type clientConfig struct {
	baseURL        string
	apiKey         string
	apiKeySet      bool
	apiKeyProvider func(context.Context) (string, error)
	defaultAppID   string
	identity       *Identity
	timeout        time.Duration
	timeoutSet     bool
	maxRetries     *int
	defaultHeaders http.Header
	httpClient     *http.Client
	hooks          Hooks
	logger         *slog.Logger
}

// ClientOption configures a FastGPT Client instance.
type ClientOption func(*clientConfig)

// WithBaseURL sets the FastGPT API server base URL (with or without a trailing /api).
func WithBaseURL(baseURL string) ClientOption {
	return func(cfg *clientConfig) {
		cfg.baseURL = baseURL
	}
}

// WithAPIKey sets a static API Key used to authenticate requests.
func WithAPIKey(apiKey string) ClientOption {
	return func(cfg *clientConfig) {
		cfg.apiKey = apiKey
		cfg.apiKeySet = true
		cfg.apiKeyProvider = nil
	}
}

// WithAPIKeyProvider sets a callback invoked per request to dynamically resolve an API Key.
func WithAPIKeyProvider(provider func(context.Context) (string, error)) ClientOption {
	return func(cfg *clientConfig) {
		cfg.apiKeyProvider = provider
		cfg.apiKey = ""
		cfg.apiKeySet = provider != nil
	}
}

// WithDefaultAppID sets the default application ID injected into app-scoped operations.
func WithDefaultAppID(appID string) ClientOption {
	return func(cfg *clientConfig) {
		cfg.defaultAppID = appID
	}
}

// WithIdentity sets the default caller identity (CustomUID or AuthProxy) attached to requests.
func WithIdentity(identity Identity) ClientOption {
	return func(cfg *clientConfig) {
		cfg.identity = cloneIdentity(&identity)
	}
}

// WithTimeout sets the default per-attempt timeout (or handshake timeout for SSE streams).
// A non-positive duration disables the SDK-level timeout.
func WithTimeout(timeout time.Duration) ClientOption {
	return func(cfg *clientConfig) {
		cfg.timeout = timeout
		cfg.timeoutSet = true
	}
}

// WithMaxRetries sets the default maximum retry count for idempotent GET requests.
func WithMaxRetries(maxRetries int) ClientOption {
	return func(cfg *clientConfig) {
		n := max(0, maxRetries)
		cfg.maxRetries = &n
	}
}

// WithDefaultHeader sets a default HTTP header included on every outbound request.
func WithDefaultHeader(key, value string) ClientOption {
	return func(cfg *clientConfig) {
		if key == "" {
			return
		}
		if cfg.defaultHeaders == nil {
			cfg.defaultHeaders = make(http.Header)
		}
		cfg.defaultHeaders.Set(key, value)
	}
}

// WithHTTPClient sets a custom *http.Client for outbound transport.
func WithHTTPClient(client *http.Client) ClientOption {
	return func(cfg *clientConfig) {
		cfg.httpClient = client
	}
}

// WithHooks attaches observability callbacks around outbound HTTP requests and errors.
func WithHooks(hooks Hooks) ClientOption {
	return func(cfg *clientConfig) {
		cfg.hooks = hooks
	}
}

// WithLogger attaches a structured logger receiving secret-redacted request/response/error logs.
func WithLogger(logger *slog.Logger) ClientOption {
	return func(cfg *clientConfig) {
		cfg.logger = logger
	}
}

// WithRequestHeader sets an HTTP header for a single request, overriding client defaults.
func WithRequestHeader(key, value string) RequestOption {
	return func(cfg *requestConfig) {
		if key == "" {
			return
		}
		if cfg.headers == nil {
			cfg.headers = make(http.Header)
		}
		cfg.headers.Set(key, value)
	}
}

// WithRequestTimeout overrides the request timeout (or SSE handshake timeout) for a single call.
func WithRequestTimeout(timeout time.Duration) RequestOption {
	return func(cfg *requestConfig) {
		d := timeout
		cfg.timeout = &d
	}
}

// WithRequestMaxRetries overrides the maximum retry count for a single call.
func WithRequestMaxRetries(maxRetries int) RequestOption {
	return func(cfg *requestConfig) {
		n := max(0, maxRetries)
		cfg.maxRetries = &n
	}
}

// WithRequestAPIKey overrides the API Key for a single request.
func WithRequestAPIKey(apiKey string) RequestOption {
	return func(cfg *requestConfig) {
		cfg.apiKey = apiKey
	}
}

// WithRequestAppID overrides the appId injected into a single app-scoped request.
func WithRequestAppID(appID string) RequestOption {
	return func(cfg *requestConfig) {
		cfg.appID = appID
	}
}

// WithRequestIdentity overrides the caller identity for a single request.
func WithRequestIdentity(identity Identity) RequestOption {
	return func(cfg *requestConfig) {
		cfg.customUID = identity.CustomUID
		cfg.authProxy = cloneAuthProxy(identity.AuthProxy)
	}
}

// WithRawResponse populates dst with HTTP status, headers, request ID, and URL metadata.
func WithRawResponse(dst *RawResponse) RequestOption {
	return func(cfg *requestConfig) {
		cfg.rawResponse = dst
	}
}

// normalizeAPIBaseURL 将传入的 baseURL 归一化为以 /api 结尾的标准根地址，
// 依次回退 FASTGPT_BASE_URL 环境变量与官方云端地址，兼容带或不带 /api 后缀的写法。
func normalizeAPIBaseURL(rawBaseURL string) string {
	candidate := strings.TrimSpace(rawBaseURL)
	if candidate == "" {
		candidate = strings.TrimSpace(os.Getenv("FASTGPT_BASE_URL"))
	}
	candidate = cmp.Or(candidate, defaultBaseURL)
	trimmed := strings.TrimRight(candidate, "/")
	if strings.HasSuffix(trimmed, "/api") {
		return trimmed
	}
	return trimmed + "/api"
}

func cloneAuthProxy(ap *AuthProxy) *AuthProxy {
	if ap == nil {
		return nil
	}
	cp := *ap
	return &cp
}

func cloneIdentity(id *Identity) *Identity {
	if id == nil {
		return nil
	}
	return &Identity{
		CustomUID: id.CustomUID,
		AuthProxy: cloneAuthProxy(id.AuthProxy),
	}
}

func cloneClientConfig(cfg clientConfig) clientConfig {
	cloned := cfg
	if cfg.defaultHeaders != nil {
		cloned.defaultHeaders = cfg.defaultHeaders.Clone()
	} else {
		cloned.defaultHeaders = make(http.Header)
	}
	cloned.identity = cloneIdentity(cfg.identity)
	if cfg.maxRetries != nil {
		n := *cfg.maxRetries
		cloned.maxRetries = &n
	}
	return cloned
}
