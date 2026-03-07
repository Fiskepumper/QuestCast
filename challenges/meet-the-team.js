// Challenge: Meet the Team
// Uses GitHub Collaborators API to show everyone with repo access
// Requires GITHUB_TOKEN environment variable (set in Azure App Service)

const REPO = 'Fiskepumper/QuestCast';

async function getCollaborators() {
  const token = process.env.GITHUB_TOKEN;
  const headers = { 'User-Agent': 'QuestCast-App' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/collaborators`, { headers });
    if (!response.ok) {
      console.warn(`GitHub collaborators API: ${response.status} - ${token ? 'token set' : 'no token set'}`);
      return [];
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('GitHub collaborators error:', err.message);
    return [];
  }
}

module.exports = {
  id: 2,
  uuid: 'b2c3d4e5-0002-4000-8000-meettheteam00',
  async getData() {
    const collaborators = await getCollaborators();
    return {
      id: this.id,
      uuid: this.uuid,
      title: 'Meet the Team',
      description: 'Folkene bak QuestCast',
      goal: 4,
      current: collaborators.length,
      unit: 'members',
      participants: collaborators.map(c => ({
        login: c.login,
        avatar: c.avatar_url,
        url: c.html_url
      }))
    };
  }
};
