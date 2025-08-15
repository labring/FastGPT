# 服务端资源版本 ID 缓存方案

## 背景

FastGPT 会采用多节点部署方式，有部分数据缓存会存储在内存里。当需要使用这部分数据时（不管是通过 API 获取，还是后端服务自己获取），都是直接拉取内存数据，这可能会导致数据不一致问题，尤其是用户通过 API 更新数据后再获取，就容易获取未修改数据的节点。

## 解决方案

1. 给每一个缓存数据加上一个版本 ID。
2. 获取该数据时候，不直接引用该数据，而是通过一个 function 获取，该 function 可选的传入一个 versionId。
3. 获取数据时，先检查该 versionId 与 redis 中，资源版本id 与传入的 versionId 是否一致。
4. 如果数据一致，则直接返回数据。
5. 如果数据不一致，则重新获取数据，并返回最新的 versionId。调用方则需要更新其缓存的 versionId。

## 代码方案

* 获取和更新缓存的代码，直接复用 FastGPT/packages/service/common/redis/cache.ts
* 每个资源，自己维护一个 cacheKey
* 每次更新资源/触发拉取最新资源时，都需要更新 cacheKey 的值。

## 涉及的业务

* [ ] FastGPT/projects/app/src/pages/api/common/system/getInitData.ts，获取初始数据