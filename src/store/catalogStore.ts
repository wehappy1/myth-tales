import { proxy } from '@umijs/max';

type CatalogStore = {
  version: number;
};

export const catalogStore = proxy<CatalogStore>({
  version: 0,
});

export function bumpCatalog() {
  catalogStore.version += 1;
}

export default catalogStore;
