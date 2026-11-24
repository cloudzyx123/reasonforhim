function literalPattern(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function searchQuery(value) {
  const phrase = value.trim().replace(/\s+/g, ' ');
  if (!phrase) return null;
  const groups = phrase.toLowerCase().split(' ').map(word => word
    .replace(/([\u3400-\u9fff])([a-z0-9])/g, '$1 $2')
    .replace(/([a-z0-9])([\u3400-\u9fff])/g, '$1 $2')
    .split(' ').map(term => literalPattern(term).replace(/\b[a-z]{1,3}\b/g, word => '\\b' + word + '\\b')));
  const patterns = [...new Set(groups.flat())].sort((a, b) => b.length - a.length);
  return {
    phrase: new RegExp(groups.map(group => group.join('')).join(' '), 'i'),
    terms: patterns.map(pattern => new RegExp(pattern, 'i')),
    highlight: new RegExp(patterns.join('|'), 'gi'),
  };
}

// Advance the leftmost term to find the shortest span containing every
// matched term, including later repetitions within a long paragraph.
function closestMatches(text, terms) {
  if (terms.length === 1) {
    const match = terms[0].exec(text);
    return { hits: [match], width: match[0].length };
  }
  const cursors = terms.map(term => new RegExp(term.source, 'gi'));
  const hits = cursors.map(cursor => cursor.exec(text));
  let best = hits.slice();
  let width = Infinity;
  while (true) {
    let left = 0;
    let end = 0;
    for (const [i, hit] of hits.entries()) {
      if (hit.index < hits[left].index) left = i;
      end = Math.max(end, hit.index + hit[0].length);
    }
    const span = end - hits[left].index;
    if (span < width) {
      width = span;
      best = hits.slice();
    }
    hits[left] = cursors[left].exec(text);
    if (!hits[left]) return { hits: best, width };
  }
}

function excerpt(text, hits) {
  const ordered = [...hits].sort((a, b) => a.index - b.index);
  const ranges = [];
  for (const hit of ordered) {
    let start = Math.max(0, hit.index - 24);
    let end = Math.min(text.length, Math.max(start + 96, hit.index + hit[0].length + 24));
    // Keep English word boundaries intact when the excerpt is highlighted.
    while (start > 0 && /\w/.test(text[start]) && /\w/.test(text[start - 1])) start--;
    while (end < text.length && /\w/.test(text[end]) && /\w/.test(text[end - 1])) end++;
    const previous = ranges[ranges.length - 1];
    if (previous && start <= previous.end) previous.end = Math.max(previous.end, end);
    else ranges.push({ start, end });
  }
  const parts = ranges.map(({ start, end }) => text.slice(start, end).trim());
  return (ranges[0].start ? '…' : '') + parts.join(' … ') + (ranges[ranges.length - 1].end < text.length ? '…' : '');
}

export function searchArticle({ title, description, labels, body, footnotes = [] }, query) {
  const passages = [{ text: body }, ...footnotes];
  const matchedTerms = new Set();
  let best = null;
  passagesLoop: for (const [number, passage] of passages.entries()) {
    for (const paragraph of passage.text.split('\n')) {
      const phrase = query.phrase.exec(paragraph);
      if (phrase) {
        best = { paragraph, passage, number, hits: [phrase], coverage: query.terms.length, phrase: true };
        for (const term of query.terms) matchedTerms.add(term);
        break passagesLoop;
      }
      const terms = query.terms.filter(term => term.test(paragraph));
      for (const term of terms) matchedTerms.add(term);
      const coverage = terms.length;
      if (!coverage || (best && coverage < best.coverage)) continue;
      const window = closestMatches(paragraph, terms);
      if (!best || coverage > best.coverage || (coverage > 1 && window.width < best.width)) {
        best = { paragraph, passage, number, coverage, ...window };
      }
    }
  }
  let score = 0;
  for (const term of query.terms) {
    if (term.test(title)) score += 12;
    else if (term.test(labels)) score += 6;
    else if (term.test(description)) score += 4;
    else if (matchedTerms.has(term)) score += 1;
    else return null;
  }
  if (query.phrase.test(title)) score += 10;
  if (best && best.coverage > 1) {
    score += 3 * (best.coverage - 1);
    if (best.phrase) score += 2;
  }
  let snippet = description;
  if (best) snippet = excerpt(best.paragraph, best.hits);
  else if (query.terms.some(term => term.test(labels))) snippet = [description, labels].filter(Boolean).join(' · ');
  const footnote = best?.passage.id ? { id: best.passage.id, number: best.number } : null;
  return { score, snippet, footnote };
}
