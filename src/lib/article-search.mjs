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

export function searchArticle({ title, description, labels, body }, query) {
  let score = 0;
  let firstBodyMatch;
  for (const term of query.terms) {
    const bodyMatch = term.exec(body);
    if (bodyMatch && (!firstBodyMatch || bodyMatch.index < firstBodyMatch.index)) firstBodyMatch = bodyMatch;
    if (term.test(title)) score += 12;
    else if (term.test(labels)) score += 6;
    else if (term.test(description)) score += 4;
    else if (bodyMatch) score += 1;
    else return null;
  }
  if (query.phrase.test(title)) score += 10;
  const bodyPhrase = query.phrase.exec(body);
  const bodyMatch = bodyPhrase ?? firstBodyMatch;
  if (bodyPhrase && query.terms.length > 1) score += 2;
  let snippet = description;
  if (bodyMatch) snippet = excerpt(body, bodyMatch.index, bodyMatch[0].length);
  else if (query.terms.some(term => term.test(labels))) snippet = [description, labels].filter(Boolean).join(' · ');
  return { score, snippet };
}
