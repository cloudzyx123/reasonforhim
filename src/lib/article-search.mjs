function literalPattern(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function searchQuery(value) {
  const phrase = value.trim().replace(/\s+/g, ' ');
  if (!phrase) return null;
  const words = phrase.toLowerCase()
    .replace(/([\u3400-\u9fff])([a-z0-9])/g, '$1 $2')
    .replace(/([a-z0-9])([\u3400-\u9fff])/g, '$1 $2')
    .split(' ');
  const patterns = [...new Set(words)].sort((a, b) => b.length - a.length).map(literalPattern);
  return {
    phrase: new RegExp(literalPattern(phrase), 'i'),
    terms: patterns.map(pattern => new RegExp(pattern, 'i')),
    highlight: new RegExp(patterns.join('|'), 'gi'),
  };
}

function excerpt(text, offset, length) {
  const start = Math.max(0, offset - 24);
  const end = Math.min(text.length, Math.max(start + 112, offset + length + 24));
  return (start ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}

export function searchArticle({ title, description, labels, body, footnotes = [] }, query) {
  const passages = [{ text: body }, ...footnotes];
  const matchedTerms = new Set();
  let best = null;
  for (const [number, passage] of passages.entries()) {
    let first;
    let coverage = 0;
    for (const term of query.terms) {
      const match = term.exec(passage.text);
      if (!match) continue;
      matchedTerms.add(term);
      coverage++;
      if (!first || match.index < first.index) first = match;
    }
    if (!first) continue;
    const phrase = query.phrase.exec(passage.text);
    const priority = coverage + (phrase ? 1 : 0);
    if (!best || priority > best.priority) {
      best = { passage, number, match: phrase ?? first, phrase, priority };
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
  if (best?.phrase && query.terms.length > 1) score += 2;
  let snippet = description;
  if (best) snippet = excerpt(best.passage.text, best.match.index, best.match[0].length);
  else if (query.terms.some(term => term.test(labels))) snippet = [description, labels].filter(Boolean).join(' · ');
  const footnote = best?.passage.id ? { id: best.passage.id, number: best.number } : null;
  return { score, snippet, footnote };
}
