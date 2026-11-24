package fastgpt

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type chunkedReadCloser struct {
	mu     sync.Mutex
	chunks [][]byte
	idx    int
	closed atomic.Bool
}

func newChunkedReadCloser(chunks ...[]byte) *chunkedReadCloser {
	return &chunkedReadCloser{chunks: chunks}
}

func (r *chunkedReadCloser) Read(p []byte) (int, error) {
	if r.closed.Load() {
		return 0, io.ErrClosedPipe
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.idx >= len(r.chunks) {
		return 0, io.EOF
	}
	chunk := r.chunks[r.idx]
	if len(chunk) == 0 {
		r.idx++
		return 0, nil
	}
	n := copy(p, chunk)
	if n < len(chunk) {
		r.chunks[r.idx] = chunk[n:]
	} else {
		r.idx++
	}
	return n, nil
}

func (r *chunkedReadCloser) Close() error {
	r.closed.Store(true)
	return nil
}

type failingReadCloser struct {
	mu         sync.Mutex
	firstChunk []byte
	sentFirst  bool
	failErr    error
	closeCount atomic.Int32
}

func (r *failingReadCloser) Read(p []byte) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if !r.sentFirst {
		r.sentFirst = true
		n := copy(p, r.firstChunk)
		return n, nil
	}
	return 0, r.failErr
}

func (r *failingReadCloser) Close() error {
	r.closeCount.Add(1)
	return nil
}

type pausableReadCloser struct {
	mu         sync.Mutex
	firstChunk []byte
	sentFirst  bool
	closedCh   chan struct{}
	closeOnce  sync.Once
	closeCount atomic.Int32
}

func newPausableReadCloser(firstChunk string) *pausableReadCloser {
	return &pausableReadCloser{
		firstChunk: []byte(firstChunk),
		closedCh:   make(chan struct{}),
	}
}

func (r *pausableReadCloser) Read(p []byte) (int, error) {
	r.mu.Lock()
	if !r.sentFirst {
		r.sentFirst = true
		n := copy(p, r.firstChunk)
		r.mu.Unlock()
		return n, nil
	}
	r.mu.Unlock()

	<-r.closedCh
	return 0, io.ErrClosedPipe
}

func (r *pausableReadCloser) Close() error {
	r.closeCount.Add(1)
	r.closeOnce.Do(func() {
		close(r.closedCh)
	})
	return nil
}

func mockSSEResponse(body io.ReadCloser) (*http.Response, RawResponse) {
	header := http.Header{
		"Content-Type": []string{"text/event-stream"},
		"X-Request-Id": []string{"sse-req-1"},
	}
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     header,
		Body:       body,
	}
	raw := RawResponse{
		StatusCode: http.StatusOK,
		Header:     header,
		RequestID:  "sse-req-1",
		URL:        "https://api.example.com/api/v2/chat/completions",
	}
	return resp, raw
}

func TestChatStreamParsesChunkedUTF8BOMCRLFEvents(t *testing.T) {
	// Split BOM across chunks, split multi-byte UTF-8 rune ("你好，") across chunks,
	// mix CRLF/LF/CR, comments, multi-line data:, and single leading space stripping.
	multiByteFrame := []byte("data: {\"choices\":[{\"delta\":{\"content\":\"你好，\"}}]}\r\n\r\n")
	// Split inside UTF-8 bytes of "你"
	splitPoint := bytes.Index(multiByteFrame, []byte("你")) + 2

	chunks := [][]byte{
		{0xEF, 0xBB},
		append([]byte{0xBF}, []byte(": heartbeat\r\n\r\n")...),
		[]byte("event: flowNodeStatus\r\ndata: {\"status\":\"running\",\"name\":\"知识库检索\"}\r\n\r\n"),
		[]byte("event: answer\ndata: {\"choices\":[{\"delta\":{\"reasoning_content\":\"先分析\"}}]}\n\n"),
		multiByteFrame[:splitPoint],
		multiByteFrame[splitPoint:],
		[]byte("event: fastAnswer\ndata: {\"choices\":[{\"delta\":{\"content\":\"FastGPT\"}}]}\n\n"),
		[]byte("event: flowNodeResponse\ndata: {\"moduleName\":\"KB\",\"quoteList\":[{\"id\":\"q1\",\"q\":\"FAQ\"}]}\n\n"),
		[]byte("event: updateVariables\ndata: {\"lang\":\"zh-CN\"}\n\n"),
		[]byte("event: interactive\ndata: {\"type\":\"userSelect\",\ndata:  \"params\":{\"userSelectOptions\":[{\"key\":\"a\",\"value\":\"A\"}]}}\n\n"),
		[]byte("event: chatTitle\ndata: {\"title\":\"SDK 测试会话\"}\n\n"),
		[]byte("event: workflowDuration\ndata: {\"durationSeconds\":1.42}\n\n"),
		[]byte("data: [DONE]\n\n"),
	}

	resp, raw := mockSSEResponse(newChunkedReadCloser(chunks...))
	stream := newChatStream(t.Context(), resp, raw, true, nil)

	result, err := stream.FinalResult()
	if err != nil {
		t.Fatalf("FinalResult() unexpected error: %v", err)
	}
	if result.Text != "你好，FastGPT" {
		t.Fatalf("result.Text = %q, want %q", result.Text, "你好，FastGPT")
	}
	if result.ReasoningText != "先分析" {
		t.Fatalf("result.ReasoningText = %q, want %q", result.ReasoningText, "先分析")
	}
	if result.ChatTitle != "SDK 测试会话" {
		t.Fatalf("result.ChatTitle = %q, want %q", result.ChatTitle, "SDK 测试会话")
	}
	if result.DurationSeconds != 1.42 || !result.HasDuration {
		t.Fatalf("result.DurationSeconds = %v (has=%v), want 1.42", result.DurationSeconds, result.HasDuration)
	}
	if got := result.Variables["lang"]; got != "zh-CN" {
		t.Fatalf("result.Variables[lang] = %v, want zh-CN", got)
	}
	if len(result.Quotes) != 1 || len(result.NodeResponses) != 1 {
		t.Fatalf("quotes=%d nodeResponses=%d, want 1/1", len(result.Quotes), len(result.NodeResponses))
	}
	if !IsUserSelectInteractive(result.Interactive) {
		t.Fatalf("expected userSelect interactive payload, got %+v", result.Interactive)
	}
	if stream.State() != ChatStreamStateCompleted {
		t.Fatalf("State() = %q, want completed", stream.State())
	}
	// Response() returns cloned headers.
	gotResp := stream.Response()
	gotResp.Header.Set("X-Mutated", "1")
	if stream.Response().Header.Get("X-Mutated") != "" {
		t.Fatal("Response() did not clone Header map")
	}
}

func TestChatStreamHandlesResumeEventsToolAndPlanVariantsAndSingleIteration(t *testing.T) {
	chunks := [][]byte{
		[]byte("event: resumePhase\ndata: catchup\n\n"),
		[]byte("event: resumePhase\ndata: live\n\n"),
		[]byte("event: toolCall\ndata: {\"tool\":\"search\"}\n\n"),
		[]byte("event: toolParams\ndata: {\"q\":\"go\"}\n\n"),
		[]byte("event: toolResponse\ndata: {\"ok\":true}\n\n"),
		[]byte("event: plan\ndata: {\"steps\":1}\n\n"),
		[]byte("event: planStatus\ndata: {\"done\":true}\n\n"),
		[]byte("event: sandboxStatus\ndata: {\"status\":\"ready\"}\n\n"),
		[]byte("event: skillCall\ndata: {\"skill\":\"code\"}\n\n"),
		[]byte("event: resumeCompleted\ndata: {\"resumed\":true}\n\n"),
		[]byte("event: resumeUnavailable\ndata: {\"reason\":\"expired\"}\n\n"),
		[]byte("event: flowResponses\ndata: [{\"moduleName\":\"M1\",\"quoteList\":[{\"id\":\"q2\"}]}]\n\n"),
		[]byte("event: customFutureEvent\ndata: {\"x\":1}\n\n"),
		[]byte("event: answer\ndata: {\"choices\":[{\"delta\":{\"content\":\"恢复后的内容\"}}]}\n\n"),
		[]byte("event: done\ndata: [DONE]\n\n"),
	}

	resp, raw := mockSSEResponse(newChunkedReadCloser(chunks...))
	stream := newChatStream(t.Context(), resp, raw, true, nil)

	var eventTypes []ChatSSEEventType
	for ev, err := range stream.Events() {
		if err != nil {
			t.Fatalf("Events() unexpected error: %v", err)
		}
		eventTypes = append(eventTypes, ev.EventType())
		if phaseEv, ok := ev.(ChatSSEResumePhaseEvent); ok {
			if phaseEv.Phase != "catchup" && phaseEv.Phase != "live" {
				t.Fatalf("unexpected resumePhase: %+v", phaseEv)
			}
		}
	}

	if len(eventTypes) != 14 {
		t.Fatalf("got %d events (%v), want 14", len(eventTypes), eventTypes)
	}
	if eventTypes[0] != ChatSSEEventResumePhase || eventTypes[12] != ChatSSEEventUnknown {
		t.Fatalf("unexpected eventTypes ordering: %v", eventTypes)
	}

	// Second iteration of Events() must yield an explicit error.
	var secondErr error
	for _, err := range stream.Events() {
		if err != nil {
			secondErr = err
		}
	}
	if secondErr == nil {
		t.Fatal("expected error when iterating ChatStream.Events() twice")
	}
}

func TestChatStreamPropagatesSSEErrorEventAndRedactsSecrets(t *testing.T) {
	chunks := [][]byte{
		[]byte("data: {\"choices\":[{\"delta\":{\"content\":\"部分输出\"}}]}\n\n"),
		[]byte("event: error\ndata: {\"code\":500,\"statusText\":\"workflowError\",\"message\":\"Node failed with Bearer fastgpt-secret-token-123456\"}\n\n"),
	}

	resp, raw := mockSSEResponse(newChunkedReadCloser(chunks...))
	stream := newChatStream(t.Context(), resp, raw, true, []string{"custom-oem-secret-999"})

	text, err := stream.FinalText()
	if err == nil {
		t.Fatalf("expected error from FinalText(), got text=%q", text)
	}
	if !errors.Is(err, ErrServer) {
		t.Fatalf("expected errors.Is(err, ErrServer), got %v", err)
	}
	if strings.Contains(err.Error(), "fastgpt-secret-token-123456") {
		t.Fatalf("secret leaked in error message: %q", err.Error())
	}
	if stream.State() != ChatStreamStateFailed {
		t.Fatalf("State() = %q, want failed", stream.State())
	}

	// Also test OpenAI-style inline {"error": {...}} inside answer/message event.
	inlineChunks := [][]byte{
		[]byte("data: {\"error\":{\"message\":\"Bad auth token custom-oem-secret-999\",\"type\":\"unAuthApiKey\"}}\n\n"),
	}
	resp2, raw2 := mockSSEResponse(newChunkedReadCloser(inlineChunks...))
	stream2 := newChatStream(t.Context(), resp2, raw2, true, []string{"custom-oem-secret-999"})
	_, err2 := stream2.FinalResult()
	if !errors.Is(err2, ErrAuth) {
		t.Fatalf("expected errors.Is(err2, ErrAuth), got %v", err2)
	}
	if strings.Contains(err2.Error(), "custom-oem-secret-999") {
		t.Fatalf("extraSecret leaked in error message: %q", err2.Error())
	}
}

func TestChatStreamSupportsFinalResultAfterIterationAndNextLoop(t *testing.T) {
	chunks := [][]byte{
		[]byte("event: answer\ndata: {\"choices\":[{\"delta\":{\"reasoning_content\":\"思考中\",\"content\":\"第一段\"}}]}\n\n"),
		[]byte("event: answer\ndata: {\"choices\":[{\"delta\":{\"content\":\"第二段\"}}]}\n\n"),
		[]byte("event: flowNodeResponse\ndata: {\"moduleName\":\"Search\",\"quoteList\":[{\"id\":\"q99\"}]}\n\n"),
		[]byte("event: chatTitle\ndata: \"流式后聚合\"\n\n"),
		[]byte("data: [DONE]\n\n"),
	}

	resp, raw := mockSSEResponse(newChunkedReadCloser(chunks...))
	stream := newChatStream(t.Context(), resp, raw, true, nil)

	var deltas []string
	for stream.Next() {
		if ans, ok := stream.Current().(ChatSSEAnswerEvent); ok {
			deltas = append(deltas, ans.TextDelta)
		}
	}
	if err := stream.Err(); err != nil {
		t.Fatalf("stream.Err() = %v, want nil", err)
	}
	if len(deltas) != 2 || deltas[0] != "第一段" || deltas[1] != "第二段" {
		t.Fatalf("deltas = %v, want [第一段 第二段]", deltas)
	}

	summary, err := stream.FinalResult()
	if err != nil {
		t.Fatalf("FinalResult() error = %v", err)
	}
	if summary.Text != "第一段第二段" || summary.ReasoningText != "思考中" || summary.ChatTitle != "流式后聚合" {
		t.Fatalf("unexpected summary: %+v", summary)
	}
	if len(summary.Quotes) != 1 {
		t.Fatalf("expected 1 quote, got %d", len(summary.Quotes))
	}
	text, err := stream.FinalText()
	if err != nil || text != "第一段第二段" {
		t.Fatalf("FinalText() = (%q, %v), want (第一段第二段, nil)", text, err)
	}
}

func TestChatStreamConcurrentFinalResultAndEarlyBreakPartialSnapshot(t *testing.T) {
	// 1. Concurrent FinalResult() waits cleanly while Events() advances, without stealing frames.
	pr, pw := io.Pipe()
	t.Cleanup(func() {
		_ = pw.Close()
		_ = pr.Close()
	})
	resp1, raw1 := mockSSEResponse(pr)
	stream1 := newChatStream(t.Context(), resp1, raw1, true, nil)

	firstEventSeen := make(chan struct{})
	finalReady := make(chan struct{})
	type finalOut struct {
		res *ChatStreamFinalResult
		err error
	}
	ch := make(chan finalOut, 1)

	go func() {
		_, _ = pw.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"A\"}}]}\n\n"))
		<-finalReady
		_, _ = pw.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"B\"}}]}\n\n"))
		_, _ = pw.Write([]byte("data: [DONE]\n\n"))
		_ = pw.Close()
	}()

	go func() {
		<-firstEventSeen
		close(finalReady)
		r, e := stream1.FinalResult()
		ch <- finalOut{res: r, err: e}
	}()

	var eventsText strings.Builder
	for ev, err := range stream1.Events() {
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if answer, ok := ev.(ChatSSEAnswerEvent); ok {
			eventsText.WriteString(answer.TextDelta)
			if eventsText.String() == "A" {
				close(firstEventSeen)
			}
		}
	}
	if eventsText.String() != "AB" {
		t.Fatalf("Events() received %q, want AB", eventsText.String())
	}

	got := <-ch
	if got.err != nil || got.res.Text != "AB" {
		t.Fatalf("concurrent FinalResult() = (%+v, %v), want Text=AB", got.res, got.err)
	}

	// 2. Early break in Events() transitions to closed and preserves partial snapshot.
	chunks2 := [][]byte{
		[]byte("data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n"),
		[]byte("data: {\"choices\":[{\"delta\":{\"content\":\"World\"}}]}\n\n"),
		[]byte("data: [DONE]\n\n"),
	}
	resp2, raw2 := mockSSEResponse(newChunkedReadCloser(chunks2...))
	stream2 := newChatStream(t.Context(), resp2, raw2, true, nil)

	for ev, err := range stream2.Events() {
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if _, ok := ev.(ChatSSEAnswerEvent); ok {
			break
		}
	}
	if stream2.State() != ChatStreamStateClosed {
		t.Fatalf("State() = %q, want closed", stream2.State())
	}
	partialText, err := stream2.FinalText()
	if err != nil || partialText != "Hello" {
		t.Fatalf("FinalText() after early break = (%q, %v), want (Hello, nil)", partialText, err)
	}
}

func TestChatStreamMidStreamTransportFailure(t *testing.T) {
	body := &failingReadCloser{
		firstChunk: []byte("data: {\"choices\":[{\"delta\":{\"content\":\"首段\"}}]}\n\n"),
		failErr:    errors.New("socket hang up"),
	}
	resp, raw := mockSSEResponse(body)
	stream := newChatStream(t.Context(), resp, raw, true, nil)

	var deltas []string
	var iterErr error
	for ev, err := range stream.Events() {
		if err != nil {
			iterErr = err
			break
		}
		if ans, ok := ev.(ChatSSEAnswerEvent); ok {
			deltas = append(deltas, ans.TextDelta)
		}
	}

	if len(deltas) != 1 || deltas[0] != "首段" {
		t.Fatalf("deltas = %v, want [首段]", deltas)
	}
	if !errors.Is(iterErr, ErrNetwork) || !strings.Contains(iterErr.Error(), "socket hang up") {
		t.Fatalf("expected ErrNetwork wrapping socket hang up, got %v", iterErr)
	}
	if stream.State() != ChatStreamStateFailed {
		t.Fatalf("State() = %q, want failed", stream.State())
	}
	if _, err := stream.FinalText(); !errors.Is(err, ErrNetwork) {
		t.Fatalf("FinalText() = %v, want ErrNetwork", err)
	}
	if _, err := stream.FinalResult(); !errors.Is(err, ErrNetwork) {
		t.Fatalf("FinalResult() = %v, want ErrNetwork", err)
	}
	if got := body.closeCount.Load(); got != 1 {
		t.Fatalf("Close() called %d times, want 1", got)
	}
}

func TestChatStreamContextAbortWhilePausedOrBlocked(t *testing.T) {
	// 1. Paused after first event in Events(), then context canceled while FinalText() waits.
	body := newPausableReadCloser("data: {\"choices\":[{\"delta\":{\"content\":\"第一段\"}}]}\n\n")
	resp, raw := mockSSEResponse(body)
	ctx, cancel := context.WithCancelCause(t.Context())
	defer cancel(nil)

	stream := newChatStream(ctx, resp, raw, true, nil)
	firstEvent := make(chan struct{})
	eventsErrCh := make(chan error, 1)
	go func() {
		var iterErr error
		for ev, err := range stream.Events() {
			if err != nil {
				iterErr = err
				break
			}
			if _, ok := ev.(ChatSSEAnswerEvent); ok {
				close(firstEvent)
			}
		}
		eventsErrCh <- iterErr
	}()
	<-firstEvent

	errCh := make(chan error, 1)
	go func() {
		_, err := stream.FinalText()
		errCh <- err
	}()

	cause := errors.New("user cancelled")
	cancel(cause)

	finalErr := <-errCh
	if !errors.Is(finalErr, ErrAborted) {
		t.Fatalf("expected ErrAborted, got %v", finalErr)
	}
	if eventsErr := <-eventsErrCh; !errors.Is(eventsErr, ErrAborted) {
		t.Fatalf("expected Events() ErrAborted, got %v", eventsErr)
	}
	if stream.State() != ChatStreamStateAborted {
		t.Fatalf("State() = %q, want aborted", stream.State())
	}
	if stream.Next() {
		t.Fatal("Next() should return false after abort")
	}
	if !errors.Is(stream.Err(), ErrAborted) {
		t.Fatalf("stream.Err() = %v, want ErrAborted", stream.Err())
	}
	if got := body.closeCount.Load(); got != 1 {
		t.Fatalf("body.Close() count = %d, want 1", got)
	}

	// Idempotent Close() does not double-close body or change aborted state.
	_ = stream.Close()
	if got := body.closeCount.Load(); got != 1 {
		t.Fatalf("body.Close() count after Close() = %d, want 1", got)
	}
	if stream.State() != ChatStreamStateAborted {
		t.Fatalf("State() after Close() = %q, want aborted", stream.State())
	}

	// 2. Concurrent Next() blocked inside Read() unblocks immediately when context is canceled.
	blockedBody := newPausableReadCloser("data: {\"choices\":[{\"delta\":{\"content\":\"块\"}}]}\n\n")
	blockedResp, blockedRaw := mockSSEResponse(blockedBody)
	blockedCtx, blockedCancel := context.WithCancelCause(t.Context())
	defer blockedCancel(nil)

	blockedStream := newChatStream(blockedCtx, blockedResp, blockedRaw, true, nil)
	if !blockedStream.Next() {
		t.Fatalf("expected first event on blockedStream, err=%v", blockedStream.Err())
	}
	nextDone := make(chan bool, 1)
	go func() {
		nextDone <- blockedStream.Next()
	}()
	blockedCancel(errors.New("network timeout cancel"))
	if got := <-nextDone; got {
		t.Fatal("expected blocked Next() to return false after cancel")
	}
	if !errors.Is(blockedStream.Err(), ErrAborted) {
		t.Fatalf("blockedStream.Err() = %v, want ErrAborted", blockedStream.Err())
	}
	if blockedStream.State() != ChatStreamStateAborted {
		t.Fatalf("blockedStream.State() = %q, want aborted", blockedStream.State())
	}

	// 3. Pre-canceled context settles immediately.
	preCtx, preCancel := context.WithCancelCause(t.Context())
	preCancel(errors.New("pre-aborted"))
	preBody := newPausableReadCloser("")
	preResp, preRaw := mockSSEResponse(preBody)
	preStream := newChatStream(preCtx, preResp, preRaw, true, nil)
	if preStream.State() != ChatStreamStateAborted {
		t.Fatalf("pre-canceled State() = %q, want aborted", preStream.State())
	}
	if _, err := preStream.FinalResult(); !errors.Is(err, ErrAborted) {
		t.Fatalf("pre-canceled FinalResult() err = %v, want ErrAborted", err)
	}
}

func TestChatStreamMissingDoneFailsWithErrNetwork(t *testing.T) {
	truncated := []byte("data: {\"choices\":[{\"delta\":{\"content\":\"未写完的回复\"}}]}\n\n")

	// 1. FinalText / FinalResult fails with ErrNetwork when requireDone is true.
	resp1, raw1 := mockSSEResponse(newChunkedReadCloser(truncated))
	stream1 := newChatStream(t.Context(), resp1, raw1, true, nil)
	if _, err := stream1.FinalText(); !errors.Is(err, ErrNetwork) {
		t.Fatalf("FinalText() err = %v, want ErrNetwork", err)
	}
	if stream1.State() != ChatStreamStateFailed {
		t.Fatalf("State() = %q, want failed", stream1.State())
	}
	if _, err := stream1.FinalResult(); !errors.Is(err, ErrNetwork) {
		t.Fatalf("FinalResult() err = %v, want ErrNetwork", err)
	}

	// 2. Events() iteration also yields ErrNetwork after the partial delta.
	resp2, raw2 := mockSSEResponse(newChunkedReadCloser(truncated))
	stream2 := newChatStream(t.Context(), resp2, raw2, true, nil)
	var deltas []string
	var iterErr error
	for ev, err := range stream2.Events() {
		if err != nil {
			iterErr = err
			break
		}
		if ans, ok := ev.(ChatSSEAnswerEvent); ok {
			deltas = append(deltas, ans.TextDelta)
		}
	}
	if len(deltas) != 1 || deltas[0] != "未写完的回复" {
		t.Fatalf("deltas = %v, want [未写完的回复]", deltas)
	}
	if !errors.Is(iterErr, ErrNetwork) {
		t.Fatalf("Events() err = %v, want ErrNetwork", iterErr)
	}
	if stream2.State() != ChatStreamStateFailed {
		t.Fatalf("stream2.State() = %q, want failed", stream2.State())
	}

	// 3. requireDone=false completes cleanly on EOF without [DONE].
	resp3, raw3 := mockSSEResponse(newChunkedReadCloser(truncated))
	stream3 := newChatStream(t.Context(), resp3, raw3, false, nil)
	text3, err3 := stream3.FinalText()
	if err3 != nil || text3 != "未写完的回复" {
		t.Fatalf("requireDone=false FinalText() = (%q, %v), want (未写完的回复, nil)", text3, err3)
	}
	if stream3.State() != ChatStreamStateCompleted {
		t.Fatalf("stream3.State() = %q, want completed", stream3.State())
	}
}

func TestChatStreamEdgeCasesTrailingFrameAndChatTitleFormats(t *testing.T) {
	// Event: done with no data line + trailing frame without blank line + numeric/string duration.
	chunks := [][]byte{
		[]byte("event: chatTitle\ndata: {\"title\":\"服务端生成的标题\"}\n\n"),
		[]byte("event: workflowDuration\ndata: 2.5\n\n"),
		[]byte("data: {\"choices\":[{\"delta\":{\"content\":\"内容\"}}]}\n\n"),
		[]byte("event: done"),
	}
	resp, raw := mockSSEResponse(newChunkedReadCloser(chunks...))
	stream := newChatStream(t.Context(), resp, raw, true, nil)

	res, err := stream.FinalResult()
	if err != nil {
		t.Fatalf("FinalResult() error = %v", err)
	}
	if res.ChatTitle != "服务端生成的标题" || res.DurationSeconds != 2.5 || res.Text != "内容" {
		t.Fatalf("unexpected FinalResult: %+v", res)
	}
}

func TestChatStreamManualNextOwnershipAndFinalResult(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Second)
	defer cancel()

	// 1. Calling FinalResult()/FinalText() before Next() finishes returns ErrBadRequest without blocking or stealing frames.
	chunks := [][]byte{
		[]byte("event: answer\ndata: {\"choices\":[{\"delta\":{\"content\":\"第一段\"}}]}\n\n"),
		[]byte("event: answer\ndata: {\"choices\":[{\"delta\":{\"content\":\"第二段\"}}]}\n\n"),
		[]byte("data: [DONE]\n\n"),
	}
	resp, raw := mockSSEResponse(newChunkedReadCloser(chunks...))
	stream := newChatStream(ctx, resp, raw, true, nil)

	if !stream.Next() {
		t.Fatalf("expected first event from Next(), err=%v", stream.Err())
	}
	ev, ok := stream.Current().(ChatSSEAnswerEvent)
	if !ok || ev.TextDelta != "第一段" {
		t.Fatalf("unexpected first event: %#v", stream.Current())
	}

	if _, err := stream.FinalResult(); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("FinalResult() while Next() active = %v, want ErrBadRequest", err)
	}
	if _, err := stream.FinalText(); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("FinalText() while Next() active = %v, want ErrBadRequest", err)
	}

	var rest strings.Builder
	for stream.Next() {
		if answer, ok := stream.Current().(ChatSSEAnswerEvent); ok {
			rest.WriteString(answer.TextDelta)
		}
	}
	if err := stream.Err(); err != nil {
		t.Fatalf("stream.Err() after completing Next() = %v", err)
	}
	if rest.String() != "第二段" {
		t.Fatalf("remaining Next() text = %q, want 第二段", rest.String())
	}

	res, err := stream.FinalResult()
	if err != nil {
		t.Fatalf("FinalResult() after Next() completion error = %v", err)
	}
	if res.Text != "第一段第二段" {
		t.Fatalf("res.Text = %q, want 第一段第二段", res.Text)
	}
	if stream.State() != ChatStreamStateCompleted {
		t.Fatalf("stream.State() = %q, want completed", stream.State())
	}

	// Subsequent Events() iteration after Next()/FinalResult() remains single-use.
	var secondErr error
	for _, err := range stream.Events() {
		if err != nil {
			secondErr = err
		}
	}
	if secondErr == nil {
		t.Fatal("expected single-use error on Events() after Next()+FinalResult()")
	}

	// 2. Concurrent FinalText() while another goroutine is mid-Next() returns ErrBadRequest immediately without stealing subsequent frames.
	pr, pw := io.Pipe()
	t.Cleanup(func() {
		_ = pw.Close()
		_ = pr.Close()
	})
	resp2, raw2 := mockSSEResponse(pr)
	stream2 := newChatStream(ctx, resp2, raw2, true, nil)

	firstDone := make(chan error, 1)
	go func() {
		_, wErr := pw.Write([]byte("event: answer\ndata: {\"choices\":[{\"delta\":{\"content\":\"A\"}}]}\n\n"))
		firstDone <- wErr
	}()
	if !stream2.Next() {
		t.Fatalf("expected first concurrent event, err=%v", stream2.Err())
	}
	if wErr := <-firstDone; wErr != nil {
		t.Fatalf("write chunk A failed: %v", wErr)
	}

	nextBlocked := make(chan struct{})
	secondChunkReceived := make(chan string, 1)
	nextFinished := make(chan error, 1)
	go func() {
		close(nextBlocked)
		var collected strings.Builder
		for stream2.Next() {
			if answer, ok := stream2.Current().(ChatSSEAnswerEvent); ok {
				collected.WriteString(answer.TextDelta)
			}
		}
		secondChunkReceived <- collected.String()
		nextFinished <- stream2.Err()
	}()

	<-nextBlocked
	// Give Next() a moment to enter blocked Read on frame 2, then verify FinalText() rejects immediately.
	time.Sleep(15 * time.Millisecond)
	if _, err := stream2.FinalText(); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("concurrent FinalText() while Next() active = %v, want ErrBadRequest", err)
	}

	if _, err := pw.Write([]byte("event: answer\ndata: {\"choices\":[{\"delta\":{\"content\":\"B\"}}]}\n\n")); err != nil {
		t.Fatalf("write chunk B failed: %v", err)
	}
	if _, err := pw.Write([]byte("data: [DONE]\n\n")); err != nil {
		t.Fatalf("write DONE failed: %v", err)
	}
	_ = pw.Close()

	if gotRest := <-secondChunkReceived; gotRest != "B" {
		t.Fatalf("concurrent Next() received %q, want B (frame must not be stolen)", gotRest)
	}
	if err := <-nextFinished; err != nil {
		t.Fatalf("concurrent Next() err = %v", err)
	}
	finalTxt, err := stream2.FinalText()
	if err != nil || finalTxt != "AB" {
		t.Fatalf("FinalText() after Next() finished = (%q, %v), want (AB, nil)", finalTxt, err)
	}

	// 3. Early Close() releases pending ownership so FinalResult() returns partial snapshot without blocking.
	closeChunks := [][]byte{
		[]byte("event: answer\ndata: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n"),
		[]byte("event: answer\ndata: {\"choices\":[{\"delta\":{\"content\":\"ignored\"}}]}\n\n"),
		[]byte("data: [DONE]\n\n"),
	}
	closeResp, closeRaw := mockSSEResponse(newChunkedReadCloser(closeChunks...))
	closeStream := newChatStream(ctx, closeResp, closeRaw, true, nil)
	if !closeStream.Next() {
		t.Fatalf("expected first event before Close(), err=%v", closeStream.Err())
	}
	if err := closeStream.Close(); err != nil {
		t.Fatalf("Close() err = %v", err)
	}
	if closeStream.State() != ChatStreamStateClosed {
		t.Fatalf("State() after Close() = %q, want closed", closeStream.State())
	}
	closedRes, err := closeStream.FinalResult()
	if err != nil || closedRes.Text != "partial" {
		t.Fatalf("FinalResult() after Close() = (%+v, %v), want Text=partial", closedRes, err)
	}

	// 4. Exhausting Next() on an SSE error event allows FinalResult() to return that mapped conflict error.
	errChunks := [][]byte{
		[]byte("event: answer\ndata: {\"choices\":[{\"delta\":{\"content\":\"part\"}}]}\n\n"),
		[]byte("event: error\ndata: {\"httpStatus\":409,\"code\":409,\"statusText\":\"chatIsGenerating\",\"message\":\"Generating\",\"data\":{\"responseChatItemId\":\"sse-turn-9\"}}\n\n"),
		[]byte("data: [DONE]\n\n"),
	}
	errResp, errRaw := mockSSEResponse(newChunkedReadCloser(errChunks...))
	errStream := newChatStream(ctx, errResp, errRaw, true, nil)
	for errStream.Next() {
	}
	_, finalErr := errStream.FinalResult()
	if !errors.Is(finalErr, ErrConflict) {
		t.Fatalf("FinalResult() error = %v, want ErrConflict", finalErr)
	}
	var apiErr *APIError
	if !errors.As(finalErr, &apiErr) {
		t.Fatalf("expected *APIError, got %T", finalErr)
	}
	conflict, ok := apiErr.ChatGeneratingConflict()
	if !ok || conflict.ResponseChatItemID != "sse-turn-9" {
		t.Fatalf("ChatGeneratingConflict() = (%+v, %v), want sse-turn-9", conflict, ok)
	}
}
