const C = require('./dist/core.js');
const out = {
  ranks: C.RANKS.map(r => ({ n: r.n, name: r.name, need: r.need, perk: r.perk })),
  gateItems: C.GATE_ITEMS.map(g => ({ id: g.id, icon: g.icon, title: g.title, ok: g.ok, bad: g.bad, critical: g.critical })),
  games: Object.keys(C.GAMES).map(k => { const g = C.GAMES[k]; return { id: g.id, title: g.title, tag: g.tag, cover: g.cover, intro: g.intro, kind: g.kind, per: g.per, secs: g.secs }; }),
  ticketTypes: Object.keys(C.CONFIG.ticketTypes).map(k => ({ id: k, label: C.CONFIG.ticketTypes[k].label, hint: C.CONFIG.ticketTypes[k].hint, sla: C.CONFIG.ticketTypes[k].sla })),
  farms: C.CONFIG.farms
};
process.stdout.write(JSON.stringify(out));
