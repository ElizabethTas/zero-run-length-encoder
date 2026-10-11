# zero-run-length-encoder

Compresses byte streams by replacing runs of zero bytes with a two-byte count marker, and expands them back.

```js
import { encode, decode } from 'zero-run-length-encoder';

const data = Uint8Array.from([0, 0, 0, 5, 0, 7]);
const compressed = encode(data);   // Uint8Array
const restored  = decode(compressed); // equals `data`
```

## Why

Sparse byte streams — bitmaps, sparse matrices, protocol frames with padding — often contain long stretches of `0x00`. This library collapses each run of consecutive zeros into `ESCAPE, count` where `count` stores `runLength - 1`. A run of 255 zeros becomes two bytes; a run of 1000 becomes eight.

The trade-off is the escape byte. Because `0xFF` can appear as real data, every literal `0xFF` in the input is itself escaped as `0xFF, 0xFF`. For payloads that are dense in `0xFF` this costs more than it saves; for payloads that are dense in `0x00` (the common case) the savings are large.

## Format

- Non-zero byte (other than the escape) → emitted verbatim.
- Run of N zeros (1 ≤ N ≤ 255) → `ESCAPE, N-1`.
- Runs longer than 255 are split across multiple markers.
- A literal escape byte in the input → `ESCAPE, 0xFF`.

`ESCAPE` defaults to `0xFF` and can be overridden via the `escape` option. The decoder must be given the same value. Setting `escape` to `0` is rejected — zeros would become indistinguishable from markers.

## Exports

- `encode(input, opts?)` — returns `Uint8Array`.
- `decode(input, opts?)` — returns `Uint8Array`.
- `DEFAULT_ESCAPE` — `0xFF`.
- `MAX_RUN_PER_MARKER` — `255`.

Input may be a `Uint8Array` or a plain array of integers in `0..255`.
