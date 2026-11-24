import type { APIRoute } from 'astro';
import { parseFragment } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { catalogue } from '../../lib/catalogue';
import type { Lang } from '../../lib/i18n';

export function getStaticPaths() {
  return ['zh', 'en'].map(lang => ({ params: { lang } }));
}

const blocks = new Set('address article aside blockquote br dd div dl dt figcaption figure h1 h2 h3 h4 h5 h6 hr li ol p pre section table td th tr ul'.split(' '));
const excluded = new Set(['script', 'style', 'template', 'nav', 'footer', 'svg']);

function visibleText(node: DefaultTreeAdapterMap['node']): string {
  if (node.nodeName === '#text' && 'value' in node) return node.value;
  if (!('childNodes' in node)) return '';
  if ('attrs' in node && (excluded.has(node.tagName) || node.attrs.some(({ name, value }) =>
    name === 'hidden' || (name === 'aria-hidden' && value === 'true') ||
    name === 'data-footnote-ref' || name === 'data-footnote-backref' ||
    (name === 'id' && value === 'footnote-label')))) return '';

  const text = node.childNodes.map(visibleText).join('');
  return blocks.has(node.nodeName) ? ' ' + text + ' ' : text;
}

export const GET: APIRoute = async ({ params }) => {
  const { posts } = await catalogue(params.lang as Lang);
  const bodies = posts.map(post => {
    const html = post.rendered?.html;
    if (html === undefined) throw new Error(`Missing rendered article: ${post.collection}/${post.id}`);
    return [post.id, visibleText(parseFragment(html)).replace(/\s+/g, ' ').trim()];
  });
  return Response.json(Object.fromEntries(bodies));
};
