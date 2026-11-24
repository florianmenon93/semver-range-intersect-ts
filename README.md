# semver-range-intersect-ts

Compute the intersection of two Semantic Versioning range expressions so you can tell whether two dependency constraints can be satisfied by the same version.

```js
import { intersect, satisfies } from './src/index.js';

const range = intersect('^1.2.0', '~1.2.3');
console.log(range);            // '>=1.2.0 <2.0.0 >=1.2.3 <1.3.0'
console.log(satisfies('1.2.5', range)); // true
console.log(satisfies('1.3.0', range)); // false
```

## Why this exists

Package managers need to know when two version ranges overlap. The naive approach is to enumerate every version in both ranges, which is impossible for open-ended ranges like `>=1.0.0`. This library instead treats a range as a union of comparator sets and computes the pairwise conjunction of those sets. The result is always a valid range that `satisfies` accepts, so you can feed it back into the same machinery.

The trade-off is syntactic: the intersection is returned as a flat list of comparators joined by `||`, not as the most compact possible range. A range like `^1.2.0` intersected with `~1.2.3` comes back as `>=1.2.0 <2.0.0 >=1.2.3 <1.3.0` rather than the tighter `>=1.2.3 <1.3.0`. The output is correct and machine-readable; it is just not pretty-printed. We chose correctness and simplicity over a range simplifier, because a simplifier is where subtle bugs live.

## Supported syntax

- Exact versions: `1.2.3`
- Comparators: `>=1.2.3`, `<2.0.0`, `>1.0.0`, `<=1.9.9`, `=1.2.3`
- Caret: `^1.2.3`, `^0.2.3`, `^0.0.3`
- Tilde: `~1.2.3`
- Wildcards: `1.x`, `1.2.x`, `*`
- Unions: `1.x || 2.x`
- Hyphen ranges: `1.2.3 - 2.0.0`

## The awkward edge

An empty intersection is represented by the range string `<0.0.0-0`. No real version can satisfy it, so `satisfies` returns `false` for every input. If you are checking for overlap, compare the result against that marker or call `satisfies` with a candidate version. Do not assume the result is always a non-empty string that looks like a normal range.

Prerelease versions are ordered according to SemVer 2.0.0: `1.0.0-alpha` is less than `1.0.0`, and numeric identifiers sort below alphanumeric ones. Range matching does not add npm's implicit prerelease exclusion rules; if a range includes a prerelease comparator, prereleases are considered.

## API

- `parseVersion(version)` — returns `[major, minor, patch, prerelease]`.
- `compareVersions(a, b)` — returns `-1`, `0`, or `1`.
- `satisfies(version, range)` — returns `true` if `version` is in `range`.
- `intersect(rangeA, rangeB)` — returns a range string representing the intersection.
