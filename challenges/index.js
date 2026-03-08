// Central registry - add new challenges here, order = display order on page
const challenges = [
  require('./metamask-registrations'),
  require('./microsoft-registrations'),
  require('./github-profiles'),
  require('./meet-the-team'),
  require('./coinflip-challenge'), // 1v1 betting system
];

async function getAllChallenges() {
  return Promise.all(challenges.map(c => c.getData()));
}

module.exports = { getAllChallenges };
