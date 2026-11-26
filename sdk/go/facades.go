package fastgpt

import "context"

func resolveInitialOffset(offsetOpt Opt[int], pageNumOpt Opt[int], effectivePageSize int) int {
	// 与服务端 normalizePagination 保持一致：显式传入的 offset（含 0）优先于 pageNum；
	// 仅传入 pageNum 时按 (pageNum - 1) * pageSize 换算起始偏移量。
	if off, ok := offsetOpt.Get(); ok {
		return max(0, off)
	}
	if pageNum, ok := pageNumOpt.Get(); ok {
		return max(0, (max(1, pageNum)-1)*max(1, effectivePageSize))
	}
	return 0
}

func newOffsetListPager[P any, R any, Item any](
	ctx context.Context,
	baseParams P,
	offsetOpt Opt[int],
	pageNumOpt Opt[int],
	defaultSize int,
	prepare func(params *P, offset int, pageSize int),
	fetch func(ctx context.Context, params P, reqOpts ...RequestOption) (R, error),
	extract func(res R) ([]Item, int),
	opts ...PagerOption,
) *Pager[Item] {
	cfg := resolvePagerConfig(defaultSize, opts)
	initialOffset := resolveInitialOffset(offsetOpt, pageNumOpt, cfg.pageSize)
	return NewOffsetPaginator(
		ctx,
		initialOffset,
		defaultSize,
		func(pageCtx context.Context, offset int, pageSize int) (PageSlice[Item], error) {
			pageParams := baseParams
			prepare(&pageParams, offset, pageSize)
			res, err := fetch(pageCtx, pageParams, cfg.reqOpts...)
			if err != nil {
				return PageSlice[Item]{}, err
			}
			list, total := extract(res)
			return PageSlice[Item]{
				List:  list,
				Total: Int(total),
			}, nil
		},
		opts...,
	)
}

// AppsLogsService wraps AppsLogsResource with cursor and offset auto-pagination helpers.
type AppsLogsService struct {
	*AppsLogsResource
}

// SearchAutoPaging automatically paginates application chat logs (POST /core/app/logs/search) by cursor.
func (s *AppsLogsService) SearchAutoPaging(
	ctx context.Context,
	params AppsLogsSearchParams,
	opts ...PagerOption,
) *Pager[AppsLogsSearchResListItem] {
	cfg := resolvePagerConfig(defaultPageSize, opts)
	var initialCursor *AppsLogsSearchParamsCursor
	if cur, ok := params.Cursor.Get(); ok {
		initialCursor = &cur
	}
	baseParams := params
	baseParams.Cursor = Opt[AppsLogsSearchParamsCursor]{}

	return NewCursorPaginator(
		ctx,
		initialCursor,
		func(pageCtx context.Context, cursor *AppsLogsSearchParamsCursor) (CursorPageSlice[AppsLogsSearchResListItem, AppsLogsSearchParamsCursor], error) {
			pageParams := baseParams
			if cursor != nil {
				pageParams.Cursor = Some(*cursor)
			}
			res, err := s.Search(pageCtx, pageParams, cfg.reqOpts...)
			if err != nil {
				return CursorPageSlice[AppsLogsSearchResListItem, AppsLogsSearchParamsCursor]{}, err
			}
			var next *AppsLogsSearchParamsCursor
			if res.NextCursor != nil {
				next = &AppsLogsSearchParamsCursor{
					Timestamp: res.NextCursor.Timestamp,
					ID:        res.NextCursor.ID,
				}
			}
			return CursorPageSlice[AppsLogsSearchResListItem, AppsLogsSearchParamsCursor]{
				List:       res.List,
				NextCursor: next,
			}, nil
		},
		opts...,
	)
}

// ListUsersAutoPaging automatically paginates application log users by offset.
func (s *AppsLogsService) ListUsersAutoPaging(
	ctx context.Context,
	params AppsLogsListUsersParams,
	opts ...PagerOption,
) *Pager[AppsLogsListUsersResListItem] {
	return newOffsetListPager(
		ctx,
		params,
		params.Offset,
		params.PageNum,
		params.PageSize.Or(0),
		func(p *AppsLogsListUsersParams, offset int, pageSize int) {
			p.PageNum = Opt[int]{}
			p.Offset = Int(offset)
			p.PageSize = Int(pageSize)
		},
		s.ListUsers,
		func(res *AppsLogsListUsersRes) ([]AppsLogsListUsersResListItem, int) {
			return res.List, int(res.Total)
		},
		opts...,
	)
}

// AppsService exposes application resources and enhanced log helpers on Client.Apps.
type AppsService struct {
	*AppsResource
	Logs *AppsLogsService
}

func newAppsService(c *Client) *AppsService {
	res := newAppsResource(c)
	return &AppsService{
		AppsResource: res,
		Logs:         &AppsLogsService{AppsLogsResource: res.Logs},
	}
}

// ChatHistoriesService wraps ChatHistoriesResource with offset auto-pagination.
type ChatHistoriesService struct {
	*ChatHistoriesResource
}

// ListAutoPaging automatically paginates chat histories by offset.
func (s *ChatHistoriesService) ListAutoPaging(
	ctx context.Context,
	params ChatHistoriesListParams,
	opts ...PagerOption,
) *Pager[ChatHistoriesListResListItem] {
	return newOffsetListPager(
		ctx,
		params,
		params.Offset,
		params.PageNum,
		params.PageSize.Or(0),
		func(p *ChatHistoriesListParams, offset int, pageSize int) {
			p.PageNum = Opt[int]{}
			p.Offset = Int(offset)
			p.PageSize = Int(pageSize)
		},
		s.List,
		func(res *ChatHistoriesListRes) ([]ChatHistoriesListResListItem, int) {
			return res.List, int(res.Total)
		},
		opts...,
	)
}

// ChatRecordsService wraps ChatRecordsResource with offset auto-pagination.
type ChatRecordsService struct {
	*ChatRecordsResource
}

// ListAutoPaging automatically paginates chat message records by offset.
func (s *ChatRecordsService) ListAutoPaging(
	ctx context.Context,
	params ChatRecordsListParams,
	opts ...PagerOption,
) *Pager[map[string]any] {
	return newOffsetListPager(
		ctx,
		params,
		params.Offset,
		params.PageNum,
		params.PageSize.Or(0),
		func(p *ChatRecordsListParams, offset int, pageSize int) {
			p.PageNum = Opt[int]{}
			p.Offset = Int(offset)
			p.PageSize = Int(pageSize)
		},
		s.List,
		func(res *ChatRecordsListRes) ([]map[string]any, int) {
			return res.List, res.Total
		},
		opts...,
	)
}

// ChatService exposes chat completions, histories, records, feedbacks, and interactive helpers on Client.Chat.
type ChatService struct {
	*ChatResource
	Histories   *ChatHistoriesService
	Records     *ChatRecordsService
	Interactive *InteractiveService
}

func newChatService(c *Client) *ChatService {
	res := newChatResource(c)
	return &ChatService{
		ChatResource: res,
		Histories:    &ChatHistoriesService{ChatHistoriesResource: res.Histories},
		Records:      &ChatRecordsService{ChatRecordsResource: res.Records},
		Interactive:  newInteractiveService(res),
	}
}

// DatasetsCollectionsService wraps DatasetsCollectionsResource with offset auto-pagination.
type DatasetsCollectionsService struct {
	*DatasetsCollectionsResource
}

// ListAutoPaging automatically paginates dataset collections by offset.
func (s *DatasetsCollectionsService) ListAutoPaging(
	ctx context.Context,
	params DatasetsCollectionsListParams,
	opts ...PagerOption,
) *Pager[DatasetsCollectionsListResListItem] {
	return newOffsetListPager(
		ctx,
		params,
		params.Offset,
		params.PageNum,
		params.PageSize.Or(0),
		func(p *DatasetsCollectionsListParams, offset int, pageSize int) {
			p.PageNum = Opt[int]{}
			p.Offset = Int(offset)
			p.PageSize = Int(pageSize)
		},
		s.List,
		func(res *DatasetsCollectionsListRes) ([]DatasetsCollectionsListResListItem, int) {
			return res.List, int(res.Total)
		},
		opts...,
	)
}

// DatasetsDataService wraps DatasetsDataResource with offset auto-pagination.
type DatasetsDataService struct {
	*DatasetsDataResource
}

// ListAutoPaging automatically paginates dataset collection data chunks by offset.
func (s *DatasetsDataService) ListAutoPaging(
	ctx context.Context,
	params DatasetsDataListParams,
	opts ...PagerOption,
) *Pager[DatasetsDataListResListItem] {
	return newOffsetListPager(
		ctx,
		params,
		params.Offset,
		params.PageNum,
		params.PageSize.Or(0),
		func(p *DatasetsDataListParams, offset int, pageSize int) {
			p.PageNum = Opt[int]{}
			p.Offset = Int(offset)
			p.PageSize = Int(pageSize)
		},
		s.List,
		func(res *DatasetsDataListRes) ([]DatasetsDataListResListItem, int) {
			return res.List, int(res.Total)
		},
		opts...,
	)
}

// DatasetsService exposes dataset resources and collection/data auto-pagination on Client.Datasets.
type DatasetsService struct {
	*DatasetsResource
	Collections *DatasetsCollectionsService
	Data        *DatasetsDataService
}

func newDatasetsService(c *Client) *DatasetsService {
	res := newDatasetsResource(c)
	return &DatasetsService{
		DatasetsResource: res,
		Collections:      &DatasetsCollectionsService{DatasetsCollectionsResource: res.Collections},
		Data:             &DatasetsDataService{DatasetsDataResource: res.Data},
	}
}

// ListAutoPaging automatically paginates accessible datasets by offset.
func (s *DatasetsService) ListAutoPaging(
	ctx context.Context,
	params DatasetsListParams,
	opts ...PagerOption,
) *Pager[DatasetsListResListItem] {
	return newOffsetListPager(
		ctx,
		params,
		params.Offset,
		params.PageNum,
		params.PageSize.Or(0),
		func(p *DatasetsListParams, offset int, pageSize int) {
			p.PageNum = Opt[int]{}
			p.Offset = Int(offset)
			p.PageSize = Int(pageSize)
		},
		s.List,
		func(res *DatasetsListRes) ([]DatasetsListResListItem, int) {
			return res.List, int(res.Total)
		},
		opts...,
	)
}

// ModelsService exposes model catalog, public list, and summary endpoints on Client.Models.
type ModelsService struct {
	*ModelsResource
}

func newModelsService(c *Client) *ModelsService {
	return &ModelsService{
		ModelsResource: newModelsResource(c),
	}
}
