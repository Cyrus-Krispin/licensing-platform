const READY = 'codex:ready';
const ACTIVE = 'codex:dispatched';
const MARKER = '<!-- codex-cloud-dispatch:v1 -->';

module.exports = async function dispatch({ github, context, core }) {
  const { owner, repo } = context.repo;
  const event = context.payload;
  if (event.action !== 'labeled' || event.label?.name !== READY ||
      event.sender?.type !== 'User' || event.issue?.pull_request) return;

  const permission = await github.rest.repos.getCollaboratorPermissionLevel({
    owner, repo, username: event.sender.login,
  });
  if (!['admin', 'maintain', 'write'].includes(permission.data.permission)) {
    core.notice('Only a repository maintainer may dispatch a cloud task.');
    return;
  }
  const issue_number = event.issue.number;
  const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number });
  if (issue.state !== 'open' || !issue.labels.some(label => label.name === READY)) return;
  const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number, per_page: 100 });
  if (comments.some(comment => comment.user?.login === 'github-actions[bot]' && comment.body?.includes(MARKER))) {
    await github.rest.issues.addLabels({ owner, repo, issue_number, labels: [ACTIVE] });
    await github.rest.issues.removeLabel({ owner, repo, issue_number, name: READY });
    core.notice('This issue already has a cloud dispatch marker; no duplicate mention posted.');
    return;
  }
  const active = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, state: 'open', labels: ACTIVE, per_page: 100,
  });
  if (active.some(item => !item.pull_request && item.number !== issue_number)) {
    core.setFailed('Another implementation issue is active. Finish it before marking this issue ready.');
    return;
  }
  // Reserve the active slot before delivery. Failures leave a visible issue for diagnosis.
  await github.rest.issues.addLabels({ owner, repo, issue_number, labels: [ACTIVE] });
  // Fixed prompt only: issue content is never interpolated into code or a shell.
  await github.rest.issues.createComment({
    owner, repo, issue_number,
    body: `${MARKER}\n@codex Read this issue and the repository AGENTS.md, README.md, docs/SCOPE.md, docs/SPEC.md, and docs/TASKS.md. Work only on this issue in Codex CLOUD. Follow its acceptance criteria and explicit read-only restrictions, if any. For implementation, use a feature/ branch based on current main, run meaningful checks, and prepare a reviewable PR. Do not merge, deploy, create additional issues, or start unrelated work. Report blockers precisely.`,
  });
  await github.rest.issues.removeLabel({ owner, repo, issue_number, name: READY });
  core.notice(`Posted one Codex cloud mention for issue #${issue_number}. Cloud acceptance must be observed separately.`);
};
