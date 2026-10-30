const path = require('path');
const { execFileSync } = require('child_process');

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function gitRoot(dir) {
  try { return git(dir, ['rev-parse', '--show-toplevel']); } catch { return null; }
}

// Commits only the given files, whatever else is staged or modified in the repo.
function commitFiles(dir, files, message) {
  const root = gitRoot(dir);
  const rel = files.map((f) => path.relative(root, f));
  git(root, ['add', '--', ...rel]);
  git(root, ['commit', '-m', message, '--only', '--', ...rel]);
  return git(root, ['rev-parse', '--short', 'HEAD']);
}

function findCommit(dir, requestId) {
  try {
    return git(gitRoot(dir), ['log', '-1', '--format=%h', '--fixed-strings', `--grep=Request: ${requestId} `]) || null;
  } catch { return null; }
}

module.exports = { gitRoot, commitFiles, findCommit };
