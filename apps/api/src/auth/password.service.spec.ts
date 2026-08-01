import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes a password to a bcrypt hash distinct from the plaintext', async () => {
    const hash = await service.hash('Sup3rSecret!');
    expect(hash).not.toBe('Sup3rSecret!');
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it('produces a different hash each time (unique salt)', async () => {
    const [hashA, hashB] = await Promise.all([
      service.hash('Sup3rSecret!'),
      service.hash('Sup3rSecret!'),
    ]);
    expect(hashA).not.toBe(hashB);
  });

  it('verifies a correct password against its hash', async () => {
    const hash = await service.hash('Sup3rSecret!');
    await expect(service.verify('Sup3rSecret!', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await service.hash('Sup3rSecret!');
    await expect(service.verify('WrongPassword!', hash)).resolves.toBe(false);
  });

  it('produces a stable, cached dummy hash usable for timing-safe comparisons', async () => {
    const [dummyA, dummyB] = await Promise.all([service.getDummyHash(), service.getDummyHash()]);
    expect(dummyA).toBe(dummyB);
    expect(dummyA).toMatch(/^\$2[aby]\$/);
  });
});
