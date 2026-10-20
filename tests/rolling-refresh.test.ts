import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSweep, nextSweepDelay } from '../src/lib/rollingRefresh.ts';

test('pages rotate fairly with single-flight requests and spacing', async () => {
  let now = 0, active = 0, maxActive = 0;
  const starts: number[] = [], order: string[] = [];
  const targets = ['A', 'B'].map(key => ({ key, create() {
    let page = 0;
    return async () => {
      active++; maxActive = Math.max(active, maxActive); starts.push(now); order.push(key);
      await Promise.resolve(); active--; page++;
      return { done: page === 3, progress: { loaded: page * 25 } };
    };
  }}));
  await runSweep(targets, { signal: new AbortController().signal, now: () => now,
    wait: async ms => { now += ms; }, onUpdate: () => {}, spacingMs: 1000 });
  assert.equal(maxActive, 1);
  assert.deepEqual(order, ['A', 'B', 'A', 'B', 'A', 'B']);
  assert.ok(starts.slice(1).every((v, i) => v - starts[i] >= 1000));
});

test('one failed page retries without losing its cursor; terminal failures do not block peers', async () => {
  let failures = 0; const results: string[] = [], errors: string[] = [];
  const targets = [
    { key: 'retry', create: () => async () => { if (failures++ === 0) throw Object.assign(new Error('gateway'), { retryable: true }); return { done: true, data: 'full' }; } },
    { key: 'denied', create: () => async () => { throw new Error('permission'); } },
    { key: 'other', create: () => async () => ({ done: true, data: 'other' }) },
  ];
  let now = 0;
  await runSweep(targets, { signal: new AbortController().signal, now: () => now,
    wait: async ms => { now += ms; }, spacingMs: 0,
    onUpdate: (key, update) => { if (update.error) errors.push(key); if (update.data) results.push(key); } });
  assert.equal(failures, 2); assert.deepEqual(errors, ['denied']);
  assert.deepEqual(results.sort(), ['other', 'retry']);
});

test('cycle interval is measured from sweep start and long sweeps continue immediately', () => {
  assert.equal(nextSweepDelay(600_000, 0, 150_000), 450_000);
  assert.equal(nextSweepDelay(600_000, 0, 700_000), 0);
  assert.equal(nextSweepDelay(null, 0, 700_000), null);
});

test('aborted sweep does not load further targets', async () => {
  const controller = new AbortController(); const started: string[] = [];
  const targets = ['A', 'B'].map(key => ({key, create: () => async () => {
    started.push(key); controller.abort(); return { done: true };
  }}));
  await assert.rejects(runSweep(targets, { signal: controller.signal, spacingMs: 0, onUpdate: () => {} }), { name: 'AbortError' });
  assert.deepEqual(started, ['A']);
});

test('all pages beyond 100 are loaded and duplicate IDs are reconciled', async () => {
  const { createPagedLoad } = await import('../src/lib/rollingRefresh.ts');
  const seen: Array<string | null> = [];
  const step = createPagedLoad(async cursor => {
    seen.push(cursor); const page = cursor ? Number(cursor) : 0;
    const nodes = Array.from({length:25}, (_,i) => ({id:String(page * 25 + i)}));
    if(page===4) nodes.push({id:'0'});
    return {nodes,totalCount:125,pageInfo:{hasNextPage:page<4,endCursor:String(page+1)}};
  });
  let final: unknown;let now=0;
  await runSweep([{key:'A',create:()=>step}],{signal:new AbortController().signal,now:()=>now,wait:async ms=>{now+=ms;},onUpdate:(_,u)=>{if(u.done)final=u.data;}});
  assert.equal((final as unknown[]).length,125);assert.deepEqual(seen,[null,'1','2','3','4']);
});

test('failed later page leaves its cursor and accumulated replacement intact', async () => {
  const { createPagedLoad } = await import('../src/lib/rollingRefresh.ts');
  let secondAttempts=0;
  const step=createPagedLoad(async cursor=> {
    if(cursor==='next' && secondAttempts++===0)throw new Error('failed page');
    return {nodes:[{id:cursor??'first'}],totalCount:2,pageInfo:{hasNextPage:cursor===null,endCursor:cursor===null?'next':null}};
  });
  const signal=new AbortController().signal;
  const first=await step(signal); assert.equal(first.done,false);
  await assert.rejects(step(signal),/failed page/);
  const complete=await step(signal);assert.equal(complete.done,true);assert.deepEqual(complete.data,[{id:'first'},{id:'next'}]);
});

test('cursor cycles fail rather than looping or claiming completeness', async()=> {
  const {createPagedLoad}=await import('../src/lib/rollingRefresh.ts');
  const step=createPagedLoad(async()=>({nodes:[{id:'a'}],totalCount:2,pageInfo:{hasNextPage:true,endCursor:'stuck'}}));
  const signal=new AbortController().signal;await step(signal);await assert.rejects(step(signal),/did not advance/);
});

test('refresh updates existing status without removing unseen or failed initial pages; completion removes closed PRs', async () => {
  const {mergeNodes}=await import('../src/lib/rollingRefresh.ts');
  const previous=Array.from({length:100},(_,i)=>({id:String(i),state:'old'}));
  const next=Array.from({length:25},(_,i)=>({id:String(i),state:'new'}));
  const partial=mergeNodes(previous,next,false);
  assert.equal(partial.length,100);assert.equal(partial[0].state,'new');assert.equal(partial[99].state,'old');
  const complete=mergeNodes(previous,next,true);assert.equal(complete.length,25);
});

test('opening loads one page per repo with four workers, then resumes each cursor serially', async()=> {
  const {runInitialBurst}=await import('../src/lib/rollingRefresh.ts');
  let active=0,peak=0;const calls:Array<{key:string;page:number;initial:boolean}>=[];
  const targets=Array.from({length:7},(_,i)=>({key:String(i),create(){let page=0;return async(_signal:AbortSignal,initial=false)=>{
    active++;peak=Math.max(peak,active);await Promise.resolve();active--;calls.push({key:String(i),page:page++,initial});
    return {done:page===2};
  };}}));
  const options={signal:new AbortController().signal,onUpdate:()=>{},beforeRequest:async()=>{await Promise.resolve();},spacingMs:0};
  const pending=await runInitialBurst(targets,options);
  assert.equal(peak,4);assert.equal(calls.length,7);assert.ok(calls.every(c=>c.page===0&&c.initial));
  await runSweep(pending,options);
  assert.equal(calls.length,14);assert.ok(calls.slice(7).every(c=>c.page===1&&!c.initial));
});

test('warmup and remaining pages continue when the tab hides midway', { timeout: 1000 }, async (t) => {
  const { runInitialBurst } = await import('../src/lib/rollingRefresh.ts');
  const { createGitHubTransport } = await import('../src/lib/githubRequest.ts');
  const document = Object.assign(new EventTarget(), { hidden: false });
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new Error('Background requests stalled while hidden')), 500);
  const signal = AbortSignal.any([t.signal, deadline.signal]);
  const releases: Array<() => void> = [];
  const starts: number[] = [];
  let now = 0;
  const request = createGitHubTransport({
    now: () => now, wait: async ms => { now += ms; },
    fetch: async () => {
      starts.push(now);
      if (starts.length <= 4) await new Promise<void>(resolve => releases.push(resolve));
      return new Response('{}');
    },
  });
  const targets = Array.from({ length: 7 }, (_, i) => ({ key: String(i), create() {
    let page = 0;
    return async (signal: AbortSignal, initial = false) => {
      await request('url', {}, 'token', signal, initial);
      return { done: ++page === 2 };
    };
  }}));
  try {
    const options = { signal, onUpdate: () => {}, now: () => now, wait: async (ms: number) => { now += ms; } };
    const warmup = runInitialBurst(targets, options);
    for (let i = 0; i < 100 && releases.length < 4; i++) await Promise.resolve();
    assert.equal(releases.length, 4);
    assert.deepEqual(starts, [0, 250, 500, 750]);
    document.hidden = true;
    for (const release of releases) release();
    const pending = await warmup;
    assert.equal(starts.length, 7);
    assert.ok(starts.slice(1).every((start, i) => start - starts[i] >= 250));
    await runSweep(pending, options);
    assert.equal(starts.length, 14);
    assert.ok(starts.slice(7).every((start, i) => start - starts[i + 6] >= 1000));
    assert.equal(document.hidden, true);
  } finally { clearTimeout(timer); Reflect.deleteProperty(globalThis, 'document'); }
});

test('partial refresh updates cards in place and appends new IDs without page-by-page reshuffling', async () => {
  const {mergeNodes}=await import('../src/lib/rollingRefresh.ts');
  const old=[{id:'a',state:'old'},{id:'b',state:'old'},{id:'c',state:'old'}];
  const page=[{id:'c',state:'new'},{id:'d',state:'new'}];
  const partial=mergeNodes(old,page,false);
  assert.deepEqual(partial.map(n=>n.id),['a','b','c','d']);
  assert.equal(partial[2].state,'new');
  assert.deepEqual(mergeNodes(partial,page,true).map(n=>n.id),['c','d']);
});
