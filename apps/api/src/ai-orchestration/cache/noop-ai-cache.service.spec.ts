import { NoopAiCacheService } from './noop-ai-cache.service';

describe('NoopAiCacheService', () => {
  const cache = new NoopAiCacheService();

  it('get() always returns null — never a false cache hit', async () => {
    await expect(cache.get('any-key')).resolves.toBeNull();
  });

  it('set() resolves without throwing and does not affect a subsequent get()', async () => {
    await expect(cache.set('any-key', { some: 'value' })).resolves.toBeUndefined();
    await expect(cache.get('any-key')).resolves.toBeNull();
  });

  it('delete() resolves without throwing', async () => {
    await expect(cache.delete('any-key')).resolves.toBeUndefined();
  });
});
