function normalize(text) {
  return text.toLowerCase().replace(/[^\w\s가-힣]/g, '').trim();
}

function getWords(text) {
  return normalize(text).split(/\s+/).filter(Boolean);
}

function wordOverlap(a, b) {
  const wordsA = new Set(getWords(a));
  const wordsB = new Set(getWords(b));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const smaller = Math.min(wordsA.size, wordsB.size);
  return intersection / smaller;
}

function isSimilar(titleA, titleB) {
  const a = normalize(titleA);
  const b = normalize(titleB);

  // Exact match
  if (a === b) return true;

  // Substring match
  if (a.includes(b) || b.includes(a)) return true;

  // Word overlap > 60%
  if (wordOverlap(titleA, titleB) > 0.6) return true;

  return false;
}

export function checkDuplicates(tickets, existingIssues) {
  const unique = [];
  const duplicates = [];

  for (const ticket of tickets) {
    const match = existingIssues.find(issue => isSimilar(ticket.title, issue.title));
    if (match) {
      duplicates.push({ ticket, matchedIssue: match });
    } else {
      unique.push(ticket);
    }
  }

  return { unique, duplicates };
}
