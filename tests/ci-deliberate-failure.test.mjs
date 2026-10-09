import test from 'node:test';
import assert from 'node:assert/strict';

test('CI validation fixture fails deliberately to prove artifact gating', () => {
  assert.fail('Intentional CI validation failure: APK artifacts must be skipped when tests fail.');
});
