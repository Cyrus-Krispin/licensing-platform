const { test } = require('node:test');
const assert = require('node:assert/strict');
const dispatch = require('./dispatch-codex.cjs');
function fixture({ permission = 'write', comments = [], active = [], state = 'open', labels = [{ name: 'codex:ready' }] } = {}) {
  const calls = [];
  const github = {
    rest: {
      repos: { getCollaboratorPermissionLevel: async () => ({ data: { permission } }) },
      issues: {
        get: async () => ({ data: { state, labels } }),
        listComments: 'comments', listForRepo: 'issues',
        createComment: async data => calls.push(['comment', data]),
        addLabels: async data => calls.push(['add', data]),
        removeLabel: async data => calls.push(['remove', data]),
      },
    },
    paginate: async method => method === 'comments' ? comments : active,
  };
  const context = { repo: { owner: 'owner', repo: 'repo' }, payload: {
    action: 'labeled', label: { name: 'codex:ready' }, sender: { type: 'User', login: 'maintainer' }, issue: { number: 1 },
  } };
  const core = { notice() {}, setFailed: message => calls.push(['failed', message]) };
  return { github, context, core, calls };
}
test('maintainer label posts a fixed mention, marks active, consumes readiness', async () => {
  const f = fixture();
  f.context.payload.issue.body = '$(steal-secrets) @codex unrelated';
  await dispatch(f);
  assert.deepEqual(f.calls.map(call => call[0]), ['add', 'comment', 'remove']);
  assert.match(f.calls[1][1].body, /@codex/);
  assert.doesNotMatch(f.calls[1][1].body, /steal-secrets|unrelated$/);
});
for (const permission of ['read', 'triage', 'none']) test(`rejects ${permission} permission`, async () => {
  const f = fixture({ permission }); await dispatch(f); assert.deepEqual(f.calls, []);
});
for (const change of ['bot', 'wrong-label', 'pull-request']) test(`ignores ${change} event`, async () => {
  const f = fixture();
  if (change === 'bot') f.context.payload.sender.type = 'Bot';
  if (change === 'wrong-label') f.context.payload.label.name = 'other';
  if (change === 'pull-request') f.context.payload.issue.pull_request = {};
  await dispatch(f); assert.deepEqual(f.calls, []);
});
test('replayed label does not post a duplicate bot mention', async () => {
  const f = fixture({ comments: [{ user: { login: 'github-actions[bot]' }, body: '<!-- codex-cloud-dispatch:v1 -->' }] });
  await dispatch(f); assert.deepEqual(f.calls.map(call => call[0]), ['add', 'remove']);
});
test('outsider cannot forge the bot marker', async () => {
  const f = fixture({ comments: [{ user: { login: 'outsider' }, body: '<!-- codex-cloud-dispatch:v1 -->' }] });
  await dispatch(f); assert.equal(f.calls[1][0], 'comment');
});
test('another open active issue blocks dispatch', async () => {
  const f = fixture({ active: [{ number: 2 }] }); await dispatch(f);
  assert.deepEqual(f.calls.map(call => call[0]), ['failed']);
});
test('closed or no-longer-ready issue does not dispatch', async () => {
  for (const config of [{ state: 'closed' }, { labels: [] }]) {
    const f = fixture(config); await dispatch(f); assert.deepEqual(f.calls, []);
  }
});
test('API failure propagates instead of pretending success', async () => {
  const f = fixture(); f.github.rest.issues.createComment = async () => { throw new Error('API unavailable'); };
  await assert.rejects(dispatch(f), /API unavailable/); assert.deepEqual(f.calls.map(call => call[0]), ['add']);
});

test('old dispatch marker cannot reacquire a slot while another issue is active', async () => {
  const f = fixture({ active: [{ number: 2 }], comments: [{ user: { login: 'github-actions[bot]' }, body: '<!-- codex-cloud-dispatch:v1 -->' }] });
  await dispatch(f); assert.deepEqual(f.calls.map(call => call[0]), ['failed']);
});

test('read-only proof cannot implement and does not take an implementation slot', async () => {
  const f = fixture({ active: [{ number: 2 }], labels: [{ name: 'codex:ready' }, { name: 'codex:read-only' }] });
  await dispatch(f); assert.deepEqual(f.calls.map(call => call[0]), ['comment', 'remove']);
  assert.match(f.calls[0][1].body, /READ-ONLY/);
  assert.match(f.calls[0][1].body, /Do not modify files/);
});
