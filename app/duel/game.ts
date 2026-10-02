import { generate, normalize, type Settings } from '../training';

export const REVIEW_MS = 4000;
export const READY_MS = 5000;
export const ONLINE_MS = 20000;
export type Player = { id: string; token: string; name: string; seen: number; answers: Record<number, number> };
export type Lobby = {
 id: string; created: number; settings: Settings; players: Player[]; sets: number[][];
 startsAt: number | null; roundStarts: number[]; roundSettings: Settings[]; revealedAt: number[];
 forfeited: string | null; finishedAt: number | null; match: number;
};
export type Timing = {
 phase: 'waiting'|'countdown'|'flash'|'answer'|'review'|'finished'; round: number;
 numberIndex: number; visible: boolean; endsAt: number | null; answerAt: number; reviewAt: number | null;
 settings: Settings;
};
type MatchClock = Pick<Lobby, 'settings'|'startsAt'|'roundStarts'|'roundSettings'|'revealedAt'|'forfeited'|'finishedAt'>;
export function timings(room: MatchClock, now: number): Timing {
 now = room.finishedAt ?? now;
 let round = 0;
 while (room.revealedAt[round] !== undefined && now >= room.revealedAt[round] + REVIEW_MS) round++;
 const settings = room.roundSettings[round] ?? room.settings;
 const roundStart = room.roundStarts[round] ?? room.startsAt ?? now;
 const flashMs = settings.count * settings.speed * 1000 + (settings.count - 1) * settings.gap * 1000;
 const answerAt = roundStart + flashMs, reviewAt = room.revealedAt[round] ?? null;
 const offset = now - roundStart;
 const numberIndex = Math.min(settings.count - 1, Math.max(0, Math.floor(offset / ((settings.speed + settings.gap) * 1000))));
 const visible = offset >= 0 && offset - numberIndex * (settings.speed + settings.gap) * 1000 < settings.speed * 1000;
 const phase = room.forfeited ? 'finished' : room.startsAt === null ? 'waiting' : reviewAt !== null ? 'review' : now < roundStart ? 'countdown' : now < answerAt ? 'flash' : 'answer';
 const endsAt = phase === 'countdown' ? roundStart : phase === 'flash' ? answerAt : phase === 'review' ? reviewAt! + REVIEW_MS : null;
 return { phase, round, numberIndex, visible, endsAt, answerAt, reviewAt, settings };
}
function prepareRound(room: Lobby, round: number, startsAt: number) {
 room.roundSettings[round] = { ...room.settings };
 room.sets[round] = generate(room.settings);
 room.roundStarts[round] = startsAt;
}
// Upgrade stored lobbies without losing their players, answers or revealed scores.
export function upgradeLobby(room: Lobby, now: number) {
 if (Array.isArray(room.roundStarts) && Array.isArray(room.roundSettings) && Array.isArray(room.revealedAt)) return false;
 const flashMs = room.settings.count * room.settings.speed * 1000 + (room.settings.count - 1) * room.settings.gap * 1000;
 const oldCycle = flashMs + 15000 + REVIEW_MS;
 const cutoff = room.finishedAt ?? now;
 if (!Array.isArray(room.revealedAt)) {
  room.revealedAt = [];
  if (room.startsAt !== null) for (let round = 0; round < room.sets.length; round++) {
   const oldReveal = room.startsAt + round * oldCycle + flashMs + 15000;
   if (oldReveal <= cutoff) room.revealedAt.push(oldReveal);
   else {
    if (cutoff >= oldReveal - 15000 && room.players.length === 2 && room.players.every(p => Object.hasOwn(p.answers, round))) room.revealedAt.push(cutoff);
    break;
   }
  }
 }
 room.roundSettings = room.sets.map(() => ({ ...room.settings }));
 room.roundStarts = room.sets.map((_,round) => round === 0 ? room.startsAt ?? now : (room.revealedAt[round-1] ?? now) + REVIEW_MS + READY_MS);
 if (room.startsAt !== null && !room.forfeited) {
  const round = room.revealedAt.length;
  // Give existing sessions a synchronized countdown for their first round after the upgrade.
  room.roundStarts[round] = now + READY_MS;
  if (!room.sets[round]) prepareRound(room,round,now+READY_MS);
  room.sets = room.sets.slice(0,round+1);
  room.roundSettings = room.roundSettings.slice(0,round+1);
  room.roundStarts = room.roundStarts.slice(0,round+1);
 }
 return true;
}
export function createLobby(id: string, token: string, name: string, settings: Partial<Settings>, now: number): Lobby {
 return { id, created: now, settings: normalize(settings), players: [{ id: crypto.randomUUID(), token, name, seen: now, answers: {} }], sets: [], startsAt: null, roundStarts: [], roundSettings: [], revealedAt: [], forfeited: null, finishedAt: null, match: 0 };
}
export function startMatch(room: Lobby, actor: Player, now: number) {
 if (actor.id !== room.players[0].id) throw new Error('Only the host can start the session.');
 const phase = timings(room, now).phase;
 if (phase !== 'waiting' && phase !== 'finished') throw new Error('A session is already in progress.');
 if (room.players.length !== 2 || room.players.some(p => now - p.seen > ONLINE_MS)) throw new Error('Both players need to be online.');
 room.players.forEach(p => { p.answers = {}; });
 room.sets = []; room.roundStarts = []; room.roundSettings = []; room.revealedAt = [];
 room.startsAt = now + READY_MS; room.forfeited = null; room.finishedAt = null; room.match++;
 prepareRound(room,0,room.startsAt);
}
export function changeSettings(room: Lobby, actor: Player, settings: Partial<Settings>, now: number) {
 if (actor.id !== room.players[0].id) throw new Error('Only the host can change match settings.');
 const time = timings(room,now);
 room.settings = normalize({ ...room.settings, ...settings });
 if (time.phase === 'countdown') {
  // Restart the countdown so both browsers can load the changed numbers before they appear.
  prepareRound(room,time.round,Math.max(room.roundStarts[time.round],now+READY_MS));
 } else if (time.phase === 'review') {
  prepareRound(room,time.round+1,Math.max(room.roundStarts[time.round+1],now+READY_MS));
 }
 // During flashes or answering, keep the current round intact and use these settings for the next one.
}
export function submitAnswer(room: Lobby, player: Player, round: number, match: number, answer: number, now: number) {
 const time = timings(room, now);
 if (match !== room.match || time.phase !== 'answer' || time.round !== round) throw new Error('The answer window has closed or has not opened yet.');
 if (!Number.isSafeInteger(answer)) throw new Error('Enter a whole number.');
 if (Object.hasOwn(player.answers, round)) throw new Error('Your answer is already locked in.');
 player.answers[round] = answer;
 if (room.players.length === 2 && room.players.every(p => Object.hasOwn(p.answers, round))) {
  room.revealedAt[round] = now;
  prepareRound(room,round+1,now+REVIEW_MS+READY_MS);
 }
}
export function publicLobby(room: Lobby, token: string | null, now: number) {
 const me = room.players.find(p => p.token === token);
 const time = timings(room, now);
 const completed = room.revealedAt.length;
 const results = room.sets.slice(0, completed).map((values, round) => ({ round, total: values.reduce((a,b) => a+b, 0), answers: room.players.map(p => p.answers[round] ?? null) }));
 const players = room.players.map(p => ({ id: p.id, name: p.name, online: now-p.seen <= ONLINE_MS, score: results.filter(r => p.answers[r.round] === r.total).length, submitted: Object.hasOwn(p.answers, time.round) }));
 // Player secrets, future sets and unrevealed results never leave the server.
 if (!me) return { id: room.id, players: players.map(p => ({ id: p.id, name: p.name })), canJoin: room.players.length < 2 && time.phase === 'waiting', phase: time.phase, settings: room.settings, me: null, serverNow: now };
 const valuesRound = time.phase === 'review' ? time.round + 1 : time.round;
 const settingsForRound = time.phase === 'countdown' || time.phase === 'waiting' ? time.round : time.round + 1;
 return { id: room.id, players, canJoin: false, me: me.id, host: room.players[0].id, settings: room.settings, settingsForRound, match: room.match, startsAt: room.startsAt, roundStarts: room.roundStarts, roundSettings: room.roundSettings, revealedAt: room.revealedAt, serverNow: now, time, phase: time.phase, valuesRound, values: ['countdown','flash','review'].includes(time.phase) ? room.sets[valuesRound] ?? [] : [], results, myAnswer: me.answers[time.round] ?? null, forfeited: room.forfeited, finishedAt: room.finishedAt, completed };
}
export type LobbyView = ReturnType<typeof publicLobby>;
