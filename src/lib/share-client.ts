import { sharePolicy } from './share.mjs';

export function initShare(root: HTMLElement) {
  const lang = root.dataset.lang === 'zh' ? 'zh' : 'en';
  const url = root.dataset.url!;
  const data = { title: root.dataset.title!, text: root.dataset.description!, url };
  const wechat = /MicroMessenger/i.test(navigator.userAgent);
  const canShare = typeof navigator.share === 'function' && (typeof navigator.canShare !== 'function' || navigator.canShare(data));
  const narrow = matchMedia('(max-width: 600px)');
  const status = root.querySelector<HTMLElement>('[data-share-status]')!;
  const fallback = root.querySelector<HTMLInputElement>('[data-copy-fallback]')!;
  const copy = root.querySelector<HTMLButtonElement>('[data-copy-link]')!;
  const copyLabel = copy.querySelector<HTMLElement>('[data-copy-label]') ?? copy;
  const native = root.querySelector<HTMLButtonElement>('[data-native-share]')!;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;

  function update() {
    const policy = sharePolicy({ lang, wechat, canShare, narrow: narrow.matches });
    copy.hidden = false;
    native.hidden = !policy.native;
    root.querySelectorAll<HTMLElement>('[data-platform]').forEach(link => { link.hidden = !policy.platforms; });
    const hint = root.querySelector<HTMLElement>('[data-wechat-hint]');
    if (hint) hint.hidden = !wechat;
    root.dataset.primary = policy.primary;
  }
  update();
  narrow.addEventListener('change', update);

  copy.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    clearTimeout(timer);
    fallback.hidden = true;
    let copied = false;
    try { await navigator.clipboard.writeText(url); copied = true; } catch { /* Try legacy copy. */ }
    if (!copied) {
      fallback.value = url;
      fallback.hidden = false;
      fallback.focus();
      fallback.select();
      try { copied = document.execCommand('copy'); } catch { /* Manual selection remains available. */ }
    }
    if (copied) {
      fallback.hidden = true;
      copyLabel.textContent = lang === 'zh' ? '已复制' : 'Copied';
      status.textContent = lang === 'zh' ? '文章链接已复制。' : 'Article link copied.';
      timer = setTimeout(() => { copyLabel.textContent = lang === 'zh' ? '复制链接' : 'Copy link'; }, 1800);
    } else {
      status.textContent = lang === 'zh' ? '请复制选中的链接。' : 'Please copy the selected link.';
    }
    busy = false;
  });

  native.addEventListener('click', async () => {
    try { await navigator.share(data); }
    catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        status.textContent = lang === 'zh' ? '无法打开系统分享，请使用复制链接。' : 'Sharing failed. Please copy the link.';
      }
    }
  });
}
