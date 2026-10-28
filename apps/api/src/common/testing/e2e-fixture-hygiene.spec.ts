import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guards the e2e suite against one specific, already-bitten defect class.
 *
 * `feature_pricing.feature_key` is a globally unique key in a database every
 * e2e suite shares and runs against one after another (`--runInBand`). A suite
 * that writes a pricing row and never deletes it makes every *later* suite
 * that creates the same key fail its `beforeAll` with a unique-constraint
 * error — while passing when run alone, because the first suite to clean up
 * removes the stray row. template-engine.e2e-spec.ts did exactly that.
 *
 * This is a static check (no database needed), so it runs in the normal unit
 * suite and catches the leak in review instead of as a flaky joint-run failure.
 */
describe('e2e fixture hygiene', () => {
  const e2eDir = join(__dirname, '../../../test');
  const specs = readdirSync(e2eDir).filter((file) => file.endsWith('.e2e-spec.ts'));

  it('finds the e2e specs (guards against this check silently scanning nothing)', () => {
    expect(specs.length).toBeGreaterThan(10);
  });

  it.each(specs)('%s deletes every feature_pricing row it writes', (file) => {
    const source = readFileSync(join(e2eDir, file), 'utf8');
    const writesPricing = /featurePricing\.(create|createMany|upsert)\(/.test(source);
    if (!writesPricing) return;
    expect(source).toMatch(/featurePricing\.deleteMany\(/);
  });
});
