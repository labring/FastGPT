package fastgpt

import (
	"bytes"
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"io"
	"iter"
	"maps"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"sync"
	"unicode/utf8"
)

// ChatSSEEventType identifies the kind of SSE event emitted by FastGPT streaming endpoints.
type ChatSSEEventType string

const (
	ChatSSEEventAnswer            ChatSSEEventType = "answer"
	ChatSSEEventFlowNodeStatus    ChatSSEEventType = "flowNodeStatus"
	ChatSSEEventFlowNodeResponse  ChatSSEEventType = "flowNodeResponse"
	ChatSSEEventFlowResponses     ChatSSEEventType = "flowResponses"
	ChatSSEEventInteractive       ChatSSEEventType = "interactive"
	ChatSSEEventToolCall          ChatSSEEventType = "toolCall"
	ChatSSEEventToolParams        ChatSSEEventType = "toolParams"
	ChatSSEEventToolResponse      ChatSSEEventType = "toolResponse"
	ChatSSEEventChatTitle         ChatSSEEventType = "chatTitle"
	ChatSSEEventWorkflowDuration  ChatSSEEventType = "workflowDuration"
	ChatSSEEventUpdateVariables   ChatSSEEventType = "updateVariables"
	ChatSSEEventPlan              ChatSSEEventType = "plan"
	ChatSSEEventPlanStatus        ChatSSEEventType = "planStatus"
	ChatSSEEventSandboxStatus     ChatSSEEventType = "sandboxStatus"
	ChatSSEEventSkillCall         ChatSSEEventType = "skillCall"
	ChatSSEEventResumePhase       ChatSSEEventType = "resumePhase"
	ChatSSEEventResumeCompleted   ChatSSEEventType = "resumeCompleted"
	ChatSSEEventResumeUnavailable ChatSSEEventType = "resumeUnavailable"
	ChatSSEEventError             ChatSSEEventType = "error"
	ChatSSEEventUnknown           ChatSSEEventType = "unknown"
)

// ChatSSEEvent is a sealed union implemented by all typed FastGPT SSE events.
type ChatSSEEvent interface {
	isChatSSEEvent()
	EventType() ChatSSEEventType
}

// ChatSSEAnswerEvent represents an incremental answer or fastAnswer delta chunk.
type ChatSSEAnswerEvent struct {
	TextDelta      string
	ReasoningDelta string
	Fast           bool
	Raw            json.RawMessage
}

func (ChatSSEAnswerEvent) isChatSSEEvent()             {}
func (ChatSSEAnswerEvent) EventType() ChatSSEEventType { return ChatSSEEventAnswer }

// ChatSSEFlowNodeStatusEvent reports progress status for a workflow node.
type ChatSSEFlowNodeStatusEvent struct {
	Status string
	Name   string
	Raw    json.RawMessage
}

func (ChatSSEFlowNodeStatusEvent) isChatSSEEvent()             {}
func (ChatSSEFlowNodeStatusEvent) EventType() ChatSSEEventType { return ChatSSEEventFlowNodeStatus }

// ChatSSEFlowNodeResponseEvent carries a single executed workflow node response payload.
type ChatSSEFlowNodeResponseEvent struct {
	Data map[string]any
	Raw  json.RawMessage
}

func (ChatSSEFlowNodeResponseEvent) isChatSSEEvent() {}
func (ChatSSEFlowNodeResponseEvent) EventType() ChatSSEEventType {
	return ChatSSEEventFlowNodeResponse
}

// ChatSSEFlowResponsesEvent carries a batch of executed workflow node responses.
type ChatSSEFlowResponsesEvent struct {
	Data []map[string]any
	Raw  json.RawMessage
}

func (ChatSSEFlowResponsesEvent) isChatSSEEvent()             {}
func (ChatSSEFlowResponsesEvent) EventType() ChatSSEEventType { return ChatSSEEventFlowResponses }

// ChatSSEInteractiveEvent carries a workflow interactive pause payload.
type ChatSSEInteractiveEvent struct {
	Interactive *InteractivePayload
	Value       any
	Raw         json.RawMessage
}

func (ChatSSEInteractiveEvent) isChatSSEEvent()             {}
func (ChatSSEInteractiveEvent) EventType() ChatSSEEventType { return ChatSSEEventInteractive }

// ChatSSEToolCallEvent represents a toolCall SSE event.
type ChatSSEToolCallEvent struct {
	Data any
	Raw  json.RawMessage
}

func (ChatSSEToolCallEvent) isChatSSEEvent()             {}
func (ChatSSEToolCallEvent) EventType() ChatSSEEventType { return ChatSSEEventToolCall }

// ChatSSEToolParamsEvent represents a toolParams SSE event.
type ChatSSEToolParamsEvent struct {
	Data any
	Raw  json.RawMessage
}

func (ChatSSEToolParamsEvent) isChatSSEEvent()             {}
func (ChatSSEToolParamsEvent) EventType() ChatSSEEventType { return ChatSSEEventToolParams }

// ChatSSEToolResponseEvent represents a toolResponse SSE event.
type ChatSSEToolResponseEvent struct {
	Data any
	Raw  json.RawMessage
}

func (ChatSSEToolResponseEvent) isChatSSEEvent()             {}
func (ChatSSEToolResponseEvent) EventType() ChatSSEEventType { return ChatSSEEventToolResponse }

// ChatSSEChatTitleEvent delivers an updated conversation title generated during the run.
type ChatSSEChatTitleEvent struct {
	Title string
	Raw   json.RawMessage
}

func (ChatSSEChatTitleEvent) isChatSSEEvent()             {}
func (ChatSSEChatTitleEvent) EventType() ChatSSEEventType { return ChatSSEEventChatTitle }

// ChatSSEWorkflowDurationEvent reports workflow execution duration in seconds.
type ChatSSEWorkflowDurationEvent struct {
	DurationSeconds float64
	Raw             json.RawMessage
}

func (ChatSSEWorkflowDurationEvent) isChatSSEEvent() {}
func (ChatSSEWorkflowDurationEvent) EventType() ChatSSEEventType {
	return ChatSSEEventWorkflowDuration
}

// ChatSSEUpdateVariablesEvent carries updated workflow session variables.
type ChatSSEUpdateVariablesEvent struct {
	Variables map[string]any
	Raw       json.RawMessage
}

func (ChatSSEUpdateVariablesEvent) isChatSSEEvent()             {}
func (ChatSSEUpdateVariablesEvent) EventType() ChatSSEEventType { return ChatSSEEventUpdateVariables }

// ChatSSEPlanEvent represents a plan SSE event.
type ChatSSEPlanEvent struct {
	Data any
	Raw  json.RawMessage
}

func (ChatSSEPlanEvent) isChatSSEEvent()             {}
func (ChatSSEPlanEvent) EventType() ChatSSEEventType { return ChatSSEEventPlan }

// ChatSSEPlanStatusEvent represents a planStatus SSE event.
type ChatSSEPlanStatusEvent struct {
	Data any
	Raw  json.RawMessage
}

func (ChatSSEPlanStatusEvent) isChatSSEEvent()             {}
func (ChatSSEPlanStatusEvent) EventType() ChatSSEEventType { return ChatSSEEventPlanStatus }

// ChatSSESandboxStatusEvent represents a sandboxStatus SSE event.
type ChatSSESandboxStatusEvent struct {
	Data any
	Raw  json.RawMessage
}

func (ChatSSESandboxStatusEvent) isChatSSEEvent()             {}
func (ChatSSESandboxStatusEvent) EventType() ChatSSEEventType { return ChatSSEEventSandboxStatus }

// ChatSSESkillCallEvent represents a skillCall SSE event.
type ChatSSESkillCallEvent struct {
	Data any
	Raw  json.RawMessage
}

func (ChatSSESkillCallEvent) isChatSSEEvent()             {}
func (ChatSSESkillCallEvent) EventType() ChatSSEEventType { return ChatSSEEventSkillCall }

// ChatSSEResumePhaseEvent carries a plain-text resumePhase transition (e.g. catchup, live).
type ChatSSEResumePhaseEvent struct {
	Phase string
	Raw   string
}

func (ChatSSEResumePhaseEvent) isChatSSEEvent()             {}
func (ChatSSEResumePhaseEvent) EventType() ChatSSEEventType { return ChatSSEEventResumePhase }

// ChatSSEResumeCompletedEvent represents a resumeCompleted SSE event.
type ChatSSEResumeCompletedEvent struct {
	Data any
	Raw  json.RawMessage
}

func (ChatSSEResumeCompletedEvent) isChatSSEEvent()             {}
func (ChatSSEResumeCompletedEvent) EventType() ChatSSEEventType { return ChatSSEEventResumeCompleted }

// ChatSSEResumeUnavailableEvent represents a resumeUnavailable SSE event.
type ChatSSEResumeUnavailableEvent struct {
	Data any
	Raw  json.RawMessage
}

func (ChatSSEResumeUnavailableEvent) isChatSSEEvent() {}
func (ChatSSEResumeUnavailableEvent) EventType() ChatSSEEventType {
	return ChatSSEEventResumeUnavailable
}

// ChatSSEErrorEvent wraps a mid-stream error reported by the server.
type ChatSSEErrorEvent struct {
	Error error
	Raw   json.RawMessage
}

func (ChatSSEErrorEvent) isChatSSEEvent()             {}
func (ChatSSEErrorEvent) EventType() ChatSSEEventType { return ChatSSEEventError }

// ChatSSEUnknownEvent preserves unrecognized SSE events without dropping data.
type ChatSSEUnknownEvent struct {
	Event string
	Data  any
	Raw   json.RawMessage
}

func (ChatSSEUnknownEvent) isChatSSEEvent()             {}
func (ChatSSEUnknownEvent) EventType() ChatSSEEventType { return ChatSSEEventUnknown }

// ChatStreamState represents the terminal or active lifecycle state of a ChatStream.
type ChatStreamState string

const (
	ChatStreamStatePending   ChatStreamState = "pending"
	ChatStreamStateCompleted ChatStreamState = "completed"
	ChatStreamStateClosed    ChatStreamState = "closed"
	ChatStreamStateAborted   ChatStreamState = "aborted"
	ChatStreamStateFailed    ChatStreamState = "failed"
)

// ChatStreamFinalResult holds the aggregated output accumulated across a ChatStream.
type ChatStreamFinalResult struct {
	Text            string
	ReasoningText   string
	ChatTitle       string
	DurationSeconds float64
	HasDuration     bool
	Interactive     *InteractivePayload
	RawInteractive  any
	Variables       map[string]any
	NodeResponses   []map[string]any
	Quotes          []any
}

type rawSSEFrame struct {
	event string
	data  string
	id    string
	hasID bool
}

var utf8BOM = []byte{0xEF, 0xBB, 0xBF}

type sseFrameReader struct {
	r             io.Reader
	buf           []byte
	pos           int
	eof           bool
	pendingErr    error
	bomChecked    bool
	skipLeadingLF bool

	currentEvent string
	currentID    string
	hasID        bool
	dataLines    []string
}

func newSSEFrameReader(r io.Reader) *sseFrameReader {
	return &sseFrameReader{
		r:   r,
		buf: make([]byte, 0, 4096),
	}
}

func (r *sseFrameReader) unreadBytes() []byte {
	return r.buf[r.pos:]
}

func (r *sseFrameReader) consume(n int) {
	r.pos += n
	if r.pos == len(r.buf) {
		r.buf = r.buf[:0]
		r.pos = 0
		return
	}
	if r.pos > 0 && r.pos >= cap(r.buf)/2 {
		remaining := copy(r.buf, r.buf[r.pos:])
		r.buf = r.buf[:remaining]
		r.pos = 0
	}
}

func (r *sseFrameReader) decodeLine(raw []byte) string {
	if !r.bomChecked {
		r.bomChecked = true
		raw, _ = bytes.CutPrefix(raw, utf8BOM)
	}
	if !utf8.Valid(raw) {
		raw = bytes.ToValidUTF8(raw, []byte("\ufffd"))
	}
	return string(raw)
}

func (r *sseFrameReader) flushFrame() (rawSSEFrame, bool) {
	if len(r.dataLines) == 0 && r.currentEvent == "" {
		return rawSSEFrame{}, false
	}
	frame := rawSSEFrame{
		event: r.currentEvent,
		data:  strings.Join(r.dataLines, "\n"),
		id:    r.currentID,
		hasID: r.hasID,
	}
	r.currentEvent = ""
	r.currentID = ""
	r.hasID = false
	r.dataLines = nil
	return frame, true
}

func (r *sseFrameReader) processLine(line string) (rawSSEFrame, bool) {
	if line == "" {
		return r.flushFrame()
	}
	if strings.HasPrefix(line, ":") {
		return rawSSEFrame{}, false
	}

	field, value, found := strings.Cut(line, ":")
	if found {
		value, _ = strings.CutPrefix(value, " ")
	}

	switch field {
	case "event":
		r.currentEvent = value
	case "data":
		r.dataLines = append(r.dataLines, value)
	case "id":
		if !strings.ContainsRune(value, '\x00') {
			r.currentID = value
			r.hasID = true
		}
	}
	return rawSSEFrame{}, false
}

func (r *sseFrameReader) readFrame() (rawSSEFrame, bool, error) {
	var scratch [4096]byte

	for {
		if r.skipLeadingLF {
			rem := r.unreadBytes()
			if len(rem) > 0 {
				if rem[0] == '\n' {
					r.consume(1)
				}
				r.skipLeadingLF = false
			}
		}

		rem := r.unreadBytes()
		if idx := bytes.IndexAny(rem, "\r\n"); idx >= 0 {
			sep := rem[idx]
			lineBytes := rem[:idx]
			consumeLen := idx + 1
			if sep == '\r' {
				if idx+1 < len(rem) {
					if rem[idx+1] == '\n' {
						consumeLen = idx + 2
					}
				} else {
					r.skipLeadingLF = true
				}
			}
			line := r.decodeLine(lineBytes)
			r.consume(consumeLen)
			if frame, ok := r.processLine(line); ok {
				return frame, true, nil
			}
			continue
		}

		if r.pendingErr != nil {
			err := r.pendingErr
			r.pendingErr = nil
			return rawSSEFrame{}, false, err
		}

		if r.eof {
			if rem := r.unreadBytes(); len(rem) > 0 {
				line := r.decodeLine(rem)
				r.consume(len(rem))
				if frame, ok := r.processLine(line); ok {
					return frame, true, nil
				}
			}
			if frame, ok := r.flushFrame(); ok {
				return frame, true, nil
			}
			return rawSSEFrame{}, false, io.EOF
		}

		n, err := r.r.Read(scratch[:])
		if n > 0 {
			r.buf = append(r.buf, scratch[:n]...)
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				r.eof = true
			} else {
				r.pendingErr = err
			}
		}
	}
}

func parseChatSSEFrame(frame rawSSEFrame, raw RawResponse, extraSecrets []string) (ChatSSEEvent, bool) {
	trimmedData := strings.TrimSpace(frame.data)
	if trimmedData == "[DONE]" || frame.event == "done" {
		return nil, true
	}

	if frame.event == "resumePhase" {
		return ChatSSEResumePhaseEvent{
			Phase: trimmedData,
			Raw:   frame.data,
		}, false
	}

	var decoded any
	var rawJSON json.RawMessage
	jsonOK := false
	if frame.data != "" {
		rawBytes := []byte(frame.data)
		if err := json.Unmarshal(rawBytes, &decoded); err == nil {
			jsonOK = true
			rawJSON = json.RawMessage(bytes.Clone(rawBytes))
		}
	}
	payload := decoded
	if !jsonOK {
		payload = frame.data
		if encoded, err := json.Marshal(frame.data); err == nil {
			rawJSON = json.RawMessage(encoded)
		}
	}

	eventName := cmp.Or(frame.event, "message")

	switch eventName {
	case "message", "answer", "fastAnswer":
		if obj, ok := toStringAnyMap(payload); ok {
			if errObj, hasErr := toStringAnyMap(obj["error"]); hasErr {
				errMsg := cmp.Or(stringField(errObj, "message"), "Stream error received")
				statusText := stringField(errObj, "type")
				mapped := newMappedAPIError(errMsg, 0, 0, statusText, raw.RequestID, raw.URL, nil, extraSecrets)
				return ChatSSEErrorEvent{
					Error: mapped,
					Raw:   redactRawJSON(rawJSON, extraSecrets),
				}, false
			}
		}
		textDelta, reasoningDelta := extractChunkDeltas(payload)
		return ChatSSEAnswerEvent{
			TextDelta:      textDelta,
			ReasoningDelta: reasoningDelta,
			Fast:           eventName == "fastAnswer",
			Raw:            rawJSON,
		}, false

	case "error":
		errMsg := "SSE workflow execution error"
		httpStatus := 0
		serverCode := 0
		statusText := ""
		var dataRaw json.RawMessage

		if strVal, ok := payload.(string); ok && strVal != "" {
			errMsg = strVal
		} else if obj, ok := toStringAnyMap(payload); ok {
			errMsg = cmp.Or(
				stringField(obj, "message"),
				stringField(obj, "statusText"),
				"SSE workflow execution error",
			)
			httpStatus = intField(obj, "httpStatus")
			serverCode = intField(obj, "code")
			statusText = stringField(obj, "statusText")
			if rawData, exists := obj["data"]; exists && rawData != nil {
				if encoded, err := json.Marshal(rawData); err == nil {
					dataRaw = encoded
				}
			}
		} else if trimmedData != "" {
			errMsg = trimmedData
		}

		mapped := newMappedAPIErrorWithData(
			redactSecrets(errMsg, extraSecrets),
			httpStatus,
			serverCode,
			statusText,
			raw.RequestID,
			raw.URL,
			dataRaw,
			nil,
			extraSecrets,
		)
		return ChatSSEErrorEvent{
			Error: mapped,
			Raw:   redactRawJSON(rawJSON, extraSecrets),
		}, false

	case "flowNodeStatus":
		obj, _ := toStringAnyMap(payload)
		return ChatSSEFlowNodeStatusEvent{
			Status: stringField(obj, "status"),
			Name:   stringField(obj, "name"),
			Raw:    rawJSON,
		}, false

	case "flowNodeResponse":
		obj, ok := toStringAnyMap(payload)
		if !ok {
			obj = map[string]any{"value": payload}
		}
		return ChatSSEFlowNodeResponseEvent{
			Data: obj,
			Raw:  rawJSON,
		}, false

	case "flowResponses":
		var list []map[string]any
		if arr, ok := payload.([]any); ok {
			for _, item := range arr {
				if m, ok := toStringAnyMap(item); ok {
					list = append(list, m)
				}
			}
		}
		if list == nil {
			list = []map[string]any{}
		}
		return ChatSSEFlowResponsesEvent{
			Data: list,
			Raw:  rawJSON,
		}, false

	case "interactive":
		interactiveVal := payload
		if obj, ok := toStringAnyMap(payload); ok {
			if inner, exists := obj["interactive"]; exists {
				interactiveVal = inner
			}
		}
		return ChatSSEInteractiveEvent{
			Interactive: parseInteractivePayload(interactiveVal, 12),
			Value:       interactiveVal,
			Raw:         rawJSON,
		}, false

	case "toolCall":
		return ChatSSEToolCallEvent{Data: payload, Raw: rawJSON}, false
	case "toolParams":
		return ChatSSEToolParamsEvent{Data: payload, Raw: rawJSON}, false
	case "toolResponse":
		return ChatSSEToolResponseEvent{Data: payload, Raw: rawJSON}, false

	case "chatTitle":
		title := ""
		if obj, ok := toStringAnyMap(payload); ok {
			title = stringField(obj, "title")
		} else if strVal, ok := payload.(string); ok {
			title = strVal
		}
		return ChatSSEChatTitleEvent{
			Title: title,
			Raw:   rawJSON,
		}, false

	case "workflowDuration":
		seconds := 0.0
		switch v := payload.(type) {
		case float64:
			seconds = v
		case map[string]any:
			if n, ok := v["durationSeconds"].(float64); ok {
				seconds = n
			}
		case string:
			if parsed, err := strconv.ParseFloat(strings.TrimSpace(v), 64); err == nil {
				seconds = parsed
			}
		}
		return ChatSSEWorkflowDurationEvent{
			DurationSeconds: seconds,
			Raw:             rawJSON,
		}, false

	case "updateVariables":
		vars, ok := toStringAnyMap(payload)
		if !ok {
			vars = map[string]any{}
		}
		return ChatSSEUpdateVariablesEvent{
			Variables: vars,
			Raw:       rawJSON,
		}, false

	case "plan":
		return ChatSSEPlanEvent{Data: payload, Raw: rawJSON}, false
	case "planStatus":
		return ChatSSEPlanStatusEvent{Data: payload, Raw: rawJSON}, false
	case "sandboxStatus":
		return ChatSSESandboxStatusEvent{Data: payload, Raw: rawJSON}, false
	case "skillCall":
		return ChatSSESkillCallEvent{Data: payload, Raw: rawJSON}, false
	case "resumeCompleted":
		return ChatSSEResumeCompletedEvent{Data: payload, Raw: rawJSON}, false
	case "resumeUnavailable":
		return ChatSSEResumeUnavailableEvent{Data: payload, Raw: rawJSON}, false

	default:
		return ChatSSEUnknownEvent{
			Event: eventName,
			Data:  payload,
			Raw:   rawJSON,
		}, false
	}
}

func redactRawJSON(raw json.RawMessage, extraSecrets []string) json.RawMessage {
	if len(raw) == 0 {
		return raw
	}
	return json.RawMessage(redactSecrets(string(raw), extraSecrets))
}

func stringField(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	v, _ := m[key].(string)
	return v
}

func intField(m map[string]any, key string) int {
	if m == nil {
		return 0
	}
	v, ok := m[key].(float64)
	if !ok {
		return 0
	}
	return int(v)
}

func extractChunkDeltas(payload any) (string, string) {
	obj, ok := toStringAnyMap(payload)
	if !ok {
		return "", ""
	}
	choices, ok := obj["choices"].([]any)
	if !ok || len(choices) == 0 {
		return "", ""
	}
	firstChoice, ok := toStringAnyMap(choices[0])
	if !ok {
		return "", ""
	}
	delta, ok := toStringAnyMap(firstChoice["delta"])
	if !ok {
		return "", ""
	}
	textDelta, _ := delta["content"].(string)
	reasoningDelta, _ := delta["reasoning_content"].(string)
	return textDelta, reasoningDelta
}

// ChatStream consumes a FastGPT SSE response stream with incremental event iteration,
// automatic context cancellation cleanup, and post-stream result aggregation.
type ChatStream struct {
	ctx          context.Context
	resp         *http.Response
	raw          RawResponse
	requireDone  bool
	extraSecrets []string

	reader    *sseFrameReader
	stopAfter func() bool
	doneCh    chan struct{}

	closeBodyOnce sync.Once
	bodyCloseErr  error

	// readMu 始终在 mu 之外获取，串行化底层帧读取，防止主动 FinalResult 与并发 Next 竞争 reader；
	// Close / abort 绝不获取 readMu，以保证关闭响应体可立即唤醒阻塞中的读操作。
	readMu          sync.Mutex
	mu              sync.Mutex
	state           ChatStreamState
	started         bool
	eventsActive    bool
	receivedDone    bool
	err             error
	streamError     error
	current         ChatSSEEvent
	text            strings.Builder
	reasoningText   strings.Builder
	chatTitle       string
	durationSeconds float64
	hasDuration     bool
	interactive     *InteractivePayload
	rawInteractive  any
	variables       map[string]any
	nodeResponses   []map[string]any
	quotes          []any
}

func newChatStream(
	ctx context.Context,
	resp *http.Response,
	raw RawResponse,
	requireDone bool,
	extraSecrets []string,
) *ChatStream {
	if ctx == nil {
		ctx = context.Background()
	}
	rawCopy := raw
	if raw.Header != nil {
		rawCopy.Header = raw.Header.Clone()
	}

	s := &ChatStream{
		ctx:          ctx,
		resp:         resp,
		raw:          rawCopy,
		requireDone:  requireDone,
		extraSecrets: cloneStringSlice(extraSecrets),
		doneCh:       make(chan struct{}),
		state:        ChatStreamStatePending,
	}

	if resp == nil || resp.Body == nil {
		s.state = ChatStreamStateFailed
		s.err = newNetworkError(
			"chat stream response body is nil",
			rawCopy.URL,
			io.ErrUnexpectedEOF,
			s.extraSecrets,
		)
		close(s.doneCh)
		return s
	}

	s.reader = newSSEFrameReader(resp.Body)

	// Handle already-canceled contexts synchronously before registering context.AfterFunc.
	if ctx.Err() != nil {
		s.abort(context.Cause(ctx))
		return s
	}

	stop := context.AfterFunc(ctx, func() {
		s.abort(context.Cause(ctx))
	})
	s.mu.Lock()
	if s.state == ChatStreamStatePending {
		s.stopAfter = stop
	} else {
		stop()
	}
	s.mu.Unlock()

	return s
}

func (s *ChatStream) closeBody() error {
	s.closeBodyOnce.Do(func() {
		if s.resp != nil && s.resp.Body != nil {
			s.bodyCloseErr = s.resp.Body.Close()
		}
	})
	return s.bodyCloseErr
}

func (s *ChatStream) cleanupTransport(stop func() bool) error {
	if stop != nil {
		stop()
	}
	return s.closeBody()
}

func (s *ChatStream) createAbortError(cause error) error {
	if cause != nil {
		var apiErr *APIError
		if errors.As(cause, &apiErr) && errors.Is(cause, ErrAborted) {
			return cause
		}
	}
	return newAbortedError(
		"Chat stream was aborted",
		s.raw.RequestID,
		s.raw.URL,
		cause,
		s.extraSecrets,
	)
}

func (s *ChatStream) finalizeLocked(state ChatStreamState, err error) func() bool {
	if s.state != ChatStreamStatePending {
		stop := s.stopAfter
		s.stopAfter = nil
		return stop
	}
	s.state = state
	s.err = err
	stop := s.stopAfter
	s.stopAfter = nil
	close(s.doneCh)
	return stop
}

func (s *ChatStream) abort(cause error) {
	s.mu.Lock()
	if s.state != ChatStreamStatePending {
		stop := s.stopAfter
		s.stopAfter = nil
		s.mu.Unlock()
		_ = s.cleanupTransport(stop)
		return
	}
	abortErr := s.createAbortError(cause)
	stop := s.finalizeLocked(ChatStreamStateAborted, abortErr)
	s.mu.Unlock()

	_ = s.cleanupTransport(stop)
}

func (s *ChatStream) accumulateEventLocked(event ChatSSEEvent) {
	switch ev := event.(type) {
	case ChatSSEErrorEvent:
		if s.streamError == nil {
			s.streamError = ev.Error
		}
	case ChatSSEAnswerEvent:
		s.text.WriteString(ev.TextDelta)
		s.reasoningText.WriteString(ev.ReasoningDelta)
	case ChatSSEChatTitleEvent:
		s.chatTitle = ev.Title
	case ChatSSEWorkflowDurationEvent:
		s.durationSeconds = ev.DurationSeconds
		s.hasDuration = true
	case ChatSSEInteractiveEvent:
		s.interactive = ev.Interactive
		s.rawInteractive = ev.Value
	case ChatSSEUpdateVariablesEvent:
		if s.variables == nil {
			s.variables = make(map[string]any, len(ev.Variables))
		}
		maps.Copy(s.variables, ev.Variables)
	case ChatSSEFlowNodeResponseEvent:
		s.nodeResponses = append(s.nodeResponses, ev.Data)
		if quotes, ok := ev.Data["quoteList"].([]any); ok {
			s.quotes = append(s.quotes, quotes...)
		}
	case ChatSSEFlowResponsesEvent:
		for _, item := range ev.Data {
			s.nodeResponses = append(s.nodeResponses, item)
			if quotes, ok := item["quoteList"].([]any); ok {
				s.quotes = append(s.quotes, quotes...)
			}
		}
	}
}

func (s *ChatStream) buildFinalResultSnapshotLocked() *ChatStreamFinalResult {
	var varsCopy map[string]any
	if s.variables != nil {
		varsCopy = maps.Clone(s.variables)
	}
	return &ChatStreamFinalResult{
		Text:            s.text.String(),
		ReasoningText:   s.reasoningText.String(),
		ChatTitle:       s.chatTitle,
		DurationSeconds: s.durationSeconds,
		HasDuration:     s.hasDuration,
		Interactive:     s.interactive,
		RawInteractive:  s.rawInteractive,
		Variables:       varsCopy,
		NodeResponses:   slices.Clone(s.nodeResponses),
		Quotes:          slices.Clone(s.quotes),
	}
}

// Response returns the sanitized HTTP response metadata captured during stream setup.
func (s *ChatStream) Response() RawResponse {
	if s == nil {
		return RawResponse{}
	}
	raw := s.raw
	if s.raw.Header != nil {
		raw.Header = s.raw.Header.Clone()
	}
	return raw
}

// State returns the current lifecycle state of the stream (pending, completed, closed, aborted, or failed).
func (s *ChatStream) State() ChatStreamState {
	if s == nil {
		return ChatStreamStateClosed
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state
}

// Current returns the event produced by the most recent Next call.
func (s *ChatStream) Current() ChatSSEEvent {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.current
}

// Err returns the terminal error encountered by the stream, if any.
func (s *ChatStream) Err() error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.err
}

// Next advances the stream to the next SSE event, returning false when the stream ends or fails.
func (s *ChatStream) Next() bool {
	if s == nil {
		return false
	}
	s.mu.Lock()
	if s.state != ChatStreamStatePending {
		s.mu.Unlock()
		return false
	}
	s.started = true
	s.mu.Unlock()

	return s.nextStep()
}

func (s *ChatStream) nextStep() bool {
	s.readMu.Lock()
	defer s.readMu.Unlock()

	for {
		s.mu.Lock()
		if s.state != ChatStreamStatePending {
			s.mu.Unlock()
			return false
		}
		if s.ctx.Err() != nil {
			abortErr := s.createAbortError(context.Cause(s.ctx))
			stop := s.finalizeLocked(ChatStreamStateAborted, abortErr)
			s.mu.Unlock()
			_ = s.cleanupTransport(stop)
			return false
		}
		s.mu.Unlock()

		frame, ok, readErr := s.reader.readFrame()

		s.mu.Lock()
		if s.state != ChatStreamStatePending {
			s.mu.Unlock()
			return false
		}
		if s.ctx.Err() != nil {
			abortErr := s.createAbortError(context.Cause(s.ctx))
			stop := s.finalizeLocked(ChatStreamStateAborted, abortErr)
			s.mu.Unlock()
			_ = s.cleanupTransport(stop)
			return false
		}

		if readErr != nil && !errors.Is(readErr, io.EOF) {
			netErr := newNetworkError(readErr.Error(), s.raw.URL, readErr, s.extraSecrets)
			stop := s.finalizeLocked(ChatStreamStateFailed, netErr)
			s.mu.Unlock()
			_ = s.cleanupTransport(stop)
			return false
		}

		if !ok {
			var stop func() bool
			if s.streamError != nil {
				stop = s.finalizeLocked(ChatStreamStateFailed, s.streamError)
			} else if s.requireDone && !s.receivedDone {
				netErr := newNetworkError(
					"Chat stream ended unexpectedly before receiving [DONE] termination frame",
					s.raw.URL,
					io.ErrUnexpectedEOF,
					s.extraSecrets,
				)
				stop = s.finalizeLocked(ChatStreamStateFailed, netErr)
			} else {
				stop = s.finalizeLocked(ChatStreamStateCompleted, nil)
			}
			s.mu.Unlock()
			_ = s.cleanupTransport(stop)
			return false
		}

		ev, isDone := parseChatSSEFrame(frame, s.raw, s.extraSecrets)
		if isDone {
			s.receivedDone = true
			var stop func() bool
			if s.streamError != nil {
				stop = s.finalizeLocked(ChatStreamStateFailed, s.streamError)
			} else {
				stop = s.finalizeLocked(ChatStreamStateCompleted, nil)
			}
			s.mu.Unlock()
			_ = s.cleanupTransport(stop)
			return false
		}

		s.accumulateEventLocked(ev)
		s.current = ev
		s.mu.Unlock()
		return true
	}
}

// Events returns a Go 1.24 iterator over parsed ChatSSEEvent items and any terminal error.
// Breaking early automatically closes the underlying stream and settles its state to closed.
func (s *ChatStream) Events() iter.Seq2[ChatSSEEvent, error] {
	return func(yield func(ChatSSEEvent, error) bool) {
		if s == nil {
			return
		}
		s.mu.Lock()
		alreadyStarted := s.started
		if !alreadyStarted {
			s.started = true
			s.eventsActive = true
		}
		s.mu.Unlock()

		if alreadyStarted {
			yield(nil, newMappedAPIError(
				"ChatStream can only be iterated once",
				0,
				0,
				"",
				s.raw.RequestID,
				s.raw.URL,
				nil,
				s.extraSecrets,
			))
			return
		}

		defer func() {
			s.mu.Lock()
			s.eventsActive = false
			s.mu.Unlock()
			_ = s.Close()
		}()

		for s.nextStep() {
			ev := s.Current()
			if !yield(ev, nil) {
				return
			}
		}
		if err := s.Err(); err != nil {
			yield(nil, err)
		}
	}
}

// FinalResult consumes or awaits completion of the stream and returns the aggregated response summary.
// If the stream failed, aborted, or received an SSE error event, FinalResult returns that terminal error.
func (s *ChatStream) FinalResult() (*ChatStreamFinalResult, error) {
	if s == nil {
		return nil, newNetworkError("chat stream is nil", "", nil, nil)
	}

	s.mu.Lock()
	if s.state != ChatStreamStatePending {
		err := s.err
		snap := s.buildFinalResultSnapshotLocked()
		s.mu.Unlock()
		if err != nil {
			return nil, err
		}
		return snap, nil
	}
	waitForEvents := s.eventsActive
	if !waitForEvents {
		s.started = true
	}
	s.mu.Unlock()

	if waitForEvents {
		<-s.doneCh
	} else {
		for s.nextStep() {
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.err != nil {
		return nil, s.err
	}
	return s.buildFinalResultSnapshotLocked(), nil
}

// FinalText consumes or awaits completion of the stream and returns the aggregated assistant text.
func (s *ChatStream) FinalText() (string, error) {
	res, err := s.FinalResult()
	if err != nil {
		return "", err
	}
	return res.Text, nil
}

// Close closes the underlying HTTP response body and finalizes any pending stream as closed
// (or failed if an SSE error event was already observed).
func (s *ChatStream) Close() error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	var stop func() bool
	if s.state == ChatStreamStatePending {
		if s.streamError != nil {
			stop = s.finalizeLocked(ChatStreamStateFailed, s.streamError)
		} else {
			stop = s.finalizeLocked(ChatStreamStateClosed, nil)
		}
	} else {
		stop = s.stopAfter
		s.stopAfter = nil
	}
	s.mu.Unlock()

	return s.cleanupTransport(stop)
}
