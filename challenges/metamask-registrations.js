const { getCount } = require('./_registrations');

module.exports = {
  id: 5,
  uuid: 'e5f6a7b8-0005-4000-8000-metamask0reg0',
  async getData() {
    const count = await getCount('metamask');
    return {
      id: this.id,
      uuid: this.uuid,
      title: 'Registrering MetaMask',
      description: 'Mål: 3 QuestCast-brukere kobler til med MetaMask-lommebok',
      goal: 3,
      current: count,
      unit: 'registrerte',
      participants: []
    };
  }
};
