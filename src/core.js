const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

const COMPARATOR_RE = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/;

/**
 * Parse a single version string into a comparable tuple.
 *
 * Why a tuple and not an object? The comparison logic needs a stable
 * ordering across major/minor/patch and a separate prerelease ordering.
 * Returning a plain array keeps the hot path allocation-light and makes
 * the ordering rules explicit in `compareVersions`.
 *
 * Prerelease identifiers are split on '.'. Numeric identifiers compare
 * numerically; alphanumeric identifiers compare lexically in ASCII order.
 * This matches the SemVer 2.0.0 precedence rule.
 */
export function parseVersion(version) {
  const m = SEMVER_RE.exec(version);
  if (!m) {
    throw new Error(`Invalid version: ${version}`);
  }
  const [, major, minor, patch, prerelease] = m;
  const pre = prerelease ? prerelease.split('.') : [];
  return [Number(major), Number(minor), Number(patch), pre];
}

/**
 * Compare two parsed versions.
 *
 * Returns -1, 0, or 1. Prerelease versions sort before the associated
 * normal version (1.0.0-alpha < 1.0.0).
 */
export function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  const pa = a[3];
  const pb = b[3];
  if (pa.length === 0 && pb.length === 0) return 0;
  if (pa.length === 0) return 1; // a is release, b is prerelease => a > b
  if (pb.length === 0) return -1; // a is prerelease, b is release => a < b
  const n = Math.min(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i];
    const y = pb[i];
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) {
      const xi = Number(x);
      const yi = Number(y);
      if (xi !== yi) return xi < yi ? -1 : 1;
    } else if (xNum !== yNum) {
      // Numeric identifiers always have lower precedence than alphanumeric.
      return xNum ? -1 : 1;
    } else {
      if (x !== y) return x < y ? -1 : 1;
    }
  }
  if (pa.length !== pb.length) return pa.length < pb.length ? -1 : 1;
  return 0;
}

/**
 * Return true if `version` is within the `range`.
 *
 * Supported range syntax:
 *   - exact: "1.2.3"
 *   - comparators: ">=1.2.3", "<2.0.0", etc.
 *   - caret: "^1.2.3" (compatible within the leftmost non-zero segment)
 *   - tilde: "~1.2.3" (patch-level changes for a given minor)
 *   - unions: "1.x || 2.x"
 *   - wildcards: "1.x", "1.2.x", "*"
 *   - hyphen: "1.2.3 - 2.0.0" (inclusive range)
 *
 * The implementation normalises every range into a list of comparator
 * predicates. A version is in the range if it satisfies any one of the
 * union alternatives. This is the same model npm uses, minus the parts
 * that need a resolver (tags, git URLs).
 */
export function satisfies(version, range) {
  const v = parseVersion(version);
  const alternatives = String(range).split('||').map((s) => s.trim()).filter(Boolean);
  if (alternatives.length === 0) {
    throw new Error(`Empty range: ${range}`);
  }
  for (const alt of alternatives) {
    if (alt === '*' || alt === '' || alt === 'x' || alt === 'X') return true;
    if (alt.includes(' - ')) {
      const [lo, hi] = alt.split(' - ').map((s) => s.trim());
      const loV = parseVersion(expandWildcard(lo));
      const hiV = parseVersion(expandWildcard(hi));
      if (compareVersions(v, loV) >= 0 && compareVersions(v, hiV) <= 0) return true;
      continue;
    }
    const comparators = alt.split(/\s+/).filter(Boolean);
    let ok = true;
    for (const c of comparators) {
      if (!satisfiesComparator(v, c)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function expandWildcard(s) {
  // "1.x" / "1.2.x" / "*" become explicit upper bounds when used in a
  // hyphen range, because a hyphen range needs concrete endpoints.
  if (s === '*' || s === 'x' || s === 'X') return '0.0.0';
  const parts = s.split('.');
  while (parts.length < 3) parts.push('0');
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'x' || parts[i] === 'X' || parts[i] === '*') {
      parts[i] = '0';
    }
  }
  return parts.join('.');
}

function satisfiesComparator(v, comparator) {
  const m = COMPARATOR_RE.exec(comparator);
  if (!m) throw new Error(`Invalid comparator: ${comparator}`);
  const op = m[1] || '=';
  const raw = m[2];
  if (raw === '*' || raw === 'x' || raw === 'X') return true;
  if (op === '^') return inCaret(v, raw);
  if (op === '~') return inTilde(v, raw);
  if (op === '=' && hasWildcard(raw)) {
    return inWildcard(v, raw);
  }
  const target = parseVersion(expandWildcard(raw));
  const cmp = compareVersions(v, target);
  switch (op) {
    case '=': return cmp === 0;
    case '>': return cmp > 0;
    case '>=': return cmp >= 0;
    case '<': return cmp < 0;
    case '<=': return cmp <= 0;
    default: throw new Error(`Unknown operator: ${op}`);
  }
}

function hasWildcard(s) {
  return s.split('.').some((p) => p === 'x' || p === 'X' || p === '*');
}

function inWildcard(v, raw) {
  const parts = raw.split('.');
  for (let i = 0; i < parts.length && i < 3; i++) {
    const p = parts[i];
    if (p === 'x' || p === 'X' || p === '*') return true;
    if (v[i] !== Number(p)) return false;
  }
  return true;
}

function inCaret(v, raw) {
  const target = parseVersion(expandWildcard(raw));
  if (compareVersions(v, target) < 0) return false;
  const [maj, min, pat] = target;
  if (maj > 0) return v[0] === maj;
  if (min > 0) return v[0] === 0 && v[1] === min;
  return v[0] === 0 && v[1] === 0 && v[2] === pat;
}

function inTilde(v, raw) {
  const target = parseVersion(expandWildcard(raw));
  if (compareVersions(v, target) < 0) return false;
  return v[0] === target[0] && v[1] === target[1];
}

/**
 * Compute the intersection of two ranges.
 *
 * The intersection is returned as a range string that is the conjunction
 * of the two inputs. Because SemVer ranges are unions of comparator sets,
 * the intersection of two unions is the union of the pairwise intersections
 * of their alternatives. We return the simplest syntactic form that is
 * guaranteed to be equivalent: a space-separated list of comparators for
 * each pair, joined by ` || `.
 *
 * The result is not always the most compact representation, but it is
 * always correct and is itself a valid range accepted by `satisfies`.
 */
export function intersect(rangeA, rangeB) {
  const a = String(rangeA).trim();
  const b = String(rangeB).trim();
  if (a === '' || b === '') throw new Error('Empty range');
  const altsA = a.split('||').map((s) => s.trim()).filter(Boolean);
  const altsB = b.split('||').map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const x of altsA) {
    for (const y of altsB) {
      const merged = mergeAlternatives(x, y);
      if (merged !== null) out.push(merged);
    }
  }
  if (out.length === 0) return '<0.0.0-0';
  return out.join(' || ');
}

function mergeAlternatives(x, y) {
  // A hyphen range is expanded into two comparators so that the merge
  // step only has to reason about a flat comparator list.
  const norm = (s) => {
    if (s === '' || s === '*') return [];
    if (s.includes(' - ')) {
      const [lo, hi] = s.split(' - ').map((t) => t.trim());
      return [`>=${expandWildcard(lo)}`, `<=${expandWildcard(hi)}`];
    }
    const parts = s.split(/\s+/).filter(Boolean);
    return parts.flatMap((p) => {
      const m = /^(\^|~)?(.*)$/.exec(p);
      const op = m[1];
      const raw = m[2];
      if (op === '^') return caretComparators(raw);
      if (op === '~') return tildeComparators(raw);
      if (op === '' && hasWildcard(raw)) return wildcardComparators(raw);
      return [p];
    });
  };
  const parts = [...norm(x), ...norm(y)];
  if (parts.length === 0) return '*';
  // Deduplicate exact duplicates so the output stays readable.
  const seen = new Set();
  const unique = [];
  for (const p of parts) {
    if (!seen.has(p)) {
      seen.add(p);
      unique.push(p);
    }
  }
  return unique.join(' ');
}

function caretComparators(raw) {
  const [maj, min, pat] = parseVersion(expandWildcard(raw));
  if (maj > 0) return [`>=${raw}`, `<${maj + 1}.0.0`];
  if (min > 0) return [`>=${raw}`, `<0.${min + 1}.0`];
  return [`>=${raw}`, `<0.0.${pat + 1}`];
}

function tildeComparators(raw) {
  const [maj, min] = parseVersion(expandWildcard(raw));
  return [`>=${raw}`, `<${maj}.${min + 1}.0`];
}

function wildcardComparators(raw) {
  const parts = raw.split('.');
  const nums = [];
  for (let i = 0; i < parts.length && i < 3; i++) {
    const p = parts[i];
    if (p === 'x' || p === 'X' || p === '*') break;
    nums.push(Number(p));
  }
  if (nums.length === 0) return [];
  const lower = [...nums, 0, 0].slice(0, 3).join('.');
  if (nums.length === 1) return [`>=${lower}`, `<${nums[0] + 1}.0.0`];
  return [`>=${lower}`, `<${nums[0]}.${nums[1] + 1}.0`];
}
