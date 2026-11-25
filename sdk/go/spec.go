package fastgpt

import (
	"context"
	"io"
	"net/http"
	"time"
)

type requestContentType string

const (
	contentNone      requestContentType = "none"
	contentJSON      requestContentType = "json"
	contentMultipart requestContentType = "multipart"
	contentBinary    requestContentType = "binary"
)

type responseMode string

const (
	responseEnvelope responseMode = "envelope"
	responseRawJSON  responseMode = "rawJson"
	responseBinary   responseMode = "binary"
	responseVoid     responseMode = "void"
)

type multipartMode string

const (
	multipartNone            multipartMode = "none"
	multipartFileAndJSONData multipartMode = "fileAndJsonData"
	multipartFlatFields      multipartMode = "flatFields"
)

type paramCarrier string

const (
	carrierNone  paramCarrier = "none"
	carrierQuery paramCarrier = "query"
	carrierBody  paramCarrier = "body"
)

type retryPolicy uint8

const (
	retryPolicyDefault retryPolicy = iota
	retryPolicyEnabled
	retryPolicyDisabled
)

type operationSpec struct {
	ID                 string
	Method             string
	Path               string
	RequestContentType requestContentType
	MultipartMode      multipartMode
	ResponseMode       responseMode
	RetryPolicy        retryPolicy
	AppIDCarrier       paramCarrier
	IdentityCarrier    paramCarrier
	PathParams         []string
	QueryParams        []string
	BodyParams         []string
	BinaryBodyField    string
}

// RawResponse captures metadata from an HTTP response returned by the FastGPT API.
type RawResponse struct {
	StatusCode int
	Header     http.Header
	RequestID  string
	URL        string
}

// FileUpload describes a file to be sent in a multipart/form-data request.
type FileUpload struct {
	Filename    string
	ContentType string
	Reader      io.Reader
	Bytes       []byte
}

// BinaryInput describes a raw binary payload for application/octet-stream requests.
type BinaryInput struct {
	ContentType string
	Reader      io.Reader
	Bytes       []byte
}

// AuthProxy identifies a team member on whose behalf a personal API key acts.
// TmbID and Username are mutually exclusive.
type AuthProxy struct {
	TmbID    string `json:"tmbId,omitempty"`
	Username string `json:"username,omitempty"`
}

// AuthProxyByTmbID creates an AuthProxy scoped to a team member ID.
func AuthProxyByTmbID(id string) AuthProxy {
	return AuthProxy{TmbID: id}
}

// AuthProxyByUsername creates an AuthProxy scoped to a team member username.
func AuthProxyByUsername(username string) AuthProxy {
	return AuthProxy{Username: username}
}

// Identity specifies the caller identity context attached to API requests.
// CustomUID and AuthProxy are mutually exclusive.
type Identity struct {
	CustomUID string
	AuthProxy *AuthProxy
}

// IdentityCustomUID constructs an Identity using an external end-user ID.
func IdentityCustomUID(uid string) Identity {
	return Identity{CustomUID: uid}
}

// IdentityAuthProxy constructs an Identity using a team-member AuthProxy.
func IdentityAuthProxy(ap AuthProxy) Identity {
	return Identity{AuthProxy: &ap}
}

// RequestOption configures per-request behavior such as headers, timeout, retries, or identity.
type RequestOption func(*requestConfig)

type requestConfig struct {
	headers     http.Header
	timeout     *time.Duration
	maxRetries  *int
	apiKey      string
	appID       string
	customUID   string
	authProxy   *AuthProxy
	rawResponse *RawResponse
}

// Hooks provides optional observability callbacks around outbound SDK requests.
type Hooks struct {
	OnRequest  func(context.Context, RequestHookContext)
	OnResponse func(context.Context, ResponseHookContext)
	OnError    func(context.Context, ErrorHookContext)
}

// RequestHookContext carries sanitized metadata for an outgoing HTTP attempt.
type RequestHookContext struct {
	OperationID string
	Method      string
	URL         string
	Headers     http.Header
	Attempt     int
}

// ResponseHookContext carries sanitized metadata for a received HTTP response.
type ResponseHookContext struct {
	OperationID string
	Method      string
	URL         string
	StatusCode  int
	RequestID   string
	Duration    time.Duration
	Attempt     int
}

// ErrorHookContext carries sanitized metadata for a failed HTTP attempt.
type ErrorHookContext struct {
	OperationID string
	Method      string
	URL         string
	Duration    time.Duration
	Attempt     int
	Error       error
}
