package fastgpt

import (
	"context"
	"iter"
	"slices"
)

const (
	defaultPageSize   = 20
	maxServerPageSize = 500
)

type pagerConfig struct {
	pageSize    int
	hasPageSize bool
	maxItems    int
	hasMaxItems bool
	maxPages    int
	hasMaxPages bool
	reqOpts     []RequestOption
}

// PagerOption configures auto-pagination behavior across offset, pageNum, and cursor pagers.
type PagerOption func(*pagerConfig)

// WithPageSize overrides the number of items requested per page (clamped to [1, 500]).
func WithPageSize(size int) PagerOption {
	return func(cfg *pagerConfig) {
		cfg.pageSize = size
		cfg.hasPageSize = true
	}
}

// WithMaxItems caps the total number of items yielded before stopping auto-pagination.
func WithMaxItems(limit int) PagerOption {
	return func(cfg *pagerConfig) {
		cfg.maxItems = limit
		cfg.hasMaxItems = true
	}
}

// WithMaxPages caps the total number of pages fetched before stopping auto-pagination.
func WithMaxPages(limit int) PagerOption {
	return func(cfg *pagerConfig) {
		cfg.maxPages = limit
		cfg.hasMaxPages = true
	}
}

// WithPagerRequestOptions attaches RequestOptions forwarded to every underlying page request.
func WithPagerRequestOptions(opts ...RequestOption) PagerOption {
	return func(cfg *pagerConfig) {
		cfg.reqOpts = append(cfg.reqOpts, opts...)
	}
}

func resolvePagerConfig(fallbackPageSize int, opts []PagerOption) pagerConfig {
	cfg := pagerConfig{
		pageSize: fallbackPageSize,
	}
	for _, opt := range opts {
		if opt != nil {
			opt(&cfg)
		}
	}
	if !cfg.hasPageSize && cfg.pageSize <= 0 {
		cfg.pageSize = defaultPageSize
	}
	cfg.pageSize = min(max(1, cfg.pageSize), maxServerPageSize)
	return cfg
}

// PageSlice represents a single page returned by an offset or pageNum endpoint.
type PageSlice[T any] struct {
	List     []T
	Total    Opt[int]
	PageSize int
	HasMore  Opt[bool]
}

// CursorPageSlice represents a single page returned by a cursor-based endpoint.
type CursorPageSlice[T any, C any] struct {
	List       []T
	NextCursor *C
}

// Pager provides both cursor-style (Next/Current/Err) and Go 1.24 iterator-style
// (Pages/All/Collect) auto-pagination over FastGPT list endpoints.
type Pager[T any] struct {
	fetchNextPage func() ([]T, bool, error)

	buf       []T
	bufIdx    int
	current   T
	err       error
	exhausted bool
	started   bool
}

func newPager[T any](fetchNextPage func() ([]T, bool, error)) *Pager[T] {
	return &Pager[T]{
		fetchNextPage: fetchNextPage,
	}
}

func normalizePagerContext(ctx context.Context) context.Context {
	if ctx == nil {
		return context.Background()
	}
	return ctx
}

func checkPagerContext(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return newAbortedError("Auto-pagination was aborted", "", "", context.Cause(ctx), nil)
	}
	return nil
}

func clampPageItems[T any](items []T, yieldedCount int, cfg pagerConfig) []T {
	if cfg.hasMaxItems && yieldedCount+len(items) > cfg.maxItems {
		remaining := max(0, cfg.maxItems-yieldedCount)
		return slices.Clone(items[:remaining])
	}
	return items
}

// Next advances the pager to the next item and reports whether an item is available.
func (p *Pager[T]) Next() bool {
	if p == nil || p.err != nil || p.exhausted {
		return false
	}
	p.started = true

	for {
		if p.bufIdx < len(p.buf) {
			p.current = p.buf[p.bufIdx]
			p.bufIdx++
			return true
		}
		if p.fetchNextPage == nil {
			p.exhausted = true
			return false
		}

		page, done, err := p.fetchNextPage()
		if err != nil {
			p.err = err
			p.exhausted = true
			return false
		}
		if done && len(page) == 0 {
			p.exhausted = true
			return false
		}
		p.buf = page
		p.bufIdx = 0
		if done {
			// Still drain p.buf before stopping on the following Next() call.
			p.fetchNextPage = nil
		}
		if len(page) == 0 {
			p.exhausted = true
			return false
		}
	}
}

// Current returns the current item populated by the most recent Next call.
func (p *Pager[T]) Current() T {
	if p == nil {
		var zero T
		return zero
	}
	return p.current
}

// Err returns the terminal error encountered during pagination, if any.
func (p *Pager[T]) Err() error {
	if p == nil {
		return nil
	}
	return p.err
}

// Pages returns an iterator yielding each fetched page slice until exhaustion or error.
func (p *Pager[T]) Pages() iter.Seq2[[]T, error] {
	return func(yield func([]T, error) bool) {
		if p == nil {
			return
		}
		if p.err != nil {
			yield(nil, p.err)
			return
		}
		if p.started {
			yield(nil, newMappedAPIError("pager can only be iterated once", 0, 0, "", "", "", nil, nil))
			return
		}
		p.started = true
		if p.exhausted || p.fetchNextPage == nil {
			return
		}

		for {
			page, done, err := p.fetchNextPage()
			if err != nil {
				p.err = err
				p.exhausted = true
				yield(nil, err)
				return
			}
			if len(page) > 0 {
				if !yield(page, nil) {
					p.exhausted = true
					return
				}
			}
			if done {
				p.exhausted = true
				return
			}
		}
	}
}

// All returns an iterator yielding each individual item across all pages.
func (p *Pager[T]) All() iter.Seq2[T, error] {
	return func(yield func(T, error) bool) {
		var zero T
		for page, err := range p.Pages() {
			if err != nil {
				yield(zero, err)
				return
			}
			for _, item := range page {
				if !yield(item, nil) {
					return
				}
			}
		}
	}
}

// Collect drains all remaining pages and returns the accumulated items slice.
func (p *Pager[T]) Collect() ([]T, error) {
	var results []T
	for page, err := range p.Pages() {
		if err != nil {
			return nil, err
		}
		results = append(results, page...)
	}
	return results, nil
}

// NewOffsetPaginator builds a *Pager[T] using offset + pageSize pagination semantics.
func NewOffsetPaginator[T any](
	ctx context.Context,
	initialOffset int,
	defaultSize int,
	fetchPage func(ctx context.Context, offset int, pageSize int) (PageSlice[T], error),
	opts ...PagerOption,
) *Pager[T] {
	ctx = normalizePagerContext(ctx)
	cfg := resolvePagerConfig(defaultSize, opts)
	offset := max(0, initialOffset)
	yieldedCount := 0
	pageCount := 0

	return newPager(func() ([]T, bool, error) {
		if err := checkPagerContext(ctx); err != nil {
			return nil, true, err
		}
		if cfg.hasMaxPages && pageCount >= cfg.maxPages {
			return nil, true, nil
		}
		if cfg.hasMaxItems && yieldedCount >= cfg.maxItems {
			return nil, true, nil
		}

		requestedPageSize := cfg.pageSize
		if cfg.hasMaxItems {
			requestedPageSize = max(1, min(cfg.pageSize, cfg.maxItems-yieldedCount))
		}

		page, err := fetchPage(ctx, offset, requestedPageSize)
		if err != nil {
			return nil, true, err
		}

		items := page.List
		if len(items) == 0 {
			return nil, true, nil
		}

		sliced := clampPageItems(items, yieldedCount, cfg)
		yieldedCount += len(sliced)
		offset += len(items)
		pageCount++

		if cfg.hasMaxItems && yieldedCount >= cfg.maxItems {
			return sliced, true, nil
		}
		if cfg.hasMaxPages && pageCount >= cfg.maxPages {
			return sliced, true, nil
		}
		if hasMore, ok := page.HasMore.Get(); ok && !hasMore {
			return sliced, true, nil
		}
		if total, ok := page.Total.Get(); ok && total >= 0 {
			// Rely on actual offset vs total so server-side pageSize clamping never drops trailing pages.
			return sliced, offset >= total, nil
		}
		if hasMore, ok := page.HasMore.Get(); ok && hasMore {
			return sliced, false, nil
		}

		effectiveSize := requestedPageSize
		if page.PageSize > 0 {
			effectiveSize = page.PageSize
		}
		return sliced, len(items) < effectiveSize, nil
	})
}

// NewPageNumPaginator builds a *Pager[T] using 1-indexed pageNum + pageSize pagination semantics.
func NewPageNumPaginator[T any](
	ctx context.Context,
	initialPageNum int,
	defaultSize int,
	fetchPage func(ctx context.Context, pageNum int, pageSize int) (PageSlice[T], error),
	opts ...PagerOption,
) *Pager[T] {
	ctx = normalizePagerContext(ctx)
	cfg := resolvePagerConfig(defaultSize, opts)
	safeInitialPageNum := max(1, initialPageNum)
	pageNum := safeInitialPageNum
	loadedFromStart := 0
	yieldedCount := 0
	pageCount := 0

	return newPager(func() ([]T, bool, error) {
		if err := checkPagerContext(ctx); err != nil {
			return nil, true, err
		}
		if cfg.hasMaxPages && pageCount >= cfg.maxPages {
			return nil, true, nil
		}
		if cfg.hasMaxItems && yieldedCount >= cfg.maxItems {
			return nil, true, nil
		}

		currentPageNum := pageNum
		page, err := fetchPage(ctx, currentPageNum, cfg.pageSize)
		if err != nil {
			return nil, true, err
		}

		items := page.List
		if len(items) == 0 {
			return nil, true, nil
		}

		sliced := clampPageItems(items, yieldedCount, cfg)
		yieldedCount += len(sliced)
		loadedFromStart += len(items)
		pageNum++
		pageCount++

		if cfg.hasMaxItems && yieldedCount >= cfg.maxItems {
			return sliced, true, nil
		}
		if cfg.hasMaxPages && pageCount >= cfg.maxPages {
			return sliced, true, nil
		}
		if hasMore, ok := page.HasMore.Get(); ok {
			return sliced, !hasMore, nil
		}

		if total, ok := page.Total.Get(); ok && total >= 0 {
			if page.PageSize > 0 {
				endOffset := (currentPageNum-1)*page.PageSize + len(items)
				return sliced, endOffset >= total, nil
			}
			if safeInitialPageNum == 1 {
				return sliced, loadedFromStart >= total, nil
			}
			// When starting from page > 1 without server pageSize, only stop early on a full page
			// that clearly reaches total; short pages keep probing with the same baseline pageSize.
			if len(items) >= cfg.pageSize {
				endOffset := (currentPageNum-1)*cfg.pageSize + len(items)
				return sliced, endOffset >= total, nil
			}
			return sliced, false, nil
		}

		expectedSize := cfg.pageSize
		if page.PageSize > 0 {
			expectedSize = page.PageSize
		}
		return sliced, len(items) < expectedSize, nil
	})
}

// NewCursorPaginator builds a *Pager[T] using cursor + nextCursor pagination semantics.
func NewCursorPaginator[T any, C any](
	ctx context.Context,
	initialCursor *C,
	fetchPage func(ctx context.Context, cursor *C) (CursorPageSlice[T, C], error),
	opts ...PagerOption,
) *Pager[T] {
	ctx = normalizePagerContext(ctx)
	cfg := resolvePagerConfig(defaultPageSize, opts)
	cursor := initialCursor
	yieldedCount := 0
	pageCount := 0

	return newPager(func() ([]T, bool, error) {
		if err := checkPagerContext(ctx); err != nil {
			return nil, true, err
		}
		if cfg.hasMaxPages && pageCount >= cfg.maxPages {
			return nil, true, nil
		}
		if cfg.hasMaxItems && yieldedCount >= cfg.maxItems {
			return nil, true, nil
		}

		page, err := fetchPage(ctx, cursor)
		if err != nil {
			return nil, true, err
		}

		items := page.List
		if len(items) == 0 {
			return nil, true, nil
		}

		sliced := clampPageItems(items, yieldedCount, cfg)
		yieldedCount += len(sliced)
		pageCount++

		if cfg.hasMaxItems && yieldedCount >= cfg.maxItems {
			return sliced, true, nil
		}
		if cfg.hasMaxPages && pageCount >= cfg.maxPages {
			return sliced, true, nil
		}
		if page.NextCursor == nil {
			return sliced, true, nil
		}
		cursor = page.NextCursor
		return sliced, false, nil
	})
}
