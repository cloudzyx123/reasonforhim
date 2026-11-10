export function canonicalUrl(site, path) {
  return new URL(path, site).href;
}

export function shareLinks(url, title) {
  return {
    x: `https://x.com/intent/tweet?${new URLSearchParams({ text: title, url })}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: url })}`,
  };
}

export function sharePolicy({ lang, wechat, canShare, narrow }) {
  return {
    copy: true,
    native: !wechat && canShare,
    platforms: !wechat,
    primary: wechat ? 'copy' : narrow && canShare ? 'native' : lang === 'zh' ? 'copy' : 'x',
  };
}
