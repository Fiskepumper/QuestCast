// Central registry - add new challenges here, order = display order on page
const challenges = [
  require('./metamask-registrations'),
  require('./microsoft-registrations'),
  require('./github-profiles'),
  require('./meet-the-team'),
];

async function getAllChallenges() {
  return Promise.all(challenges.map(c => c.getData()));
}

module.exports = { getAllChallenges };
