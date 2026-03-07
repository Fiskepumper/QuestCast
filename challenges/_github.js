// Shared GitHub API helper - used by multiple challenges
// Cached so all challenges in one page load share a single API call

let cache = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

async function getContributors() {
  const now = Date.now();
  if (cache && (now - cacheTime) < CACHE_TTL_MS) return cache;

  try {
    const response = await fetch('https://api.github.com/repos/Fiskepumper/QuestCast/contributors', {
      headers: { 'User-Agent': 'QuestCast-App' }
    });
    if (!response.ok) return [];
    const data = await response.json();
    cache = Array.isArray(data) ? data : [];
    cacheTime = now;
    return cache;
  } catch (err) {
    console.error('GitHub API error:', err.message);
    return [];
  }
}

module.exports = { getContributors };
