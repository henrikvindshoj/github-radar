import assert from 'node:assert/strict';
import test from 'node:test';
import type { PullRequestNode, CheckState } from '../src/lib/github.ts';
import { deriveStatus } from '../src/lib/status.ts';

function pr(checks: CheckState | null = 'SUCCESS', changes: Partial<PullRequestNode> = {}): PullRequestNode {
  return { id:'1', number:1, title:'PR', url:'', isDraft:false, createdAt:'', updatedAt:'',
    author:null, headRefName:'feature', baseRefName:'main', mergeable:'MERGEABLE', reviewDecision:'APPROVED',
    additions:0, deletions:0, comments:{totalCount:0},
    commits:{nodes:[{commit:{statusCheckRollup:checks ? {state:checks}:null}}]}, ...changes };
}
test('approved passing mergeable PR has explicit readiness', () => {
  const status=deriveStatus(pr());
  assert.equal(status.approved,true); assert.equal(status.readyToMerge,true); assert.equal(status.overall,'success');
});
test('approval alone never claims readiness with unknown, conflicting or incomplete checks', () => {
  for(const candidate of [pr('PENDING'),pr('EXPECTED'),pr(null),pr('SUCCESS',{mergeable:'UNKNOWN'}),pr('SUCCESS',{mergeable:'CONFLICTING'})]) {
    const status=deriveStatus(candidate);
    assert.equal(status.approved,true); assert.equal(status.readyToMerge,false); assert.notEqual(status.overall,'success');
  }
});
test('failing and errored CI stays red for approved and draft PRs', () => {
  for(const state of ['FAILURE','ERROR'] as const) for(const isDraft of [false,true]) {
    const status=deriveStatus(pr(state,{isDraft}));
    assert.equal(status.overall,'failure'); assert.equal(status.readyToMerge,false);
  }
});
test('drafts, missing approval and requested changes have no approval marker', () => {
  for(const changes of [{isDraft:true},{reviewDecision:null},{reviewDecision:'REVIEW_REQUIRED' as const},{reviewDecision:'CHANGES_REQUESTED' as const}]) {
    const status=deriveStatus(pr('SUCCESS',changes));
    assert.equal(status.approved,false); assert.equal(status.readyToMerge,false);
  }
});
