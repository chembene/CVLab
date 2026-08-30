import { ConflictException } from '@nestjs/common';

/** 409 — the request is well-formed; it's the current wallet balance that conflicts with it. Thrown by spend/reverse/negative-adjustment when the atomic conditional decrement affects 0 rows. */
export class InsufficientCreditsException extends ConflictException {
  constructor(message = 'Insufficient credit balance.') {
    super(message);
  }
}
