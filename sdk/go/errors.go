package fastgpt

import (
	"cmp"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
)

// Sentinel errors categorizing SDK and API failures for use with errors.Is.
var (
	ErrAPI        = errors.New("fastgpt: api error")
	ErrAuth       = errors.New("fastgpt: authentication error")
	ErrBadRequest = errors.New("fastgpt: bad request")
	ErrNotFound   = errors.New("fastgpt: not found")
	ErrConflict   = errors.New("fastgpt: conflict")
	ErrRateLimit  = errors.New("fastgpt: rate limit exceeded")
	ErrServer     = errors.New("fastgpt: server error")
	ErrTimeout    = errors.New("fastgpt: request timed out")
	ErrNetwork    = errors.New("fastgpt: network error")
	ErrAborted    = errors.New("fastgpt: request aborted")
)

var (
	bearerSecretRe      = regexp.MustCompile(`(?i)\b(Bearer\s+)([A-Za-z0-9._-]{8,})`)
	fastgptKeyRe        = regexp.MustCompile(`\b((?:fastgpt|openapi)-[A-Za-z0-9_-]{8,})`)
	querySecretRe       = regexp.MustCompile(`(?i)([?&](?:ticket|token|apiKey)=)([^&#\s"']+)`)
	uploadSessionPathRe = regexp.MustCompile(`(?i)(/system/file/u/)([^/?#\s"']{8,})`)
	bearerPrefixRe      = regexp.MustCompile(`(?i)^Bearer\s+`)

	authStatusTextRe     = regexp.MustCompile(`(?i)(?:^unAuth|UnAuth$|^unPermission$)`)
	notFoundStatusTextRe = regexp.MustCompile(`(?i)(?:^unExist|UnExist$|NotFound|NotExist|not_found)`)
)

const maxRedactedCauseDepth = 6

// APIError represents a structured error returned by the FastGPT API or SDK transport.
// Errors returned by the SDK always match ErrAPI via errors.Is, as well as their
// specific category sentinel (ErrAuth, ErrBadRequest, ErrNotFound, ErrConflict,
// ErrRateLimit, ErrServer, ErrTimeout, ErrNetwork, or ErrAborted).
type APIError struct {
	Kind       error
	Message    string
	HTTPStatus int
	ServerCode int
	StatusText string
	RequestID  string
	URL        string
	Cause      error
}

// Error returns a redacted, human-readable error message with response metadata.
func (e *APIError) Error() string {
	if e == nil {
		return ""
	}
	msg := cmp.Or(e.Message, e.StatusText)
	if msg == "" && e.Kind != nil {
		msg = e.Kind.Error()
	}
	msg = cmp.Or(msg, ErrAPI.Error())

	var meta []string
	if e.HTTPStatus > 0 {
		meta = append(meta, fmt.Sprintf("status=%d", e.HTTPStatus))
	}
	if e.ServerCode > 0 {
		meta = append(meta, fmt.Sprintf("code=%d", e.ServerCode))
	}
	if e.RequestID != "" {
		meta = append(meta, fmt.Sprintf("requestId=%s", e.RequestID))
	}

	var b strings.Builder
	b.WriteString(msg)
	if len(meta) > 0 {
		b.WriteString(" (")
		b.WriteString(strings.Join(meta, ", "))
		b.WriteByte(')')
	}
	if e.Cause != nil {
		causeMsg := e.Cause.Error()
		if causeMsg != "" && !strings.Contains(msg, causeMsg) {
			b.WriteString(": ")
			b.WriteString(causeMsg)
		}
	}
	return b.String()
}

// Unwrap returns the sanitized underlying cause, if any.
func (e *APIError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

// Is matches ErrAPI for every *APIError and delegates category matching to Kind.
func (e *APIError) Is(target error) bool {
	if e == nil || target == nil {
		return false
	}
	if target == ErrAPI {
		return true
	}
	return e.Kind != nil && errors.Is(e.Kind, target)
}

func maskToken(secret string) string {
	runes := []rune(secret)
	if len(runes) <= 8 {
		return "****"
	}
	return string(runes[:4]) + "****" + string(runes[len(runes)-4:])
}

func normalizeExtraSecret(raw string) string {
	trimmed := strings.TrimSpace(raw)
	stripped := bearerPrefixRe.ReplaceAllString(trimmed, "")
	return strings.TrimSpace(stripped)
}

// redactSecrets 对错误消息、URL 与日志文本中的 Bearer 密钥、fastgpt-*/openapi-*、
// 敏感查询参数、一次性上传会话路径以及请求级额外凭据执行脱敏掩码。
func redactSecrets(text string, extraSecrets []string) string {
	if text == "" {
		return ""
	}

	result := bearerSecretRe.ReplaceAllStringFunc(text, func(match string) string {
		parts := bearerSecretRe.FindStringSubmatch(match)
		if len(parts) < 3 {
			return match
		}
		return parts[1] + maskToken(parts[2])
	})
	result = fastgptKeyRe.ReplaceAllStringFunc(result, maskToken)
	result = querySecretRe.ReplaceAllString(result, "${1}****")
	result = uploadSessionPathRe.ReplaceAllString(result, "${1}****")

	if len(extraSecrets) == 0 {
		return result
	}

	// 按长度降序排列后再精确替换，避免较短子串先行脱敏导致外层凭据残留明文片段。
	candidates := make([]string, 0, len(extraSecrets)*2)
	seen := make(map[string]struct{}, len(extraSecrets)*2)
	for _, raw := range extraSecrets {
		for _, candidate := range []string{strings.TrimSpace(raw), normalizeExtraSecret(raw)} {
			// 仅替换长度足够的实际凭据，避免误伤普通短词。
			if len(candidate) >= 6 {
				if _, exists := seen[candidate]; !exists {
					seen[candidate] = struct{}{}
					candidates = append(candidates, candidate)
				}
			}
		}
	}
	slices.SortFunc(candidates, func(a, b string) int {
		if len(a) != len(b) {
			return cmp.Compare(len(b), len(a))
		}
		return strings.Compare(a, b)
	})

	for _, secret := range candidates {
		if strings.Contains(result, secret) {
			result = strings.ReplaceAll(result, secret, maskToken(secret))
		}
	}

	return result
}

type redactedError struct {
	msg   string
	inner error
	match error
}

func (e *redactedError) Error() string {
	return e.msg
}

func (e *redactedError) Unwrap() error {
	return e.inner
}

func (e *redactedError) Is(target error) bool {
	if target == nil || e.match == nil {
		return false
	}
	return errors.Is(e.match, target)
}

type redactedMultiError struct {
	msg      string
	children []error
	match    error
}

func (e *redactedMultiError) Error() string {
	return e.msg
}

func (e *redactedMultiError) Unwrap() []error {
	return e.children
}

func (e *redactedMultiError) Is(target error) bool {
	if target == nil || e.match == nil {
		return false
	}
	return errors.Is(e.match, target)
}

// sanitizeErrorNode 递归拷贝并脱敏错误链上的所有节点：
// 确保外部通过 Cause / Unwrap 访问时不会读取到原始错误字符串或附加凭据字段，同时保留 errors.Is 哨兵语义。
func sanitizeErrorNode(err error, extraSecrets []string, depth int) error {
	if err == nil {
		return nil
	}

	if apiErr, ok := err.(*APIError); ok {
		return &APIError{
			Kind:       cmp.Or[error](apiErr.Kind, ErrAPI),
			Message:    redactSecrets(apiErr.Message, extraSecrets),
			HTTPStatus: apiErr.HTTPStatus,
			ServerCode: apiErr.ServerCode,
			StatusText: redactSecrets(apiErr.StatusText, extraSecrets),
			RequestID:  apiErr.RequestID,
			URL:        redactSecrets(apiErr.URL, extraSecrets),
			Cause:      sanitizeErrorNode(apiErr.Cause, extraSecrets, depth+1),
		}
	}

	redactedMsg := redactSecrets(err.Error(), extraSecrets)
	if depth >= maxRedactedCauseDepth {
		return &redactedError{
			msg:   redactedMsg,
			match: err,
		}
	}

	if joined, ok := err.(interface{ Unwrap() []error }); ok {
		rawChildren := joined.Unwrap()
		children := make([]error, 0, len(rawChildren))
		for _, child := range rawChildren {
			if sanitized := sanitizeErrorNode(child, extraSecrets, depth+1); sanitized != nil {
				children = append(children, sanitized)
			}
		}
		return &redactedMultiError{
			msg:      redactedMsg,
			children: children,
			match:    err,
		}
	}

	if inner := errors.Unwrap(err); inner != nil {
		return &redactedError{
			msg:   redactedMsg,
			inner: sanitizeErrorNode(inner, extraSecrets, depth+1),
			match: err,
		}
	}

	return &redactedError{
		msg:   redactedMsg,
		match: err,
	}
}

func newAPIError(
	kind error,
	message string,
	httpStatus int,
	serverCode int,
	statusText string,
	requestID string,
	reqURL string,
	cause error,
	extraSecrets []string,
) *APIError {
	return &APIError{
		Kind:       cmp.Or[error](kind, ErrAPI),
		Message:    redactSecrets(message, extraSecrets),
		HTTPStatus: httpStatus,
		ServerCode: serverCode,
		StatusText: redactSecrets(statusText, extraSecrets),
		RequestID:  requestID,
		URL:        redactSecrets(reqURL, extraSecrets),
		Cause:      sanitizeErrorNode(cause, extraSecrets, 0),
	}
}

func classifyAPIErrorKind(httpStatus int, serverCode int, statusText string) error {
	// 1. 优先尊重明确的 HTTP 状态码（跳过旧版 HTTP 200 / 500 业务错误包装与无状态 SSE 错误帧），
	// 避免历史 statusText 覆盖 429 / 503 等真实传输层语义。
	if httpStatus != 0 && httpStatus != 200 && httpStatus != 500 {
		switch {
		case httpStatus == 401 || httpStatus == 403:
			return ErrAuth
		case httpStatus == 409:
			return ErrConflict
		case httpStatus == 429:
			return ErrRateLimit
		case httpStatus == 404 || httpStatus == 410:
			return ErrNotFound
		case httpStatus >= 400 && httpStatus < 500:
			return ErrBadRequest
		case httpStatus >= 500:
			return ErrServer
		}
	}

	// 2. 兼容旧版 FastGPT 以 HTTP 200 / 500 包装的业务码、statusText 以及无 HTTP 状态的 SSE 错误帧。
	if serverCode == 401 || serverCode == 403 || serverCode == 514 ||
		(statusText != "" && authStatusTextRe.MatchString(statusText)) {
		return ErrAuth
	}

	if serverCode == 409 || statusText == "chatIsGenerating" {
		return ErrConflict
	}

	if serverCode == 429 || statusText == "tooManyRequest" || statusText == "uploadFileIntervalLimit" {
		return ErrRateLimit
	}

	if serverCode == 404 || serverCode == 410 ||
		(statusText != "" && notFoundStatusTextRe.MatchString(statusText)) {
		return ErrNotFound
	}

	if serverCode >= 400 && serverCode < 500 {
		return ErrBadRequest
	}

	return ErrServer
}

func newMappedAPIError(
	message string,
	httpStatus int,
	serverCode int,
	statusText string,
	requestID string,
	reqURL string,
	cause error,
	extraSecrets []string,
) error {
	kind := classifyAPIErrorKind(httpStatus, serverCode, statusText)
	return newAPIError(kind, message, httpStatus, serverCode, statusText, requestID, reqURL, cause, extraSecrets)
}

func newNetworkError(message string, reqURL string, cause error, extraSecrets []string) error {
	msg := cmp.Or(message, "Network request failed")
	return newAPIError(ErrNetwork, msg, 0, 0, "", "", reqURL, cause, extraSecrets)
}

func newAbortedError(
	message string,
	requestID string,
	reqURL string,
	cause error,
	extraSecrets []string,
) error {
	msg := cmp.Or(message, "Request was aborted")
	return newAPIError(ErrAborted, msg, 0, 0, "", requestID, reqURL, cause, extraSecrets)
}

func newTimeoutError(message string, reqURL string, cause error, extraSecrets []string) error {
	msg := cmp.Or(message, "Request timed out")
	return newAPIError(ErrTimeout, msg, 0, 0, "", "", reqURL, cause, extraSecrets)
}

func newAuthError(message string, reqURL string, cause error, extraSecrets []string) error {
	return newAPIError(ErrAuth, message, 0, 0, "", "", reqURL, cause, extraSecrets)
}

func newBadRequestError(message string, reqURL string, cause error, extraSecrets []string) error {
	return newAPIError(ErrBadRequest, message, 0, 0, "", "", reqURL, cause, extraSecrets)
}
