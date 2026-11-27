package fastgpt

import (
	"context"
	"fmt"
	"log/slog"
	"maps"
	"net/http"
	"slices"
	"strings"
	"sync"
)

func isSensitiveHeaderName(name string) bool {
	switch strings.ToLower(name) {
	case "authorization", "proxy-authorization", "x-api-key", "cookie", "set-cookie":
		return true
	default:
		return false
	}
}

func isAuthSecretHeaderName(name string) bool {
	switch strings.ToLower(name) {
	case "authorization", "proxy-authorization", "x-api-key", "cookie":
		return true
	default:
		return false
	}
}

// secretScope 维护单次请求生命周期内的脱敏凭据集合，并发安全：
// 避免跨请求全局缓存淘汰导致慢请求凭据泄漏，同时确保动态轮换密钥与自定义请求头凭据在重试与钩子边界稳定脱敏。
type secretScope struct {
	mu      sync.RWMutex
	secrets map[string]struct{}
}

func newSecretScope() *secretScope {
	return &secretScope{
		secrets: make(map[string]struct{}),
	}
}

func (s *secretScope) add(rawSecret string) {
	trimmed := strings.TrimSpace(rawSecret)
	stripped := normalizeExtraSecret(trimmed)
	if len(trimmed) < 6 && len(stripped) < 6 {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if len(trimmed) >= 6 {
		s.secrets[trimmed] = struct{}{}
	}
	if len(stripped) >= 6 {
		s.secrets[stripped] = struct{}{}
	}
}

func (s *secretScope) addFromHeader(headers http.Header) {
	if len(headers) == 0 {
		return
	}
	for key, values := range headers {
		if !isAuthSecretHeaderName(key) {
			continue
		}
		for _, val := range values {
			s.add(val)
		}
	}
}

func (s *secretScope) snapshot() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if len(s.secrets) == 0 {
		return nil
	}
	return slices.Sorted(maps.Keys(s.secrets))
}

func redactHeaders(headers http.Header, extraSecrets []string) http.Header {
	if len(headers) == 0 {
		return http.Header{}
	}
	sanitized := make(http.Header, len(headers))
	for key, values := range headers {
		sensitive := isSensitiveHeaderName(key)
		copied := make([]string, len(values))
		for i, val := range values {
			redacted := redactSecrets(val, extraSecrets)
			if sensitive && redacted == val {
				copied[i] = "****"
			} else {
				copied[i] = redacted
			}
		}
		sanitized[key] = copied
	}
	return sanitized
}

func sanitizeErrorForHook(err error, extraSecrets []string) error {
	if err == nil {
		return nil
	}
	return sanitizeErrorNode(err, extraSecrets, 0)
}

// invokeSafely 隔离可观测性钩子中的意外 panic，防止遥测或日志逻辑影响业务请求返回。
func invokeSafely(
	ctx context.Context,
	logger *slog.Logger,
	hookName string,
	extraSecrets []string,
	fn func(),
) {
	if fn == nil {
		return
	}
	defer func() {
		if recovered := recover(); recovered != nil && logger != nil {
			errMsg := redactSecrets(fmt.Sprintf("%v", recovered), extraSecrets)
			logger.WarnContext(
				ctx,
				"FastGPT SDK "+hookName+" hook panicked",
				slog.String("error", errMsg),
			)
		}
	}()
	fn()
}

func notifyRequestObservability(
	ctx context.Context,
	hooks Hooks,
	logger *slog.Logger,
	hookCtx RequestHookContext,
	extraSecrets []string,
) {
	sanitized := RequestHookContext{
		OperationID: hookCtx.OperationID,
		Method:      hookCtx.Method,
		URL:         redactSecrets(hookCtx.URL, extraSecrets),
		Headers:     redactHeaders(hookCtx.Headers, extraSecrets),
		Attempt:     hookCtx.Attempt,
	}

	if logger != nil {
		logger.DebugContext(
			ctx,
			sanitized.Method+" "+sanitized.URL,
			slog.String("operationId", sanitized.OperationID),
			slog.Int("attempt", sanitized.Attempt),
			slog.Any("headers", sanitized.Headers),
		)
	}

	if hooks.OnRequest != nil {
		invokeSafely(ctx, logger, "OnRequest", extraSecrets, func() {
			hooks.OnRequest(ctx, sanitized)
		})
	}
}

func notifyResponseObservability(
	ctx context.Context,
	hooks Hooks,
	logger *slog.Logger,
	hookCtx ResponseHookContext,
	extraSecrets []string,
) {
	sanitized := ResponseHookContext{
		OperationID: hookCtx.OperationID,
		Method:      hookCtx.Method,
		URL:         redactSecrets(hookCtx.URL, extraSecrets),
		StatusCode:  hookCtx.StatusCode,
		RequestID:   hookCtx.RequestID,
		Duration:    hookCtx.Duration,
		Attempt:     hookCtx.Attempt,
	}

	if logger != nil {
		logger.DebugContext(
			ctx,
			fmt.Sprintf("%s %s -> %d (%s)", sanitized.Method, sanitized.URL, sanitized.StatusCode, sanitized.Duration),
			slog.String("operationId", sanitized.OperationID),
			slog.Int("statusCode", sanitized.StatusCode),
			slog.String("requestId", sanitized.RequestID),
			slog.Duration("duration", sanitized.Duration),
			slog.Int("attempt", sanitized.Attempt),
		)
	}

	if hooks.OnResponse != nil {
		invokeSafely(ctx, logger, "OnResponse", extraSecrets, func() {
			hooks.OnResponse(ctx, sanitized)
		})
	}
}

func notifyErrorObservability(
	ctx context.Context,
	hooks Hooks,
	logger *slog.Logger,
	hookCtx ErrorHookContext,
	extraSecrets []string,
) {
	sanitizedErr := sanitizeErrorForHook(hookCtx.Error, extraSecrets)
	sanitized := ErrorHookContext{
		OperationID: hookCtx.OperationID,
		Method:      hookCtx.Method,
		URL:         redactSecrets(hookCtx.URL, extraSecrets),
		Duration:    hookCtx.Duration,
		Attempt:     hookCtx.Attempt,
		Error:       sanitizedErr,
	}

	if logger != nil {
		errMsg := ""
		if sanitizedErr != nil {
			errMsg = sanitizedErr.Error()
		}
		logger.ErrorContext(
			ctx,
			sanitized.Method+" "+sanitized.URL+" failed",
			slog.String("operationId", sanitized.OperationID),
			slog.Duration("duration", sanitized.Duration),
			slog.Int("attempt", sanitized.Attempt),
			slog.String("error", errMsg),
		)
	}

	if hooks.OnError != nil {
		invokeSafely(ctx, logger, "OnError", extraSecrets, func() {
			hooks.OnError(ctx, sanitized)
		})
	}
}
