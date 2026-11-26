package fastgpt

import (
	"bytes"
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"maps"
	"math/rand/v2"
	"net/http"
	"net/url"
	"os"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

const publicModelListPath = "/core/ai/model/list"

var (
	fileUploadType      = reflect.TypeFor[FileUpload]()
	fileUploadSliceType = reflect.TypeFor[[]FileUpload]()
	fileUploadPtrType   = reflect.TypeFor[*FileUpload]()
	fileUploadPtrSlice  = reflect.TypeFor[[]*FileUpload]()
	binaryInputType     = reflect.TypeFor[BinaryInput]()
	binaryInputPtrType  = reflect.TypeFor[*BinaryInput]()
	isZeroInterfaceType = reflect.TypeFor[interface{ IsZero() bool }]()
)

type preparedRequest struct {
	url          string
	headers      http.Header
	bodyBytes    []byte
	bodyReader   io.Reader
	hasBody      bool
	isStreamBody bool
}

type attemptResult struct {
	resp           *http.Response
	raw            RawResponse
	attempt        int
	timeout        time.Duration
	handshakeDone  *atomic.Bool
	handshakeTimed *atomic.Bool
	handshakeTimer *time.Timer
	cancelReq      context.CancelCauseFunc
	reqCtx         context.Context
}

type cancelOnCloseReadCloser struct {
	io.ReadCloser
	cancel func()
}

func (c *cancelOnCloseReadCloser) Close() error {
	err := c.ReadCloser.Close()
	if c.cancel != nil {
		c.cancel()
	}
	return err
}

func applyRequestOptions(opts ...RequestOption) requestConfig {
	var cfg requestConfig
	for _, opt := range opts {
		if opt != nil {
			opt(&cfg)
		}
	}
	return cfg
}

func normalizeRoutePath(specPath string) string {
	if trimmed, ok := strings.CutPrefix(specPath, "/api/"); ok {
		return "/" + trimmed
	}
	if strings.HasPrefix(specPath, "/") {
		return specPath
	}
	return "/" + specPath
}

func extractRequestID(header http.Header) string {
	if header == nil {
		return ""
	}
	return cmp.Or(header.Get("X-Request-Id"), header.Get("X-Fastgpt-Request-Id"))
}

func validateIdentityValues(customUID string, authProxy *AuthProxy, source string) error {
	if customUID != "" && authProxy != nil {
		return newBadRequestError(
			fmt.Sprintf(`%s "customUid" and "authProxy" are mutually exclusive and cannot be set together`, source),
			"",
			nil,
			nil,
		)
	}
	return nil
}

func decodeJSONToAnyMap(raw []byte) (map[string]any, error) {
	if len(bytes.TrimSpace(raw)) == 0 {
		return map[string]any{}, nil
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var m map[string]any
	if err := dec.Decode(&m); err != nil {
		return nil, err
	}
	if m == nil {
		m = map[string]any{}
	}
	return m, nil
}

func decodeJSONToAny(raw []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, err
	}
	return v, nil
}

func isBinaryOrFileType(t reflect.Type) bool {
	return t == fileUploadType ||
		t == fileUploadPtrType ||
		t == fileUploadSliceType ||
		t == fileUploadPtrSlice ||
		t == binaryInputType ||
		t == binaryInputPtrType
}

func structHasSpecialPayloadField(t reflect.Type) bool {
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t.Kind() != reflect.Struct {
		return false
	}
	for i := range t.NumField() {
		f := t.Field(i)
		if !f.IsExported() {
			continue
		}
		if isBinaryOrFileType(f.Type) {
			return true
		}
		if f.Anonymous {
			ft := f.Type
			for ft.Kind() == reflect.Pointer {
				ft = ft.Elem()
			}
			if ft.Kind() == reflect.Struct && structHasSpecialPayloadField(ft) {
				return true
			}
		}
	}
	return false
}

func parseJSONTag(f reflect.StructField) (wireName string, explicitName bool, skip bool, omitEmpty bool, omitZero bool) {
	tag := f.Tag.Get("json")
	if tag == "-" {
		return "", false, true, false, false
	}
	name, rest, _ := strings.Cut(tag, ",")
	if name != "" {
		explicitName = true
	} else {
		name = f.Name
	}
	if rest != "" {
		for opt := range strings.SplitSeq(rest, ",") {
			switch opt {
			case "omitempty":
				omitEmpty = true
			case "omitzero":
				omitZero = true
			}
		}
	}
	return name, explicitName, false, omitEmpty, omitZero
}

func isEmptyReflectValue(v reflect.Value) bool {
	switch v.Kind() {
	case reflect.Array, reflect.Map, reflect.Slice, reflect.String:
		return v.Len() == 0
	case reflect.Bool:
		return !v.Bool()
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return v.Int() == 0
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64, reflect.Uintptr:
		return v.Uint() == 0
	case reflect.Float32, reflect.Float64:
		return v.Float() == 0
	case reflect.Interface, reflect.Pointer:
		return v.IsNil()
	}
	return false
}

func shouldOmitReflectField(v reflect.Value, omitEmpty bool, omitZero bool) bool {
	if omitZero {
		if v.Type().Implements(isZeroInterfaceType) {
			if z, ok := v.Interface().(interface{ IsZero() bool }); ok {
				return z.IsZero()
			}
		}
		if v.IsZero() {
			return true
		}
	}
	if omitEmpty && isEmptyReflectValue(v) {
		return true
	}
	return false
}

func collectSpecialValue(
	wireName string,
	fv reflect.Value,
	files map[string][]FileUpload,
	binaries map[string]BinaryInput,
) bool {
	switch fv.Type() {
	case fileUploadType:
		upload := fv.Interface().(FileUpload)
		if upload.Bytes != nil || upload.Reader != nil || upload.Filename != "" {
			files[wireName] = append(files[wireName], upload)
		}
		return true
	case fileUploadPtrType:
		if !fv.IsNil() {
			upload := fv.Elem().Interface().(FileUpload)
			files[wireName] = append(files[wireName], upload)
		}
		return true
	case fileUploadSliceType:
		if !fv.IsNil() {
			uploads := fv.Interface().([]FileUpload)
			if len(uploads) > 0 {
				files[wireName] = append(files[wireName], uploads...)
			}
		}
		return true
	case fileUploadPtrSlice:
		if !fv.IsNil() {
			uploads := fv.Interface().([]*FileUpload)
			for _, u := range uploads {
				if u != nil {
					files[wireName] = append(files[wireName], *u)
				}
			}
		}
		return true
	case binaryInputType:
		bin := fv.Interface().(BinaryInput)
		if bin.Bytes != nil || bin.Reader != nil {
			binaries[wireName] = bin
		}
		return true
	case binaryInputPtrType:
		if !fv.IsNil() {
			binaries[wireName] = fv.Elem().Interface().(BinaryInput)
		}
		return true
	default:
		return false
	}
}

func lowerFirstASCII(s string) string {
	if s == "" {
		return ""
	}
	if s[0] >= 'A' && s[0] <= 'Z' {
		return string(s[0]+'a'-'A') + s[1:]
	}
	return s
}

func extractStructWithSpecialFields(
	rv reflect.Value,
	fields map[string]any,
	files map[string][]FileUpload,
	binaries map[string]BinaryInput,
) error {
	for rv.Kind() == reflect.Pointer || rv.Kind() == reflect.Interface {
		if rv.IsNil() {
			return nil
		}
		rv = rv.Elem()
	}
	if rv.Kind() != reflect.Struct {
		return newBadRequestError("Request payload must be a struct or map", "", nil, nil)
	}

	rt := rv.Type()
	for i := range rt.NumField() {
		sf := rt.Field(i)
		if !sf.IsExported() {
			continue
		}
		fv := rv.Field(i)
		wireName, explicitName, skip, omitEmpty, omitZero := parseJSONTag(sf)

		if isBinaryOrFileType(sf.Type) {
			targetName := wireName
			if skip || !explicitName {
				targetName = cmp.Or(targetName, lowerFirstASCII(sf.Name))
				if skip {
					targetName = lowerFirstASCII(sf.Name)
				}
			}
			collectSpecialValue(targetName, fv, files, binaries)
			continue
		}

		if sf.Anonymous && !skip && !explicitName {
			ft := sf.Type
			for ft.Kind() == reflect.Pointer {
				ft = ft.Elem()
			}
			if ft.Kind() == reflect.Struct {
				if err := extractStructWithSpecialFields(fv, fields, files, binaries); err != nil {
					return err
				}
				continue
			}
		}

		if skip || shouldOmitReflectField(fv, omitEmpty, omitZero) {
			continue
		}

		raw, err := json.Marshal(fv.Interface())
		if err != nil {
			return newBadRequestError(
				fmt.Sprintf("Failed to serialize request field %q", wireName),
				"",
				err,
				nil,
			)
		}
		val, err := decodeJSONToAny(raw)
		if err != nil {
			return newBadRequestError(
				fmt.Sprintf("Failed to decode serialized field %q", wireName),
				"",
				err,
				nil,
			)
		}
		fields[wireName] = val
	}
	return nil
}

// extractRequestPayload 将 Go 请求结构体/联合变体/Map 统一解析为可路由的字段表与文件/二进制附件，
// 保持 Opt[T] 三态、json:",omitzero" 与数字精度（json.Number）不变，同时避免 FileUpload.Reader 触发 JSON 编码错误。
func extractRequestPayload(req any) (
	fields map[string]any,
	files map[string][]FileUpload,
	binaries map[string]BinaryInput,
	err error,
) {
	fields = make(map[string]any)
	files = make(map[string][]FileUpload)
	binaries = make(map[string]BinaryInput)

	if req == nil {
		return fields, files, binaries, nil
	}

	switch v := req.(type) {
	case map[string]any:
		for k, item := range v {
			if item == nil {
				fields[k] = nil
				continue
			}
			iv := reflect.ValueOf(item)
			if isBinaryOrFileType(iv.Type()) && collectSpecialValue(k, iv, files, binaries) {
				continue
			}
			raw, err := json.Marshal(item)
			if err != nil {
				return nil, nil, nil, newBadRequestError(
					fmt.Sprintf("Failed to serialize request field %q", k),
					"",
					err,
					nil,
				)
			}
			decoded, err := decodeJSONToAny(raw)
			if err != nil {
				return nil, nil, nil, newBadRequestError(
					fmt.Sprintf("Failed to decode request field %q", k),
					"",
					err,
					nil,
				)
			}
			fields[k] = decoded
		}
		return fields, files, binaries, nil
	case BinaryInput:
		binaries["file"] = v
		return fields, files, binaries, nil
	case *BinaryInput:
		if v != nil {
			binaries["file"] = *v
		}
		return fields, files, binaries, nil
	}

	rv := reflect.ValueOf(req)
	for rv.Kind() == reflect.Pointer || rv.Kind() == reflect.Interface {
		if rv.IsNil() {
			return fields, files, binaries, nil
		}
		rv = rv.Elem()
	}

	if rv.Kind() != reflect.Struct {
		return nil, nil, nil, newBadRequestError("Request payload must be a struct or map", "", nil, nil)
	}

	if structHasSpecialPayloadField(rv.Type()) {
		if err := extractStructWithSpecialFields(rv, fields, files, binaries); err != nil {
			return nil, nil, nil, err
		}
		return fields, files, binaries, nil
	}

	raw, err := json.Marshal(req)
	if err != nil {
		return nil, nil, nil, newBadRequestError("Failed to serialize request payload", "", err, nil)
	}
	fields, err = decodeJSONToAnyMap(raw)
	if err != nil {
		return nil, nil, nil, newBadRequestError("Failed to parse serialized request payload", "", err, nil)
	}
	return fields, files, binaries, nil
}

func appendQueryParams(u *url.URL, query map[string]any) error {
	if len(query) == 0 {
		return nil
	}
	q := u.Query()
	for _, key := range slices.Sorted(maps.Keys(query)) {
		val := query[key]
		if val == nil {
			continue
		}

		rv := reflect.ValueOf(val)
		switch rv.Kind() {
		case reflect.Slice, reflect.Array:
			for i := range rv.Len() {
				elem := rv.Index(i).Interface()
				if elem == nil {
					continue
				}
				if isScalarValue(elem) {
					q.Add(key, formatScalarValue(elem))
				} else {
					b, err := json.Marshal(elem)
					if err != nil {
						return newBadRequestError(
							fmt.Sprintf("Failed to encode query parameter %q", key),
							"",
							err,
							nil,
						)
					}
					q.Add(key, string(b))
				}
			}
		case reflect.Map, reflect.Struct, reflect.Pointer:
			b, err := json.Marshal(val)
			if err != nil {
				return newBadRequestError(
					fmt.Sprintf("Failed to encode query parameter %q", key),
					"",
					err,
					nil,
				)
			}
			q.Set(key, string(b))
		default:
			q.Set(key, formatScalarValue(val))
		}
	}
	u.RawQuery = q.Encode()
	return nil
}

func (c *Client) resolveEffectiveIdentity(
	fields map[string]any,
	reqCfg requestConfig,
) (*Identity, error) {
	if err := validateIdentityValues(reqCfg.customUID, reqCfg.authProxy, "RequestOption"); err != nil {
		return nil, err
	}

	rawUID, hasRawUID := fields["customUid"]
	rawAuthProxy, hasRawAP := fields["authProxy"]
	if hasRawUID && rawUID != nil && hasRawAP && rawAuthProxy != nil {
		return nil, newBadRequestError(
			`Request payload "customUid" and "authProxy" are mutually exclusive and cannot be set together`,
			"",
			nil,
			nil,
		)
	}

	if reqCfg.customUID != "" {
		return &Identity{CustomUID: reqCfg.customUID}, nil
	}
	if reqCfg.authProxy != nil {
		return &Identity{AuthProxy: cloneAuthProxy(reqCfg.authProxy)}, nil
	}

	if (hasRawUID && rawUID != nil) || (hasRawAP && rawAuthProxy != nil) {
		// 当调用方直接传入字符串形式的 authProxy（例如 query JSON 字符串）时，
		// 保留原始入参并禁止叠加客户端级默认身份。
		if _, isStr := rawAuthProxy.(string); isStr {
			return nil, nil
		}
		var resolved Identity
		if uidStr, ok := rawUID.(string); ok {
			resolved.CustomUID = uidStr
		}
		if apMap, ok := rawAuthProxy.(map[string]any); ok {
			ap := &AuthProxy{}
			if tmb, ok := apMap["tmbId"].(string); ok {
				ap.TmbID = tmb
			}
			if user, ok := apMap["username"].(string); ok {
				ap.Username = user
			}
			resolved.AuthProxy = ap
		}
		return &resolved, nil
	}

	return c.cfg.identity, nil
}

func (c *Client) injectContextIntoTarget(
	target map[string]any,
	spec operationSpec,
	carrier paramCarrier,
	reqCfg requestConfig,
	effectiveIdentity *Identity,
) {
	if spec.AppIDCarrier == carrier {
		if reqCfg.appID != "" {
			target["appId"] = reqCfg.appID
		} else if _, exists := target["appId"]; !exists && c.cfg.defaultAppID != "" {
			target["appId"] = c.cfg.defaultAppID
		}
	}

	if spec.IdentityCarrier == carrier && effectiveIdentity != nil {
		if effectiveIdentity.CustomUID != "" {
			target["customUid"] = effectiveIdentity.CustomUID
			delete(target, "authProxy")
		} else if effectiveIdentity.AuthProxy != nil {
			target["authProxy"] = effectiveIdentity.AuthProxy
			delete(target, "customUid")
		}
	}
}

func (c *Client) prepareRequest(
	spec operationSpec,
	req any,
	fixedFields map[string]any,
	reqCfg requestConfig,
	acceptHeader string,
) (preparedRequest, error) {
	if c.configErr != nil {
		return preparedRequest{}, c.configErr
	}

	fields, files, binaries, err := extractRequestPayload(req)
	if err != nil {
		return preparedRequest{}, err
	}

	effectiveIdentity, err := c.resolveEffectiveIdentity(fields, reqCfg)
	if err != nil {
		return preparedRequest{}, err
	}

	routePath := normalizeRoutePath(spec.Path)
	consumedKeys := make(map[string]bool, len(spec.PathParams)+len(spec.QueryParams))

	for _, pathParam := range spec.PathParams {
		rawVal, ok := fields[pathParam]
		if !ok || rawVal == nil || formatScalarValue(rawVal) == "" {
			return preparedRequest{}, newBadRequestError(
				fmt.Sprintf("Missing required path parameter %q for %s %s", pathParam, spec.Method, spec.Path),
				"",
				nil,
				nil,
			)
		}
		routePath = strings.ReplaceAll(routePath, "{"+pathParam+"}", url.PathEscape(formatScalarValue(rawVal)))
		consumedKeys[pathParam] = true
	}

	queryMap := make(map[string]any, len(spec.QueryParams)+2)
	for _, qKey := range spec.QueryParams {
		if val, ok := fields[qKey]; ok {
			queryMap[qKey] = val
		}
		consumedKeys[qKey] = true
	}
	c.injectContextIntoTarget(queryMap, spec, carrierQuery, reqCfg, effectiveIdentity)

	parsedURL, err := url.Parse(c.baseURL + routePath)
	if err != nil {
		return preparedRequest{}, newBadRequestError("Invalid request URL", c.baseURL+routePath, err, nil)
	}
	if err := appendQueryParams(parsedURL, queryMap); err != nil {
		return preparedRequest{}, err
	}

	headers := make(http.Header)
	headers.Set("Accept", acceptHeader)
	headers.Set("X-FastGPT-Client", ClientHeaderValue)
	for key, values := range c.cfg.defaultHeaders {
		for i, val := range values {
			if i == 0 {
				headers.Set(key, val)
			} else {
				headers.Add(key, val)
			}
		}
	}
	for key, values := range reqCfg.headers {
		for i, val := range values {
			if i == 0 {
				headers.Set(key, val)
			} else {
				headers.Add(key, val)
			}
		}
	}

	fullURL := parsedURL.String()

	if spec.RequestContentType == contentNone {
		return preparedRequest{
			url:     fullURL,
			headers: headers,
		}, nil
	}

	if spec.RequestContentType == contentBinary {
		binField := cmp.Or(spec.BinaryBodyField, "file")
		bin, ok := binaries[binField]
		if !ok || (bin.Bytes == nil && bin.Reader == nil) {
			return preparedRequest{}, newBadRequestError(
				fmt.Sprintf("Missing required binary field %q for %s %s", binField, spec.Method, spec.Path),
				fullURL,
				nil,
				nil,
			)
		}
		if headers.Get("Content-Type") == "" {
			headers.Set("Content-Type", cmp.Or(bin.ContentType, "application/octet-stream"))
		}
		if bin.Bytes != nil && bin.Reader == nil {
			return preparedRequest{
				url:       fullURL,
				headers:   headers,
				bodyBytes: bin.Bytes,
				hasBody:   true,
			}, nil
		}
		return preparedRequest{
			url:          fullURL,
			headers:      headers,
			bodyReader:   bin.Reader,
			hasBody:      true,
			isStreamBody: true,
		}, nil
	}

	remaining := make(map[string]any, len(fields)+len(fixedFields))
	for k, v := range fields {
		if !consumedKeys[k] {
			remaining[k] = v
		}
	}
	for k, v := range fixedFields {
		remaining[k] = v
	}

	if spec.RequestContentType == contentMultipart {
		mpMode := spec.MultipartMode
		if mpMode == "" {
			mpMode = multipartFlatFields
		}
		if mpMode == multipartFileAndJSONData {
			c.injectContextIntoTarget(remaining, spec, carrierBody, reqCfg, effectiveIdentity)
		}
		mpBytes, contentType, err := encodeMultipartBody(mpMode, remaining, files)
		if err != nil {
			return preparedRequest{}, err
		}
		headers.Set("Content-Type", contentType)
		return preparedRequest{
			url:       fullURL,
			headers:   headers,
			bodyBytes: mpBytes,
			hasBody:   true,
		}, nil
	}

	c.injectContextIntoTarget(remaining, spec, carrierBody, reqCfg, effectiveIdentity)
	jsonBytes, err := json.Marshal(remaining)
	if err != nil {
		return preparedRequest{}, newBadRequestError("Failed to marshal JSON request body", fullURL, err, nil)
	}
	if headers.Get("Content-Type") == "" {
		headers.Set("Content-Type", "application/json")
	}
	return preparedRequest{
		url:       fullURL,
		headers:   headers,
		bodyBytes: jsonBytes,
		hasBody:   true,
	}, nil
}

func (c *Client) newInitialSecretScope(reqCfg requestConfig) *secretScope {
	scope := newSecretScope()
	if c.cfg.apiKeySet {
		scope.add(c.cfg.apiKey)
	}
	if reqCfg.apiKey != "" {
		scope.add(reqCfg.apiKey)
	}
	scope.addFromHeader(c.cfg.defaultHeaders)
	scope.addFromHeader(reqCfg.headers)
	return scope
}

func (c *Client) resolveAPIKey(ctx context.Context, reqCfg requestConfig) (string, error) {
	if reqCfg.apiKey != "" {
		return reqCfg.apiKey, nil
	}
	if c.cfg.apiKeyProvider != nil {
		return c.cfg.apiKeyProvider(ctx)
	}
	if c.cfg.apiKeySet {
		return c.cfg.apiKey, nil
	}
	return strings.TrimSpace(os.Getenv("FASTGPT_API_KEY")), nil
}

func (c *Client) resolveTimeout(reqCfg requestConfig) time.Duration {
	if reqCfg.timeout != nil {
		return *reqCfg.timeout
	}
	if c.cfg.timeoutSet {
		return c.cfg.timeout
	}
	return defaultTimeout
}

func (c *Client) resolveMaxRetries(spec operationSpec, reqCfg requestConfig, isStreamBody bool, disableDefaultRetry bool) int {
	if isStreamBody || spec.RetryPolicy == retryPolicyDisabled {
		return 0
	}
	if reqCfg.maxRetries != nil {
		return max(0, *reqCfg.maxRetries)
	}
	if disableDefaultRetry {
		return 0
	}
	retryableByDefault := spec.RetryPolicy == retryPolicyEnabled || (spec.RetryPolicy == retryPolicyDefault && spec.Method == http.MethodGet)
	if retryableByDefault {
		if c.cfg.maxRetries != nil {
			return max(0, *c.cfg.maxRetries)
		}
		return defaultGETMaxRetries
	}
	return 0
}

func isRetryableHTTPStatus(statusCode int) bool {
	switch statusCode {
	case http.StatusRequestTimeout,
		http.StatusTooManyRequests,
		http.StatusBadGateway,
		http.StatusServiceUnavailable,
		http.StatusGatewayTimeout:
		return true
	default:
		return false
	}
}

func parseRetryAfterDelay(headerVal string) (time.Duration, bool) {
	trimmed := strings.TrimSpace(headerVal)
	if trimmed == "" {
		return 0, false
	}
	if seconds, err := strconv.ParseFloat(trimmed, 64); err == nil && seconds >= 0 {
		d := min(time.Duration(seconds*float64(time.Second)), maxRetryAfterDelay)
		return d, true
	}
	if t, err := http.ParseTime(trimmed); err == nil {
		d := min(max(0, time.Until(t)), maxRetryAfterDelay)
		return d, true
	}
	return 0, false
}

func computeBackoffDelay(attempt int, retryAfterHeader string) time.Duration {
	if d, ok := parseRetryAfterDelay(retryAfterHeader); ok {
		return d
	}
	shift := min(max(0, attempt), 10)
	base := 300 * time.Millisecond * time.Duration(1<<shift)
	jitter := time.Duration(rand.IntN(100)) * time.Millisecond
	return min(base+jitter, maxBackoffDelay)
}

func sleepWithContext(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return ctx.Err()
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func formatBearerHeader(apiKey string) string {
	if strings.HasPrefix(apiKey, "Bearer ") {
		return apiKey
	}
	return "Bearer " + apiKey
}

func (c *Client) classifyContextOrTransportError(
	ctx context.Context,
	spec operationSpec,
	reqURL string,
	timeout time.Duration,
	timedOut bool,
	err error,
	extraSecrets []string,
) error {
	if timedOut {
		return newTimeoutError(
			fmt.Sprintf("Request to %s %s timed out after %s", spec.Method, spec.Path, timeout),
			reqURL,
			err,
			extraSecrets,
		)
	}
	if ctx.Err() != nil {
		cause := cmp.Or(context.Cause(ctx), err)
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return newTimeoutError(
				fmt.Sprintf("Request to %s %s timed out", spec.Method, spec.Path),
				reqURL,
				cause,
				extraSecrets,
			)
		}
		return newAbortedError(
			fmt.Sprintf("Request to %s %s was aborted", spec.Method, spec.Path),
			"",
			reqURL,
			cause,
			extraSecrets,
		)
	}
	if err != nil {
		return newNetworkError(
			fmt.Sprintf("Network request failed: %s", err.Error()),
			reqURL,
			err,
			extraSecrets,
		)
	}
	return newNetworkError("Network request failed", reqURL, nil, extraSecrets)
}

// nonReplayableEmptyBody wraps an empty request body for bodyless non-retryable operations.
// Go's net/http treats Request.Body == nil or http.NoBody with GetBody != nil as idempotent/replayable
// and automatically retries them if a reused keep-alive connection closes before response headers.
// Providing a non-nil body with GetBody == nil makes Transport.RoundTrip treat the request as
// non-replayable while probeRequestBody reads (0, io.EOF) and emits a clean bodyless HTTP request.
type nonReplayableEmptyBody struct{}

func (nonReplayableEmptyBody) Read([]byte) (int, error) { return 0, io.EOF }
func (nonReplayableEmptyBody) Close() error             { return nil }

func (c *Client) executeWithRetry(
	ctx context.Context,
	spec operationSpec,
	prepared preparedRequest,
	reqCfg requestConfig,
	scope *secretScope,
	handshakeOnlyTimeout bool,
	disableDefaultRetry bool,
	lastAttempt *int,
) (*attemptResult, error) {
	routePath := normalizeRoutePath(spec.Path)
	finalHeaders := prepared.headers.Clone()
	hasExplicitRequestAuth := reqCfg.headers != nil && reqCfg.headers.Get("Authorization") != ""
	hasExplicitAuth := finalHeaders.Get("Authorization") != ""

	if !hasExplicitRequestAuth && (reqCfg.apiKey != "" || !hasExplicitAuth) {
		apiKey, err := c.resolveAPIKey(ctx, reqCfg)
		if err != nil {
			return nil, newAuthError("Failed to resolve FastGPT API Key", prepared.url, err, scope.snapshot())
		}
		if apiKey != "" {
			scope.add(apiKey)
			finalHeaders.Set("Authorization", formatBearerHeader(apiKey))
		} else if !hasExplicitAuth && routePath != publicModelListPath {
			return nil, newAuthError(
				"Missing FastGPT API Key. Provide WithAPIKey, WithAPIKeyProvider, WithRequestAPIKey, or FASTGPT_API_KEY env var.",
				prepared.url,
				nil,
				scope.snapshot(),
			)
		}
	}

	scope.addFromHeader(finalHeaders)
	extraSecrets := scope.snapshot()

	timeout := c.resolveTimeout(reqCfg)
	maxRetries := c.resolveMaxRetries(spec, reqCfg, prepared.isStreamBody, disableDefaultRetry)

	attempt := 0
	for {
		*lastAttempt = attempt
		if ctx.Err() != nil {
			return nil, c.classifyContextOrTransportError(ctx, spec, prepared.url, timeout, false, ctx.Err(), extraSecrets)
		}

		var (
			reqCtx         context.Context
			cancelReq      context.CancelCauseFunc
			handshakeDone  atomic.Bool
			handshakeTimed atomic.Bool
			handshakeTimer *time.Timer
		)

		// 非流式请求将超时期限贯穿至响应体读取完成；
		// SSE 与二进制流式下载仅将超时作用于建连握手阶段，握手成功后立即摘除超时计时器，避免误杀长耗时流。
		if handshakeOnlyTimeout {
			reqCtx, cancelReq = context.WithCancelCause(ctx)
			if timeout > 0 {
				handshakeTimer = time.AfterFunc(timeout, func() {
					if handshakeDone.CompareAndSwap(false, true) {
						handshakeTimed.Store(true)
						cancelReq(ErrTimeout)
					}
				})
			}
		} else if timeout > 0 {
			var cancelTimeout context.CancelFunc
			reqCtx, cancelTimeout = context.WithTimeoutCause(ctx, timeout, ErrTimeout)
			cancelReq = func(error) { cancelTimeout() }
		} else {
			reqCtx, cancelReq = context.WithCancelCause(ctx)
		}

		var body io.Reader
		if prepared.hasBody {
			if prepared.bodyReader != nil {
				body = prepared.bodyReader
			} else {
				body = bytes.NewReader(prepared.bodyBytes)
			}
		} else if spec.RetryPolicy == retryPolicyDisabled {
			body = nonReplayableEmptyBody{}
		}

		httpReq, err := http.NewRequestWithContext(reqCtx, spec.Method, prepared.url, body)
		if err != nil {
			if handshakeTimer != nil {
				handshakeTimer.Stop()
			}
			cancelReq(nil)
			return nil, newBadRequestError("Failed to construct HTTP request", prepared.url, err, extraSecrets)
		}
		if spec.RetryPolicy == retryPolicyDisabled {
			httpReq.GetBody = nil
		}
		httpReq.Header = finalHeaders.Clone()

		attemptStart := time.Now()
		notifyRequestObservability(ctx, c.cfg.hooks, c.cfg.logger, RequestHookContext{
			OperationID: spec.ID,
			Method:      spec.Method,
			URL:         prepared.url,
			Headers:     httpReq.Header,
			Attempt:     attempt,
		}, extraSecrets)

		resp, doErr := c.httpClient.Do(httpReq)
		if doErr != nil {
			if handshakeTimer != nil {
				handshakeTimer.Stop()
			}
			timedOut := handshakeTimed.Load() ||
				errors.Is(context.Cause(reqCtx), ErrTimeout) ||
				(ctx.Err() == nil && errors.Is(reqCtx.Err(), context.DeadlineExceeded))
			cancelReq(nil)

			if timedOut || ctx.Err() != nil {
				return nil, c.classifyContextOrTransportError(ctx, spec, prepared.url, timeout, timedOut, doErr, extraSecrets)
			}
			if attempt < maxRetries {
				delay := computeBackoffDelay(attempt, "")
				if sleepErr := sleepWithContext(ctx, delay); sleepErr != nil {
					return nil, c.classifyContextOrTransportError(ctx, spec, prepared.url, timeout, false, sleepErr, extraSecrets)
				}
				attempt++
				continue
			}
			return nil, c.classifyContextOrTransportError(ctx, spec, prepared.url, timeout, false, doErr, extraSecrets)
		}

		requestID := extractRequestID(resp.Header)
		raw := RawResponse{
			StatusCode: resp.StatusCode,
			Header:     resp.Header.Clone(),
			RequestID:  requestID,
			URL:        prepared.url,
		}

		notifyResponseObservability(ctx, c.cfg.hooks, c.cfg.logger, ResponseHookContext{
			OperationID: spec.ID,
			Method:      spec.Method,
			URL:         prepared.url,
			StatusCode:  resp.StatusCode,
			RequestID:   requestID,
			Duration:    time.Since(attemptStart),
			Attempt:     attempt,
		}, extraSecrets)

		if isRetryableHTTPStatus(resp.StatusCode) && attempt < maxRetries {
			if handshakeTimer != nil {
				handshakeTimer.Stop()
			}
			retryAfter := resp.Header.Get("Retry-After")
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
			_ = resp.Body.Close()
			cancelReq(nil)

			delay := computeBackoffDelay(attempt, retryAfter)
			if sleepErr := sleepWithContext(ctx, delay); sleepErr != nil {
				return nil, c.classifyContextOrTransportError(ctx, spec, prepared.url, timeout, false, sleepErr, extraSecrets)
			}
			attempt++
			continue
		}

		return &attemptResult{
			resp:           resp,
			raw:            raw,
			attempt:        attempt,
			timeout:        timeout,
			handshakeDone:  &handshakeDone,
			handshakeTimed: &handshakeTimed,
			handshakeTimer: handshakeTimer,
			cancelReq:      cancelReq,
			reqCtx:         reqCtx,
		}, nil
	}
}

func (c *Client) readBodyWithAttempt(
	ctx context.Context,
	spec operationSpec,
	res *attemptResult,
	extraSecrets []string,
) ([]byte, error) {
	if res.resp.Body == nil {
		return nil, nil
	}
	rawBytes, err := io.ReadAll(res.resp.Body)
	_ = res.resp.Body.Close()
	if err != nil {
		timedOut := res.handshakeTimed.Load() ||
			errors.Is(context.Cause(res.reqCtx), ErrTimeout) ||
			(ctx.Err() == nil && errors.Is(res.reqCtx.Err(), context.DeadlineExceeded))
		return nil, c.classifyContextOrTransportError(ctx, spec, res.raw.URL, res.timeout, timedOut, err, extraSecrets)
	}
	return rawBytes, nil
}

func isHTTPSuccessStatus(statusCode int) bool {
	return statusCode >= http.StatusOK && statusCode < http.StatusMultipleChoices
}

func buildResponseError(
	statusCode int,
	raw RawResponse,
	rawBytes []byte,
	extraSecrets []string,
) error {
	if statusCode >= http.StatusMultipleChoices && statusCode < http.StatusBadRequest {
		location := strings.TrimSpace(raw.Header.Get("Location"))
		msg := fmt.Sprintf("Request terminated with unfollowed HTTP %d redirect", statusCode)
		if location != "" {
			msg = fmt.Sprintf("Request terminated with unfollowed HTTP %d redirect to %s", statusCode, location)
		}
		return newMappedAPIError(msg, statusCode, 0, "", raw.RequestID, raw.URL, nil, extraSecrets)
	}

	rawText := strings.TrimSpace(string(rawBytes))
	if rawText != "" {
		var env struct {
			Code       *int            `json:"code"`
			StatusText string          `json:"statusText"`
			Message    string          `json:"message"`
			Data       json.RawMessage `json:"data"`
			Error      *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if strings.HasPrefix(rawText, "{") && json.Unmarshal([]byte(rawText), &env) == nil {
			serverCode := 0
			if env.Code != nil {
				serverCode = *env.Code
			}
			msg := env.Message
			if msg == "" && env.Error != nil {
				msg = env.Error.Message
			}
			msg = cmp.Or(msg, env.StatusText, fmt.Sprintf("Request failed with HTTP %d", statusCode))
			return newMappedAPIErrorWithData(
				msg,
				statusCode,
				serverCode,
				env.StatusText,
				raw.RequestID,
				raw.URL,
				env.Data,
				nil,
				extraSecrets,
			)
		}
	}

	snippet := rawText
	if runes := []rune(snippet); len(runes) > 300 {
		snippet = string(runes[:300])
	}
	msg := cmp.Or(snippet, fmt.Sprintf("Request failed with HTTP %d", statusCode))
	return newMappedAPIError(msg, statusCode, 0, "", raw.RequestID, raw.URL, nil, extraSecrets)
}

func unwrapJSONResponse(
	spec operationSpec,
	raw RawResponse,
	rawBytes []byte,
	out any,
	extraSecrets []string,
) error {
	trimmed := bytes.TrimSpace(rawBytes)
	if len(trimmed) == 0 {
		return nil
	}

	if trimmed[0] == '{' {
		var env struct {
			Code       *int            `json:"code"`
			StatusText string          `json:"statusText"`
			Message    string          `json:"message"`
			Data       json.RawMessage `json:"data"`
		}
		if json.Unmarshal(trimmed, &env) == nil {
			if env.Code != nil {
				code := *env.Code
				if code >= 400 || (spec.ResponseMode == responseEnvelope && code != 200) {
					msg := cmp.Or(env.Message, env.StatusText, fmt.Sprintf("FastGPT API error (code %d)", code))
					return newMappedAPIErrorWithData(
						msg,
						raw.StatusCode,
						code,
						env.StatusText,
						raw.RequestID,
						raw.URL,
						env.Data,
						nil,
						extraSecrets,
					)
				}
			}

			if spec.ResponseMode == responseVoid {
				return nil
			}
			if spec.ResponseMode == responseEnvelope && env.Code != nil && len(env.Data) > 0 {
				if out == nil {
					return nil
				}
				if err := json.Unmarshal(env.Data, out); err != nil {
					return newAPIError(
						ErrAPI,
						"Failed to decode FastGPT API response data",
						raw.StatusCode,
						0,
						"",
						raw.RequestID,
						raw.URL,
						err,
						extraSecrets,
					)
				}
				return nil
			}
		}
	}

	if spec.ResponseMode == responseVoid || out == nil {
		return nil
	}
	if err := json.Unmarshal(trimmed, out); err != nil {
		return newAPIError(
			ErrAPI,
			"Failed to decode FastGPT API response",
			raw.StatusCode,
			0,
			"",
			raw.RequestID,
			raw.URL,
			err,
			extraSecrets,
		)
	}
	return nil
}

func (c *Client) reportRequestError(
	ctx context.Context,
	spec operationSpec,
	requestURL string,
	startedAt time.Time,
	attempt int,
	scope *secretScope,
	err error,
) error {
	notifyErrorObservability(ctx, c.cfg.hooks, c.cfg.logger, ErrorHookContext{
		OperationID: spec.ID,
		Method:      spec.Method,
		URL:         requestURL,
		Duration:    time.Since(startedAt),
		Attempt:     attempt,
		Error:       err,
	}, scope.snapshot())
	return err
}

func (c *Client) executeNonStream(
	ctx context.Context,
	spec operationSpec,
	req any,
	fixedFields map[string]any,
	acceptHeader string,
	handleBody func(raw RawResponse, bodyBytes []byte, extraSecrets []string) error,
	opts ...RequestOption,
) error {
	if ctx == nil {
		ctx = context.Background()
	}
	reqCfg := applyRequestOptions(opts...)
	startedAt := time.Now()
	requestURL := c.baseURL + normalizeRoutePath(spec.Path)
	lastAttempt := 0
	scope := c.newInitialSecretScope(reqCfg)

	prepared, err := c.prepareRequest(spec, req, fixedFields, reqCfg, acceptHeader)
	if err != nil {
		return c.reportRequestError(ctx, spec, requestURL, startedAt, lastAttempt, scope, err)
	}
	requestURL = prepared.url
	scope.addFromHeader(prepared.headers)

	res, err := c.executeWithRetry(ctx, spec, prepared, reqCfg, scope, false, false, &lastAttempt)
	if err != nil {
		return c.reportRequestError(ctx, spec, requestURL, startedAt, lastAttempt, scope, err)
	}
	defer func() {
		if res.resp.Body != nil {
			_ = res.resp.Body.Close()
		}
		res.cancelReq(nil)
	}()

	if reqCfg.rawResponse != nil {
		*reqCfg.rawResponse = res.raw
	}

	extraSecrets := scope.snapshot()
	bodyBytes, err := c.readBodyWithAttempt(ctx, spec, res, extraSecrets)
	if err == nil && !isHTTPSuccessStatus(res.resp.StatusCode) {
		err = buildResponseError(res.resp.StatusCode, res.raw, bodyBytes, extraSecrets)
	}
	if err == nil && handleBody != nil {
		err = handleBody(res.raw, bodyBytes, extraSecrets)
	}
	if err != nil {
		return c.reportRequestError(ctx, spec, requestURL, startedAt, lastAttempt, scope, err)
	}
	return nil
}

func (c *Client) doJSON(
	ctx context.Context,
	spec operationSpec,
	req any,
	fixedFields map[string]any,
	out any,
	opts ...RequestOption,
) error {
	return c.executeNonStream(
		ctx,
		spec,
		req,
		fixedFields,
		"application/json",
		func(raw RawResponse, bodyBytes []byte, extraSecrets []string) error {
			return unwrapJSONResponse(spec, raw, bodyBytes, out, extraSecrets)
		},
		opts...,
	)
}

func (c *Client) doVoid(
	ctx context.Context,
	spec operationSpec,
	req any,
	fixedFields map[string]any,
	opts ...RequestOption,
) error {
	specCopy := spec
	specCopy.ResponseMode = responseVoid
	return c.doJSON(ctx, specCopy, req, fixedFields, nil, opts...)
}

func (c *Client) doBinary(
	ctx context.Context,
	spec operationSpec,
	req any,
	opts ...RequestOption,
) (*BinaryStream, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	reqCfg := applyRequestOptions(opts...)
	startedAt := time.Now()
	requestURL := c.baseURL + normalizeRoutePath(spec.Path)
	lastAttempt := 0
	scope := c.newInitialSecretScope(reqCfg)

	reportErr := func(err error) error {
		return c.reportRequestError(ctx, spec, requestURL, startedAt, lastAttempt, scope, err)
	}

	prepared, err := c.prepareRequest(spec, req, nil, reqCfg, "*/*")
	if err != nil {
		return nil, reportErr(err)
	}
	requestURL = prepared.url
	scope.addFromHeader(prepared.headers)

	res, err := c.executeWithRetry(ctx, spec, prepared, reqCfg, scope, true, false, &lastAttempt)
	if err != nil {
		return nil, reportErr(err)
	}

	handedOff := false
	defer func() {
		if !handedOff {
			if res.handshakeTimer != nil {
				res.handshakeTimer.Stop()
			}
			if res.resp.Body != nil {
				_ = res.resp.Body.Close()
			}
			res.cancelReq(nil)
		}
	}()

	if reqCfg.rawResponse != nil {
		*reqCfg.rawResponse = res.raw
	}

	extraSecrets := scope.snapshot()
	if !isHTTPSuccessStatus(res.resp.StatusCode) {
		bodyBytes, readErr := c.readBodyWithAttempt(ctx, spec, res, extraSecrets)
		if readErr != nil {
			return nil, reportErr(readErr)
		}
		return nil, reportErr(buildResponseError(res.resp.StatusCode, res.raw, bodyBytes, extraSecrets))
	}

	contentType := strings.ToLower(res.resp.Header.Get("Content-Type"))
	contentDisposition := strings.ToLower(res.resp.Header.Get("Content-Disposition"))
	if strings.Contains(contentType, "application/json") && !strings.Contains(contentDisposition, "attachment") {
		bodyBytes, readErr := c.readBodyWithAttempt(ctx, spec, res, extraSecrets)
		if readErr != nil {
			return nil, reportErr(readErr)
		}
		var env struct {
			Code       *int            `json:"code"`
			StatusText string          `json:"statusText"`
			Message    string          `json:"message"`
			Data       json.RawMessage `json:"data"`
		}
		if json.Unmarshal(bytes.TrimSpace(bodyBytes), &env) == nil && env.Code != nil && *env.Code != 200 {
			msg := cmp.Or(env.Message, env.StatusText, fmt.Sprintf("FastGPT API error (code %d)", *env.Code))
			return nil, reportErr(newMappedAPIErrorWithData(
				msg,
				res.resp.StatusCode,
				*env.Code,
				env.StatusText,
				res.raw.RequestID,
				res.raw.URL,
				env.Data,
				nil,
				extraSecrets,
			))
		}
		res.resp.Body = io.NopCloser(bytes.NewReader(bodyBytes))
	}

	if res.handshakeTimer != nil {
		res.handshakeTimer.Stop()
	}
	// 原子抢占握手完成标记；若定时器在 Stop 前已经触发超时，立即拒绝建连并释放响应体。
	if !res.handshakeDone.CompareAndSwap(false, true) || res.handshakeTimed.Load() {
		return nil, reportErr(c.classifyContextOrTransportError(
			ctx,
			spec,
			res.raw.URL,
			res.timeout,
			true,
			context.DeadlineExceeded,
			extraSecrets,
		))
	}

	body := res.resp.Body
	if body == nil {
		body = http.NoBody
	}
	handedOff = true
	return newBinaryStream(
		ctx,
		body,
		res.raw,
		res.resp.ContentLength,
		spec,
		startedAt,
		lastAttempt,
		extraSecrets,
		c,
		res.cancelReq,
	), nil
}

func (c *Client) doStream(
	ctx context.Context,
	spec operationSpec,
	req any,
	fixedFields map[string]any,
	opts ...RequestOption,
) (*ChatStream, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	reqCfg := applyRequestOptions(opts...)
	startedAt := time.Now()
	requestURL := c.baseURL + normalizeRoutePath(spec.Path)
	lastAttempt := 0
	scope := c.newInitialSecretScope(reqCfg)

	reportErr := func(err error) error {
		return c.reportRequestError(ctx, spec, requestURL, startedAt, lastAttempt, scope, err)
	}

	prepared, err := c.prepareRequest(spec, req, fixedFields, reqCfg, "text/event-stream")
	if err != nil {
		return nil, reportErr(err)
	}
	requestURL = prepared.url
	scope.addFromHeader(prepared.headers)

	res, err := c.executeWithRetry(ctx, spec, prepared, reqCfg, scope, true, true, &lastAttempt)
	if err != nil {
		return nil, reportErr(err)
	}

	handedOff := false
	defer func() {
		if !handedOff {
			if res.handshakeTimer != nil {
				res.handshakeTimer.Stop()
			}
			if res.resp.Body != nil {
				_ = res.resp.Body.Close()
			}
			res.cancelReq(nil)
		}
	}()

	if reqCfg.rawResponse != nil {
		*reqCfg.rawResponse = res.raw
	}

	extraSecrets := scope.snapshot()
	if !isHTTPSuccessStatus(res.resp.StatusCode) {
		bodyBytes, readErr := c.readBodyWithAttempt(ctx, spec, res, extraSecrets)
		if readErr != nil {
			return nil, reportErr(readErr)
		}
		return nil, reportErr(buildResponseError(res.resp.StatusCode, res.raw, bodyBytes, extraSecrets))
	}

	contentType := res.resp.Header.Get("Content-Type")
	if strings.Contains(strings.ToLower(contentType), "application/json") {
		bodyBytes, readErr := c.readBodyWithAttempt(ctx, spec, res, extraSecrets)
		if readErr != nil {
			return nil, reportErr(readErr)
		}
		var env struct {
			Code       *int            `json:"code"`
			StatusText string          `json:"statusText"`
			Message    string          `json:"message"`
			Data       json.RawMessage `json:"data"`
		}
		if json.Unmarshal(bytes.TrimSpace(bodyBytes), &env) == nil && env.Code != nil && *env.Code >= 400 {
			msg := cmp.Or(env.Message, env.StatusText, fmt.Sprintf("FastGPT stream error (code %d)", *env.Code))
			return nil, reportErr(newMappedAPIErrorWithData(
				msg,
				res.resp.StatusCode,
				*env.Code,
				env.StatusText,
				res.raw.RequestID,
				res.raw.URL,
				env.Data,
				nil,
				extraSecrets,
			))
		}
		return nil, reportErr(newAPIError(
			ErrAPI,
			fmt.Sprintf("Expected text/event-stream response for %s, received %s", spec.Path, cmp.Or(contentType, "unknown")),
			res.resp.StatusCode,
			0,
			"",
			res.raw.RequestID,
			res.raw.URL,
			nil,
			extraSecrets,
		))
	}

	if res.resp.Body == nil {
		return nil, reportErr(newAPIError(
			ErrAPI,
			fmt.Sprintf("Empty stream body returned from %s", spec.Path),
			res.resp.StatusCode,
			0,
			"",
			res.raw.RequestID,
			res.raw.URL,
			nil,
			extraSecrets,
		))
	}

	if res.handshakeTimer != nil {
		res.handshakeTimer.Stop()
	}
	// 原子抢占握手完成标记；若定时器在 Stop 前已经触发超时，立即拒绝建连并释放响应体。
	if !res.handshakeDone.CompareAndSwap(false, true) || res.handshakeTimed.Load() {
		return nil, reportErr(c.classifyContextOrTransportError(
			ctx,
			spec,
			res.raw.URL,
			res.timeout,
			true,
			context.DeadlineExceeded,
			extraSecrets,
		))
	}

	// 将流响应体关闭与内部 reqCtx 清理绑定，避免握手后取消父 ctx 前挂起无用的衍生 Context。
	res.resp.Body = &cancelOnCloseReadCloser{
		ReadCloser: res.resp.Body,
		cancel:     func() { res.cancelReq(nil) },
	}
	handedOff = true
	return newChatStream(ctx, res.resp, res.raw, true, extraSecrets), nil
}
