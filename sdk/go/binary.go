package fastgpt

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"sync"
	"sync/atomic"
	"time"
)

// BinaryStream streams a binary download response body without buffering the entire payload in memory.
// It implements io.ReadCloser and io.WriterTo, enforces caller context cancellation/close semantics during reads,
// and triggers Client error observability at most once on transport read failures.
type BinaryStream struct {
	ctx           context.Context
	body          io.ReadCloser
	raw           RawResponse
	contentLength int64
	spec          operationSpec
	startedAt     time.Time
	attempt       int
	extraSecrets  []string
	client        *Client
	cancelReq     context.CancelCauseFunc

	mu        sync.Mutex
	stopAfter func() bool

	closed atomic.Bool

	closeOnce    sync.Once
	bodyCloseErr error

	errMu   sync.Mutex
	readErr error
}

type binaryPlainReader struct {
	r io.Reader
}

func (b binaryPlainReader) Read(p []byte) (int, error) {
	return b.r.Read(p)
}

func newBinaryStream(
	ctx context.Context,
	body io.ReadCloser,
	raw RawResponse,
	contentLength int64,
	spec operationSpec,
	startedAt time.Time,
	attempt int,
	extraSecrets []string,
	client *Client,
	cancelReq context.CancelCauseFunc,
) *BinaryStream {
	if ctx == nil {
		ctx = context.Background()
	}
	rawCopy := raw
	if raw.Header != nil {
		rawCopy.Header = raw.Header.Clone()
	}

	s := &BinaryStream{
		ctx:           ctx,
		body:          body,
		raw:           rawCopy,
		contentLength: contentLength,
		spec:          spec,
		startedAt:     startedAt,
		attempt:       attempt,
		extraSecrets:  cloneStringSlice(extraSecrets),
		client:        client,
		cancelReq:     cancelReq,
	}

	if ctx.Err() != nil {
		_ = s.closeTransport()
		return s
	}

	s.mu.Lock()
	stop := context.AfterFunc(ctx, func() {
		_ = s.closeTransport()
	})
	if s.closed.Load() {
		s.mu.Unlock()
		stop()
		return s
	}
	s.stopAfter = stop
	s.mu.Unlock()

	return s
}

// Response returns the sanitized HTTP response metadata captured when the download stream opened.
func (s *BinaryStream) Response() RawResponse {
	if s == nil {
		return RawResponse{}
	}
	raw := s.raw
	if s.raw.Header != nil {
		raw.Header = s.raw.Header.Clone()
	}
	return raw
}

// ContentType returns the Content-Type response header value, if present.
func (s *BinaryStream) ContentType() string {
	if s == nil || s.raw.Header == nil {
		return ""
	}
	return s.raw.Header.Get("Content-Type")
}

// ContentLength returns the Content-Length reported by the server, or -1 if unknown.
func (s *BinaryStream) ContentLength() int64 {
	if s == nil {
		return -1
	}
	return s.contentLength
}

func (s *BinaryStream) closeTransport() error {
	s.closeOnce.Do(func() {
		s.mu.Lock()
		stop := s.stopAfter
		s.stopAfter = nil
		s.mu.Unlock()
		if stop != nil {
			stop()
		}
		if s.body != nil {
			s.bodyCloseErr = s.body.Close()
		}
		if s.cancelReq != nil {
			s.cancelReq(nil)
		}
	})
	return s.bodyCloseErr
}

// Close closes the underlying HTTP response body and cancels any derived request context.
func (s *BinaryStream) Close() error {
	if s == nil {
		return nil
	}
	s.closed.Store(true)
	return s.closeTransport()
}

func (s *BinaryStream) cachedReadError() error {
	s.errMu.Lock()
	defer s.errMu.Unlock()
	return s.readErr
}

func (s *BinaryStream) reportErrorOnce(mapped error) error {
	if mapped == nil {
		return nil
	}
	s.errMu.Lock()
	if s.readErr != nil {
		existing := s.readErr
		s.errMu.Unlock()
		return existing
	}
	s.readErr = mapped
	s.errMu.Unlock()

	if s.client != nil {
		notifyErrorObservability(s.ctx, s.client.cfg.hooks, s.client.cfg.logger, ErrorHookContext{
			OperationID: s.spec.ID,
			Method:      s.spec.Method,
			URL:         s.raw.URL,
			Duration:    time.Since(s.startedAt),
			Attempt:     s.attempt,
			Error:       mapped,
		}, s.extraSecrets)
	}
	return mapped
}

func (s *BinaryStream) classifyReadFailure(err error) error {
	if s.ctx.Err() != nil {
		cause := context.Cause(s.ctx)
		if cause == nil {
			cause = err
		}
		if cause == nil {
			cause = s.ctx.Err()
		}
		if errors.Is(s.ctx.Err(), context.DeadlineExceeded) {
			return newAPIError(
				ErrTimeout,
				fmt.Sprintf("Binary download %s %s timed out", s.spec.Method, s.spec.Path),
				0,
				0,
				"",
				s.raw.RequestID,
				s.raw.URL,
				cause,
				s.extraSecrets,
			)
		}
		return newAbortedError(
			fmt.Sprintf("Binary download %s %s was aborted", s.spec.Method, s.spec.Path),
			s.raw.RequestID,
			s.raw.URL,
			cause,
			s.extraSecrets,
		)
	}
	if s.closed.Load() {
		cause := err
		if cause == nil {
			cause = net.ErrClosed
		}
		return newAbortedError(
			"Binary download stream was closed",
			s.raw.RequestID,
			s.raw.URL,
			cause,
			s.extraSecrets,
		)
	}
	if err != nil {
		return newAPIError(
			ErrNetwork,
			fmt.Sprintf("Binary download failed: %s", err.Error()),
			0,
			0,
			"",
			s.raw.RequestID,
			s.raw.URL,
			err,
			s.extraSecrets,
		)
	}
	return newAPIError(ErrNetwork, "Binary download failed", 0, 0, "", s.raw.RequestID, s.raw.URL, nil, s.extraSecrets)
}

// Read reads streamed bytes from the underlying HTTP response body, preserving context cancellation,
// close, and network error semantics.
func (s *BinaryStream) Read(p []byte) (int, error) {
	if s == nil {
		return 0, io.EOF
	}
	if existingErr := s.cachedReadError(); existingErr != nil {
		return 0, existingErr
	}
	if s.ctx.Err() != nil {
		_ = s.closeTransport()
		return 0, s.reportErrorOnce(s.classifyReadFailure(s.ctx.Err()))
	}
	if s.closed.Load() {
		return 0, s.reportErrorOnce(s.classifyReadFailure(net.ErrClosed))
	}
	if s.body == nil {
		return 0, io.EOF
	}

	n, err := s.body.Read(p)
	if err == nil {
		return n, nil
	}
	if errors.Is(err, io.EOF) {
		if s.ctx.Err() != nil {
			_ = s.closeTransport()
			return n, s.reportErrorOnce(s.classifyReadFailure(s.ctx.Err()))
		}
		if s.closed.Load() {
			_ = s.closeTransport()
			return n, s.reportErrorOnce(s.classifyReadFailure(net.ErrClosed))
		}
		_ = s.Close()
		return n, io.EOF
	}

	_ = s.closeTransport()
	return n, s.reportErrorOnce(s.classifyReadFailure(err))
}

// WriteTo streams the binary response body directly into w without buffering the entire archive in memory,
// and closes the stream before returning.
func (s *BinaryStream) WriteTo(w io.Writer) (int64, error) {
	if s == nil {
		return 0, nil
	}
	defer func() {
		_ = s.Close()
	}()
	if w == nil {
		return 0, s.reportErrorOnce(newBadRequestError("Destination writer must not be nil", s.raw.URL, nil, s.extraSecrets))
	}
	// Wrap s in binaryPlainReader so io.Copy does not invoke WriteTo recursively.
	return io.Copy(w, binaryPlainReader{r: s})
}

// Bytes drains the remaining binary stream into memory and closes the underlying response body.
// Prefer WriteTo or io.Reader streaming for large downloads.
func (s *BinaryStream) Bytes() ([]byte, error) {
	if s == nil {
		return nil, nil
	}
	var buf bytes.Buffer
	if _, err := s.WriteTo(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
