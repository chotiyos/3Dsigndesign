// Unit tests do not need the application's CSS compilation plugins.
export default {
  // Geometry tests run in parallel and can exceed the 5 s default on a busy machine.
  test: { pool: 'threads', testTimeout: 30_000 },
}
