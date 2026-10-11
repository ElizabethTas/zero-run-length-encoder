import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  encode,
  decode,
  DEFAULT_ESCAPE,
  MAX_RUN_PER_MARKER,
} from '../src/core.js';

// Helper: construct a Uint8Array from variadic byte arguments.
function bytes(...arr) {
  return Uint8Array.from(arr);
}

// Helper: construct a Uint8Array of `count` zeros.
function zeros(count) {
  return new Uint8Array(count);
}

// Empty input is a valid stream and must round-trip to empty output.
test('empty input round-trips', () => {
  const enc = encode(bytes());
  assert.deepEqual(enc, bytes());
  assert.deepEqual(decode(enc), bytes());
});

// A single non-zero byte passes through untouched.
test('single non-zero byte passes through', () => {
  const enc = encode(bytes(0x41));
  assert.deepEqual(enc, bytes(0x41));
  assert.deepEqual(decode(enc), bytes(0x41));
});

// A single zero is a run of length 1 → escape + 0.
test('single zero is a run of one', () => {
  const enc = encode(bytes(0));
  assert.deepEqual(enc, bytes(DEFAULT_ESCAPE, 0));
  assert.deepEqual(decode(enc), bytes(0));
});

// Interspersed single zeros and non-zeros must each be handled.
test('interspersed single zeros', () => {
  const input = bytes(1, 0, 2, 0, 3);
  const enc = encode(input);
  assert.deepEqual(enc, bytes(1, DEFAULT_ESCAPE, 0, 2, DEFAULT_ESCAPE, 0, 3));
  assert.deepEqual(decode(enc), input);
});

// A run exactly at the marker capacity boundary.
test('run of exactly MAX_RUN_PER_MARKER fits in one marker', () => {
  const input = zeros(MAX_RUN_PER_MARKER);
  const enc = encode(input);
  assert.deepEqual(enc, bytes(DEFAULT_ESCAPE, MAX_RUN_PER_MARKER - 1));
  assert.deepEqual(decode(enc), input);
});

// A run just over capacity is split across two markers.
test('run of MAX_RUN_PER_MARKER + 1 splits across two markers', () => {
  const input = zeros(MAX_RUN_PER_MARKER + 1);
  const enc = encode(input);
  assert.deepEqual(
    enc,
    bytes(DEFAULT_ESCAPE, MAX_RUN_PER_MARKER - 1, DEFAULT_ESCAPE, 0),
  );
  assert.deepEqual(decode(enc), input);
});

// A very long run exercises the split logic repeatedly.
test('long run of 1000 zeros splits correctly', () => {
  const input = zeros(1000);
  const enc = encode(input);
  // 1000 = 255*3 + 235 → four markers, last count byte = 234.
  assert.deepEqual(
    enc,
    bytes(
      DEFAULT_ESCAPE, 254,
      DEFAULT_ESCAPE, 254,
      DEFAULT_ESCAPE, 254,
      DEFAULT_ESCAPE, 234,
    ),
  );
  assert.deepEqual(decode(enc), input);
});

// The escape byte itself must be escaped in the input.
test('escape byte in input is escaped', () => {
  const input = bytes(DEFAULT_ESCAPE);
  const enc = encode(input);
  assert.deepEqual(enc, bytes(DEFAULT_ESCAPE, 0xff));
  assert.deepEqual(decode(enc), input);
});

// Mix of zeros, escape bytes, and ordinary bytes.
test('mixed payload round-trips', () => {
  const input = bytes(0, 0, 5, DEFAULT_ESCAPE, 0, 7, 0, 0, 0);
  const enc = encode(input);
  assert.deepEqual(
    enc,
    bytes(
      DEFAULT_ESCAPE, 1,            // run of 2 zeros
      5,                             // literal
      DEFAULT_ESCAPE, 0xff,          // escaped escape byte
      DEFAULT_ESCAPE, 0,             // single zero
      7,                             // literal
      DEFAULT_ESCAPE, 2,             // run of 3 zeros
    ),
  );
  assert.deepEqual(decode(enc), input);
});

// Multiple consecutive escape bytes in the input.
test('consecutive escape bytes round-trip', () => {
  const input = bytes(DEFAULT_ESCAPE, DEFAULT_ESCAPE, DEFAULT_ESCAPE);
  const enc = encode(input);
  assert.deepEqual(
    enc,
    bytes(DEFAULT_ESCAPE, 0xff, DEFAULT_ESCAPE, 0xff, DEFAULT_ESCAPE, 0xff),
  );
  assert.deepEqual(decode(enc), input);
});

// Trailing escape byte without a count byte is malformed.
test('decode throws on trailing escape byte', () => {
  const bad = bytes(1, DEFAULT_ESCAPE);
  assert.throws(() => decode(bad), /truncated input/);
});

// Non-byte values in input are rejected by the encoder.
test('encode throws on non-byte input value', () => {
  assert.throws(() => encode([0, 256]), RangeError);
});

// Non-byte values in input are rejected by the decoder.
test('decode throws on non-byte input value', () => {
  assert.throws(() => decode([0, 256]), RangeError);
});

// escape = 0 is forbidden because zeros would be indistinguishable.
test('encode rejects escape of zero', () => {
  assert.throws(() => encode(bytes(0), { escape: 0 }), RangeError);
});

// decode must use the same escape value the encoder used.
test('round-trip with custom escape 0xFE', () => {
  const input = bytes(0, 0, 0xfe, 0, 1);
  const enc = encode(input, { escape: 0xfe });
  assert.deepEqual(
    enc,
    bytes(0xfe, 1, 0xfe, 0xff, 0xfe, 0, 1),
  );
  assert.deepEqual(decode(enc, { escape: 0xfe }), input);
});

// Accepts plain arrays in addition to Uint8Array.
test('accepts plain array input', () => {
  const input = [0, 1, 0, 0];
  const enc = encode(input);
  assert.deepEqual(Array.from(enc), [DEFAULT_ESCAPE, 0, 1, DEFAULT_ESCAPE, 1]);
  assert.deepEqual(Array.from(decode(enc)), input);
});

// Non-array / non-Uint8Array input is rejected.
test('rejects non-array input', () => {
  assert.throws(() => encode('abc'), TypeError);
  assert.throws(() => decode('abc'), TypeError);
});
