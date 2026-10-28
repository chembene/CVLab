describe('dynamic-import.util', () => {
  it('compiles a distinct function source on every module evaluation (cross-context cache regression)', () => {
    // V8 caches `new Function(...)` by source text across contexts; the cached
    // function keeps the import() hook of the first Jest test environment that
    // compiled it, which later fails with "Test environment has been torn
    // down". Each evaluation of the module must therefore compile new text.
    const RealFunction = Function;
    const bodies: string[] = [];
    const spy = jest.spyOn(globalThis, 'Function').mockImplementation(((...args: string[]) => {
      const body = args[args.length - 1] ?? '';
      if (body.includes('import(specifier)')) bodies.push(body);
      return RealFunction(...args);
    }) as never);

    try {
      jest.isolateModules(() => {
        require('./dynamic-import.util');
      });
      jest.isolateModules(() => {
        require('./dynamic-import.util');
      });
    } finally {
      spy.mockRestore();
    }

    expect(bodies).toHaveLength(2);
    expect(bodies[0]).not.toBe(bodies[1]);
  });
});
