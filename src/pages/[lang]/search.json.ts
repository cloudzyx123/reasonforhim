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

type Footnote = { id: string; text: string };
function clean(text: string) {
  return text.split('\n').map(part => part.trim().replace(/\s+/g, ' ')).filter(Boolean).join('\n');
}

function visibleText(node: DefaultTreeAdapterMap['node'], footnotes: Footnote[]): string {
  // Source line wraps are inline whitespace. Only HTML blocks delimit passages.
  if (node.nodeName === '#text' && 'value' in node) return node.value.replace(/\s+/g, ' ');
  if (node.nodeName === 'br') return ' ';
  if (!('childNodes' in node)) return '';
  if ('attrs' in node && (excluded.has(node.tagName) || node.attrs.some(({ name, value }) =>
    name === 'hidden' || (name === 'aria-hidden' && value === 'true') ||
    name === 'data-footnote-ref' || name === 'data-footnote-backref' ||
    (name === 'id' && value === 'footnote-label')))) return '';

  const text = node.childNodes.map(child => visibleText(child, footnotes)).join('');
  // Only a direct item of the rendered GFM footnote list is a deep-link target.
  if ('tagName' in node && node.tagName === 'li') {
    const list = node.parentNode;
    const section = list && 'tagName' in list && list.tagName === 'ol' ? list.parentNode : null;
    if (section && 'attrs' in section && section.attrs.some(attr => attr.name === 'data-footnotes')) {
      footnotes.push({ id: node.attrs.find(attr => attr.name === 'id')?.value ?? '', text: clean(text) });
      return ' ';
    }
  }
  return blocks.has(node.nodeName) ? '\n' + text + '\n' : text;
}

export const GET: APIRoute = async ({ params }) => {
  const { posts } = await catalogue(params.lang as Lang);
  const bodies = posts.map(post => {
    const html = post.rendered?.html;
    if (html === undefined) throw new Error(`Missing rendered article: ${post.collection}/${post.id}`);
    const footnotes: Footnote[] = [];
    const body = clean(visibleText(parseFragment(html), footnotes));
    return [post.id, { body, footnotes }];
  });
  return Response.json(Object.fromEntries(bodies));
};
