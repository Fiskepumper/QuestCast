const { getCount } = require('./_registrations');

module.exports = {
  id: 3,
  uuid: 'c3d4e5f6-0003-4000-8000-instagram0reg',
  async getData() {
    const count = await getCount('instagram');
    return {
      id: this.id,
      uuid: this.uuid,
      title: 'Registrering Instagram',
      description: 'Mål: 50 QuestCast-brukere registrerer seg via Instagram',
      goal: 50,
      current: count,
      unit: 'registrerte',
      participants: []
    };
  }
};
