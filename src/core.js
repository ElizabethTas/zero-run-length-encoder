/**
 * Zero Run Length Encoder — core encoding/decoding logic.
 *
 * FORMAT
 * ------
 * The input is an arbitrary stream of byte values (each 0-255).
 *
 *   • A single non-zero byte is emitted verbatim.
 *   • A run of N consecutive zero bytes (N >= 1) is encoded as a
 *     two-byte marker: ESCAPE_BYTE followed by (N - 1).
 *
 * The escape byte is 0xFF by default. Because 0xFF can also appear
 * as a legitimate data byte, any 0xFF in the input is itself escaped:
 * it is written as ESCAPE_BYTE followed by 0xFF.
 *
 * DECODING RULE
 *   When the decoder sees ESCAPE_BYTE it reads the next byte X:
 *     X == 0xFF   → emit a single 0xFF (escaped literal)
 *     0 <= X < 255 → emit (X + 1) zero bytes
 *
 * CAPACITY
 *   The count byte stores (N - 1), so a single marker can represent
 *   runs of length 1 through 255. Runs longer than 255 are split
 *   across multiple markers, which is handled transparently by the
 *   encoder.
 *
 * CHOICE OF ESCAPE
 *   0xFF is chosen because non-zero data bytes are, in practice,
 *   far less frequently 0xFF than 0x00 (e.g. text, headers, integers).
 *   This keeps the escape cost low for typical payloads while still
 *   being a single byte that is cheap to test against.
 */

/**
 * Default escape byte: any input byte equal to this value is escaped.
 */
export const DEFAULT_ESCAPE = 0xff;

/**
 * Maximum number of zero bytes a single two-byte marker can represent.
 * The count byte stores (runLength - 1), so the capacity is 255.
 */
export const MAX_RUN_PER_MARKER = 255;

/**
 * Encode a byte array into a zero-run-length-encoded byte array.
 *
 * @param {number[] | Uint8Array} input  Source bytes (values 0-255).
 * @param {object} [opts]
 * @param {number} [opts.escape=0xff]  Escape byte used to mark runs.
 * @returns {Uint8Array} Encoded bytes. Always a fresh array.
 */
export function encode(input, opts = {}) {
  const escape = opts.escape ?? DEFAULT_ESCAPE;
  if (typeof escape !== 'number' || escape < 0 || escape > 255) {
    throw new TypeError('escape must be an integer in 0..255');
  }
  if (escape === 0) {
    // If escape were 0 we could not distinguish a zero-run marker from
    // a literal zero, and the entire scheme collapses. Reject early.
    throw new RangeError('escape must be non-zero; otherwise zeros are indistinguishable');
  }

  if (!(input instanceof Uint8Array) && !Array.isArray(input)) {
    throw new TypeError('input must be a Uint8Array or an array of bytes');
  }

  const out = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    const b = input[i];
    if (typeof b !== 'number' || b < 0 || b > 255) {
      throw new RangeError(`input[${i}] = ${b} is not a byte (0..255)`);
    }

    if (b === 0) {
      // Count the length of the zero run starting at i.
      let run = 0;
      while (i + run < n && input[i + run] === 0) {
        run++;
      }
      i += run;

      // Emit one marker per MAX_RUN_PER_MARKER chunk. Because the count
      // byte stores (run - 1), a chunk of 255 is encoded as escape + 254.
      while (run > 0) {
        const chunk = run > MAX_RUN_PER_MARKER ? MAX_RUN_PER_MARKER : run;
        out.push(escape, chunk - 1);
        run -= chunk;
      }
    } else if (b === escape) {
      // Escape collision: write escape followed by 0xFF to signal a
      // literal escape byte.
      out.push(escape, 0xff);
      i++;
    } else {
      out.push(b);
      i++;
    }
  }

  return Uint8Array.from(out);
}

/**
 * Decode a zero-run-length-encoded byte array back to the original bytes.
 *
 * @param {number[] | Uint8Array} input  Encoded bytes.
 * @param {object} [opts]
 * @param {number} [opts.escape=0xff]  Escape byte; must match the encoder.
 * @returns {Uint8Array} Decoded bytes.
 */
export function decode(input, opts = {}) {
  const escape = opts.escape ?? DEFAULT_ESCAPE;
  if (typeof escape !== 'number' || escape < 0 || escape > 255) {
    throw new TypeError('escape must be an integer in 0..255');
  }
  if (escape === 0) {
    throw new RangeError('escape must be non-zero');
  }

  if (!(input instanceof Uint8Array) && !Array.isArray(input)) {
    throw new TypeError('input must be a Uint8Array or an array of bytes');
  }

  const out = [];
  const n = input.length;
  let i = 0;

  while (i < n) {
    const b = input[i];
    if (typeof b !== 'number' || b < 0 || b > 255) {
      throw new RangeError(`input[${i}] = ${b} is not a byte (0..255)`);
    }

    if (b === escape) {
      // Marker: consume the following count byte.
      if (i + 1 >= n) {
        throw new RangeError(`truncated input: escape byte at index ${i} has no count`);
      }
      const x = input[i + 1];
      if (typeof x !== 'number' || x < 0 || x > 255) {
        throw new RangeError(`count byte at index ${i + 1} is not a byte`);
      }
      if (x === 0xff) {
        out.push(escape);
      } else {
        for (let k = 0; k < x + 1; k++) {
          out.push(0);
        }
      }
      i += 2;
    } else {
      out.push(b);
      i++;
    }
  }

  return Uint8Array.from(out);
}
