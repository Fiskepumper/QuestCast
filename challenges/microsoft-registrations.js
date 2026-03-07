const { getCount } = require('./_registrations');

module.exports = {
  id: 4,
  uuid: 'd4e5f6a7-0004-4000-8000-microsoft0reg',
  async getData() {
    const count = await getCount('microsoft');
    return {
      id: this.id,
      uuid: this.uuid,
      title: 'Registrering Microsoft',
      description: 'Mål: 50 QuestCast-brukere registrerer seg via Microsoft',
      goal: 50,
      current: count,
      unit: 'registrerte',
      participants: []
    };
  }
};
