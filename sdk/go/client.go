package fastgpt

import (
	"net/http"
	"net/url"
	"strings"
)

// Client is the entry point for the FastGPT Go SDK, exposing domain services
// generated from the FastGPT System OpenAPI specification.
type Client struct {
	Apps     *AppsService
	Chat     *ChatService
	Datasets *DatasetsService
	Models   *ModelsService

	cfg        clientConfig
	baseURL    string
	httpClient *http.Client
	configErr  error
}

// NewClient constructs a new FastGPT SDK client configured by opts.
func NewClient(opts ...ClientOption) *Client {
	cfg := clientConfig{
		timeout:        defaultTimeout,
		defaultHeaders: make(http.Header),
	}
	for _, opt := range opts {
		if opt != nil {
			opt(&cfg)
		}
	}
	return newClientFromConfig(cfg)
}

func newClientFromConfig(cfg clientConfig) *Client {
	cloned := cloneClientConfig(cfg)
	baseURL := normalizeAPIBaseURL(cloned.baseURL)

	if cloned.httpClient == nil {
		cloned.httpClient = &http.Client{}
	}

	var configErr error
	if cloned.identity != nil {
		configErr = validateIdentityValues(cloned.identity.CustomUID, cloned.identity.AuthProxy, "Client")
	}
	if configErr == nil {
		parsed, err := url.Parse(baseURL)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			configErr = newBadRequestError(
				"Invalid FastGPT baseURL: "+strings.TrimSpace(baseURL),
				baseURL,
				err,
				nil,
			)
		}
	}

	c := &Client{
		cfg:        cloned,
		baseURL:    baseURL,
		httpClient: cloned.httpClient,
		configErr:  configErr,
	}
	c.Apps = newAppsService(c)
	c.Chat = newChatService(c)
	c.Datasets = newDatasetsService(c)
	c.Models = newModelsService(c)
	return c
}

// BaseURL returns the normalized API root URL ending with /api.
func (c *Client) BaseURL() string {
	if c == nil {
		return ""
	}
	return c.baseURL
}

// WithIdentity derives a lightweight client bound to a specific caller identity
// while sharing the parent's configuration and underlying *http.Client connection pool.
func (c *Client) WithIdentity(identity Identity) *Client {
	if c == nil {
		return NewClient(WithIdentity(identity))
	}
	cfg := cloneClientConfig(c.cfg)
	cfg.identity = cloneIdentity(&identity)
	return newClientFromConfig(cfg)
}

// WithOptions derives a new client with overridden options while sharing the parent's
// underlying *http.Client connection pool unless WithHTTPClient is passed.
func (c *Client) WithOptions(opts ...ClientOption) *Client {
	if c == nil {
		return NewClient(opts...)
	}
	cfg := cloneClientConfig(c.cfg)
	for _, opt := range opts {
		if opt != nil {
			opt(&cfg)
		}
	}
	return newClientFromConfig(cfg)
}
