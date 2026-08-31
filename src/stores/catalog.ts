import { proxy } from 'valtio';

/** 分类统计等目录信息变更时递增，触发 Layout 重新拉取 */
export const catalogStore = proxy({
  version: 0,
});

export function bumpCatalog() {
  catalogStore.version += 1;
}
