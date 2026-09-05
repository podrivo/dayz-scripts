// Cross-reference quality budget: the live /xref-report.json summary for the
// latest scripts model, locked as regression ceilings on ambiguous and
// unresolved rates. Resolved shares are recorded for visibility; only the
// failure modes may raise the build.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSiteModel } from '../src/generate/model.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const budget = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/xref-budget.json'), 'utf8'));

function rates(summary) {
  const { total } = summary;
  const share = (n) => n / total;
  return {
    typed: share(summary.typed),
    scope: share(summary.scope),
    unique: share(summary.unique),
    ambiguous: share(summary.ambiguous),
    unresolved: share(summary.unresolved),
  };
}

test('xref resolution stays within the quality budget', () => {
  const modelPath = path.join(root, 'data', budget.model);
  assert.ok(fs.existsSync(modelPath), `missing ${budget.model}; run pnpm parse`);
  const site = buildSiteModel(JSON.parse(fs.readFileSync(modelPath, 'utf8')));
  const { summary } = site.xrefReport;
  const got = rates(summary);

  // Always surface the live mix so a failure shows where the budget moved.
  console.log(
    'xref rates:',
    Object.fromEntries(Object.entries(got).map(([k, v]) => [k, `${(100 * v).toFixed(3)}%`])),
    'counts:',
    summary
  );

  assert.equal(summary.total > 0, true, 'expected call resolutions');
  assert.equal(
    summary.typed + summary.scope + summary.unique + summary.ambiguous + summary.unresolved,
    summary.total,
    'confidence buckets must partition total'
  );

  assert.ok(
    got.ambiguous <= budget.maxAmbiguousRate + budget.slack.ambiguous,
    `ambiguous rate ${(100 * got.ambiguous).toFixed(3)}% exceeds budget ` +
      `${(100 * budget.maxAmbiguousRate).toFixed(3)}% + ${(100 * budget.slack.ambiguous).toFixed(3)}pp slack`
  );
  assert.ok(
    got.unresolved <= budget.maxUnresolvedRate + budget.slack.unresolved,
    `unresolved rate ${(100 * got.unresolved).toFixed(3)}% exceeds budget ` +
      `${(100 * budget.maxUnresolvedRate).toFixed(3)}% + ${(100 * budget.slack.unresolved).toFixed(3)}pp slack`
  );

  // Speculative linking is forbidden: every ambiguous/unresolved issue is a
  // non-link, and the report must still list them for investigation.
  for (const issue of site.xrefReport.issues) {
    assert.ok(
      issue.confidence === 'ambiguous' || issue.confidence === 'unresolved',
      `issue ${issue.expression} has unexpected confidence ${issue.confidence}`
    );
    assert.ok(issue.count >= 1);
  }
});
