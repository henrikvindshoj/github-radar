import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesFilters, defaultFilters } from '../src/lib/filters.ts';
import type { PullRequestNode } from '../src/lib/github.ts';

function pr(changes: Partial<PullRequestNode> = {}): PullRequestNode {
  return { id: '1', number: 1, title: 'PR', url: '', isDraft: false,
    createdAt: '', updatedAt: '', author: { login: 'author', avatarUrl: '' },
    headRefName: 'feature', baseRefName: 'main', mergeable: 'MERGEABLE',
    reviewDecision: 'CHANGES_REQUESTED', additions: 0, deletions: 0,
    comments: { totalCount: 0 }, commits: { nodes: [] }, ...changes };
}
const attention = { ...defaultFilters, failingOnly: true };

test('needs attention excludes PRs with an active approval or requested-changes review by the viewer', () => {
  for (const reviewDecision of ['APPROVED', 'CHANGES_REQUESTED'] as const) {
    const candidate = pr({ reviewDecision, viewerActiveReviews: { totalCount: 1 },
      commits: { nodes: [{ commit: { oid: 'head', statusCheckRollup: { state: 'FAILURE' } } }] } });
    assert.equal(matchesFilters(candidate, attention, 'me'), false);
    assert.equal(matchesFilters(candidate, defaultFilters, 'me'), true);
  }
});

test('needs attention includes other authors awaiting review without an active viewer review', () => {
  for (const viewerActiveReviews of [undefined, { totalCount: 0 }]) {
    assert.equal(matchesFilters(pr({ viewerActiveReviews }), attention, 'me'), true);
    for (const reviewDecision of [null, 'REVIEW_REQUIRED'] as const) {
      assert.equal(matchesFilters(pr({ viewerActiveReviews, reviewDecision }), attention, 'me'), true);
    }
  }
  assert.equal(matchesFilters(pr({ reviewDecision: 'APPROVED' }), attention, 'me'), false);
  assert.equal(matchesFilters(pr({ author: { login: 'ME', avatarUrl: '' } }), attention, 'me'), false);
  assert.equal(matchesFilters(pr({ isDraft: true }), attention, 'me'), false);
  assert.equal(matchesFilters(pr(), attention, null), false);
});

test('all filters off show every PR; only mine and hide drafts filter independently', () => {
  const candidates = [pr({ id: 'mine', author: { login: 'ME', avatarUrl: '' } }),
    pr({ id: 'draft', author: { login: 'me', avatarUrl: '' }, isDraft: true }),
    pr({ id: 'other' }), pr({ id: 'bot', author: { login: 'dependabot', avatarUrl: '' } })];
  const visible = (filters: typeof defaultFilters) => candidates.filter(candidate => matchesFilters(candidate, filters, 'me')).map(candidate => candidate.id);
  assert.deepEqual(visible(defaultFilters), ['mine', 'draft', 'other', 'bot']);
  assert.deepEqual(visible({ ...defaultFilters, onlyMine: true }), ['mine', 'draft']);
  assert.deepEqual(visible({ ...defaultFilters, hideDrafts: true }), ['mine', 'other', 'bot']);
  assert.deepEqual(visible({ ...defaultFilters, onlyMine: true, hideDrafts: true }), ['mine']);
});

test('needs review shows non-draft PRs waiting on required reviewers', () => {
  const filters = { ...defaultFilters, needsReview: true };
  assert.equal(matchesFilters(pr({ reviewDecision: 'REVIEW_REQUIRED' }), filters, 'me'), true);
  for (const changes of [{ isDraft: true }, { reviewDecision: 'APPROVED' as const }, { reviewDecision: null }]) {
    assert.equal(matchesFilters(pr({ reviewDecision: 'REVIEW_REQUIRED', ...changes }), filters, 'me'), false);
  }
});
