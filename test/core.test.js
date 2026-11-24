import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVersion,
  compareVersions,
  satisfies,
  intersect,
} from '../src/index.js';

test('parseVersion splits a plain version', () => {
  assert.deepEqual(parseVersion('1.2.3'), [1, 2, 3, []]);
});

test('parseVersion splits a prerelease', () => {
  assert.deepEqual(parseVersion('1.2.3-alpha.1'), [1, 2, 3, ['alpha', '1']]);
});

test('parseVersion rejects malformed input', () => {
  assert.throws(() => parseVersion('1.2'), /Invalid version/);
  assert.throws(() => parseVersion('1.2.3.4'), /Invalid version/);
});

test('compareVersions orders major, minor, patch', () => {
  assert.equal(compareVersions(parseVersion('1.0.0'), parseVersion('2.0.0')), -1);
  assert.equal(compareVersions(parseVersion('2.0.0'), parseVersion('1.0.0')), 1);
  assert.equal(compareVersions(parseVersion('1.0.0'), parseVersion('1.0.0')), 0);
  assert.equal(compareVersions(parseVersion('1.10.0'), parseVersion('1.9.0')), 1);
});

test('compareVersions orders prereleases before releases', () => {
  assert.equal(compareVersions(parseVersion('1.0.0-alpha'), parseVersion('1.0.0')), -1);
  assert.equal(compareVersions(parseVersion('1.0.0'), parseVersion('1.0.0-alpha')), 1);
  assert.equal(compareVersions(parseVersion('1.0.0-alpha'), parseVersion('1.0.0-beta')), -1);
  assert.equal(compareVersions(parseVersion('1.0.0-alpha.1'), parseVersion('1.0.0-alpha.2')), -1);
  assert.equal(compareVersions(parseVersion('1.0.0-1'), parseVersion('1.0.0-alpha')), -1);
});

test('satisfies handles exact versions', () => {
  assert.equal(satisfies('1.2.3', '1.2.3'), true);
  assert.equal(satisfies('1.2.4', '1.2.3'), false);
});

test('satisfies handles comparators', () => {
  assert.equal(satisfies('1.2.3', '>=1.0.0'), true);
  assert.equal(satisfies('0.9.9', '>=1.0.0'), false);
  assert.equal(satisfies('1.2.3', '<2.0.0'), true);
  assert.equal(satisfies('2.0.0', '<2.0.0'), false);
});

test('satisfies handles caret ranges', () => {
  assert.equal(satisfies('1.2.3', '^1.2.3'), true);
  assert.equal(satisfies('1.9.9', '^1.2.3'), true);
  assert.equal(satisfies('2.0.0', '^1.2.3'), false);
  assert.equal(satisfies('0.2.5', '^0.2.3'), true);
  assert.equal(satisfies('0.3.0', '^0.2.3'), false);
  assert.equal(satisfies('0.0.3', '^0.0.3'), true);
  assert.equal(satisfies('0.0.4', '^0.0.3'), false);
});

test('satisfies handles tilde ranges', () => {
  assert.equal(satisfies('1.2.3', '~1.2.3'), true);
  assert.equal(satisfies('1.2.9', '~1.2.3'), true);
  assert.equal(satisfies('1.3.0', '~1.2.3'), false);
  assert.equal(satisfies('1.2.2', '~1.2.3'), false);
});

test('satisfies handles wildcards and unions', () => {
  assert.equal(satisfies('1.5.0', '1.x'), true);
  assert.equal(satisfies('2.0.0', '1.x'), false);
  assert.equal(satisfies('1.2.9', '1.2.x'), true);
  assert.equal(satisfies('1.3.0', '1.2.x'), false);
  assert.equal(satisfies('3.0.0', '*'), true);
  assert.equal(satisfies('1.5.0', '1.x || 2.x'), true);
  assert.equal(satisfies('2.5.0', '1.x || 2.x'), true);
  assert.equal(satisfies('3.0.0', '1.x || 2.x'), false);
});

test('satisfies handles hyphen ranges', () => {
  assert.equal(satisfies('1.5.0', '1.2.3 - 2.0.0'), true);
  assert.equal(satisfies('1.2.3', '1.2.3 - 2.0.0'), true);
  assert.equal(satisfies('2.0.0', '1.2.3 - 2.0.0'), true);
  assert.equal(satisfies('2.0.1', '1.2.3 - 2.0.0'), false);
});

test('intersect returns a range that both inputs satisfy', () => {
  const r = intersect('>=1.0.0', '<2.0.0');
  assert.equal(satisfies('1.5.0', r), true);
  assert.equal(satisfies('0.9.0', r), false);
  assert.equal(satisfies('2.0.0', r), false);
});

test('intersect handles unions', () => {
  const r = intersect('1.x || 2.x', '>=1.5.0');
  assert.equal(satisfies('1.5.0', r), true);
  assert.equal(satisfies('1.4.0', r), false);
  assert.equal(satisfies('2.0.0', r), true);
  assert.equal(satisfies('3.0.0', r), false);
});

test('intersect returns an unsatisfiable marker for disjoint ranges', () => {
  const r = intersect('1.x', '2.x');
  assert.equal(satisfies('1.5.0', r), false);
  assert.equal(satisfies('2.5.0', r), false);
});

test('intersect of caret and tilde produces a usable range', () => {
  const r = intersect('^1.2.0', '~1.2.3');
  assert.equal(satisfies('1.2.3', r), true);
  assert.equal(satisfies('1.2.9', r), true);
  assert.equal(satisfies('1.3.0', r), false);
  assert.equal(satisfies('1.2.2', r), false);
});
