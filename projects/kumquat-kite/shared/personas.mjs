// The six synthetic demo personas of the Kumquat Kite demo (made-up people), the only people in the database. Shared
// by the seed, the app server's demo sessions, the persona switcher and the tests. Each has a fixed ID, so the seed,
// a demo reset and the walkthrough always refer to the same person. There is no password: choosing a persona is a
// demo identity selection, not a sign-in. Emails use example.com, which is reserved and never delivers mail.
export const PERSONAS = {
  bd:      { id: '4b4b0000-0000-4000-8000-000000000001', email: 'bd.demo@example.com',      name: 'Duong Trinh', title: 'Business development (BD)', roles: ['bd'] },
  account: { id: '4b4b0000-0000-4000-8000-000000000002', email: 'account.demo@example.com', name: 'Bao Nguyen',  title: 'Account manager', roles: ['account'] },
  finance: { id: '4b4b0000-0000-4000-8000-000000000003', email: 'finance.demo@example.com', name: 'Mai Le',      title: 'Finance controller', roles: ['finance'] },
  design:  { id: '4b4b0000-0000-4000-8000-000000000004', email: 'design.demo@example.com',  name: 'Khai Vo',     title: 'Designer', roles: ['design'] },
  studio:  { id: '4b4b0000-0000-4000-8000-000000000005', email: 'studio.demo@example.com',  name: 'Khoi Dang',   title: 'Studio operator', roles: ['studio'] },
  admin:   { id: '4b4b0000-0000-4000-8000-000000000006', email: 'admin.demo@example.com',   name: 'Kim Ho',      title: 'Admin — data and access', roles: ['admin'] },
};

export const PERSONA_KEYS = Object.keys(PERSONAS);
export const PERSONA_IDS = Object.fromEntries(Object.entries(PERSONAS).map(([key, p]) => [key, p.id]));
export const personaById = (id) => Object.entries(PERSONAS).find(([, p]) => p.id === id)?.[0] ?? null;
