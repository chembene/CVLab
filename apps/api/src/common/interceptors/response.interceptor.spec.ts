import { of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  it('wraps the handler result in the success envelope', (done) => {
    const interceptor = new ResponseInterceptor<{ foo: string }>();
    const context = {} as ExecutionContext;
    const next: CallHandler = { handle: () => of({ foo: 'bar' }) };

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result).toEqual({ success: true, data: { foo: 'bar' } });
      done();
    });
  });
});
