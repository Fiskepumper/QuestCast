const { getContributors } = require('./_github');

// Challenge: Reach 4 GitHub contributors on the repo
module.exports = {
  id: 1,
  uuid: 'a1b2c3d4-0001-4000-8000-github0profiles',
  async getData() {
    const contributors = await getContributors();
    return {
      id: this.id,
      uuid: this.uuid,
      title: '4 GitHub Profiles',
      description: '4 utviklere må bidra til QuestCast-repoet på GitHub',
      goal: 4,
      current: contributors.length,
      unit: 'contributors',
      participants: contributors.map(c => ({
        login: c.login,
        avatar: c.avatar_url,
        url: c.html_url
      }))
    };
  }
};
