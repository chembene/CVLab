import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { BCRYPT_SALT_ROUNDS } from './auth.constants';

/**
 * Password hashing/verification via bcrypt, per prompts/05-security.md.
 * Never stores or logs plaintext — callers pass plaintext in, this class
 * never returns it or writes it anywhere.
 */
@Injectable()
export class PasswordService {
  private dummyHashPromise: Promise<string> | null = null;

  hash(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, BCRYPT_SALT_ROUNDS);
  }

  verify(plainPassword: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, passwordHash);
  }

  /**
   * A valid bcrypt hash of a random value, computed once and cached. Used by
   * AuthService when the looked-up user doesn't exist, so login takes
   * approximately the same time whether or not the email is registered —
   * bcrypt.compare's cost depends only on the hash's cost factor, not on
   * when the hash was generated, so caching doesn't weaken the defense.
   */
  async getDummyHash(): Promise<string> {
    if (!this.dummyHashPromise) {
      this.dummyHashPromise = bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_SALT_ROUNDS);
    }
    return this.dummyHashPromise;
  }
}
