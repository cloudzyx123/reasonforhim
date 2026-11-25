import { git } from '../src/lib/syndication.mjs';

const REF = 'refs/heads/syndication-state';
const FILE = 'ledger.json';
const STATES = new Set(['pending', 'submitted', 'sent', 'failed', 'unknown']);
export const validChannelId = id => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id);

function validate(ledger, baseline) {
  if (ledger?.version !== 1 || !ledger.articles || Array.isArray(ledger.articles)
    || typeof ledger.articles !== 'object' || !Number.isFinite(ledger.retryAt)) {
    throw new Error('分发账本格式无效，已停止写入');
  }
  if (ledger.baseline !== baseline) throw new Error('分发账本与当前基线不一致，已停止写入');
  for (const [id, article] of Object.entries(ledger.articles)) {
    if (!/^[a-f0-9]{32}$/.test(id) || !Array.isArray(article.targets) || !article.targets.length
      || new Set(article.targets.map(target => target.channelId)).size !== article.targets.length
      || article.targets.some(target => !validChannelId(target.channelId) || !STATES.has(target.state)
        || !Number.isFinite(target.createdAt) || !Number.isFinite(target.updatedAt)
        || !Number.isFinite(target.retryAt)
        || (['submitted', 'sent'].includes(target.state) && !target.postId))) {
      throw new Error('分发账本条目无效，已停止写入');
    }
  }
  return ledger;
}

export function openLedger({ cwd = process.cwd(), baseline, initialize = false } = {}) {
  if (!baseline) throw new Error('请先配置分发基线');
  let head = git(['ls-remote', '--heads', 'origin', REF], cwd).split('\t')[0];
  if (initialize && head) throw new Error('分发账本已存在，初始化不会覆盖它');
  if (!initialize && !head) throw new Error('分发账本缺失，请恢复原分支或在首次上线时初始化');
  const data = head
    ? (() => {
      git(['fetch', '--no-tags', 'origin', REF], cwd);
      head = git(['rev-parse', 'FETCH_HEAD'], cwd);
      return validate(JSON.parse(git(['show', `${head}:${FILE}`], cwd)), baseline);
    })()
    : { version: 1, baseline, retryAt: 0, articles: {} };

  function save() {
    validate(data, baseline);
    const blob = git(['hash-object', '-w', '--stdin'], cwd, `${JSON.stringify(data, null, 2)}\n`);
    const tree = git(['mktree'], cwd, `100644 blob ${blob}\t${FILE}\n`);
    const commit = git([
      '-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
      'commit-tree', tree, ...(head ? ['-p', head] : []), '-m', 'Update syndication ledger',
    ], cwd);
    try {
      // The push must succeed before a post can be attempted. The lease also protects first creation.
      git(['push', `--force-with-lease=${REF}:${head}`, 'origin', `${commit}:${REF}`], cwd);
    } catch {
      throw new Error('分发账本写入失败，已停止处理；请检查 Actions 权限和账本分支');
    }
    head = commit;
  }
  if (initialize) save();
  return { data, save };
}
