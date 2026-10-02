import { generate, normalize, type Settings } from '../training';

export const MATCH_ROUNDS = 10;
export const ANSWER_MS = 15000;
export const REVIEW_MS = 4000;
export const READY_MS = 5000;
export const ONLINE_MS = 20000;
export type Player = { id: string; token: string; name: string; ready: boolean; seen: number; answers: Record<number, number> };
export type Lobby = { id: string; created: number; settings: Settings; players: Player[]; sets: number[][]; startsAt: number | null; forfeited: string | null; finishedAt: number | null; match: number };
export type Timing = { phase: 'waiting'|'countdown'|'flash'|'answer'|'review'|'finished'; round: number; numberIndex: number; visible: boolean; endsAt: number; answerAt: number; reviewAt: number };
export function timings(room: Lobby, now: number): Timing {
 now = room.finishedAt ?? now;
 const flashMs = room.settings.count * room.settings.speed * 1000 + (room.settings.count - 1) * room.settings.gap * 1000;
 const cycle = flashMs + ANSWER_MS + REVIEW_MS;
 const start = room.startsAt ?? now;
 const elapsed = now - start;
 const round = Math.min(MATCH_ROUNDS - 1, Math.max(0, Math.floor(elapsed / cycle)));
 const roundStart = start + round * cycle;
 const answerAt = roundStart + flashMs, reviewAt = answerAt + ANSWER_MS;
 const offset = now - roundStart;
 const numberIndex = Math.min(room.settings.count - 1, Math.max(0, Math.floor(offset / ((room.settings.speed + room.settings.gap) * 1000))));
 const visible = offset >= 0 && offset - numberIndex * (room.settings.speed + room.settings.gap) * 1000 < room.settings.speed * 1000;
 const phase = room.forfeited ? 'finished' : room.startsAt === null ? 'waiting' : elapsed < 0 ? 'countdown' : elapsed >= MATCH_ROUNDS * cycle ? 'finished' : now < answerAt ? 'flash' : now < reviewAt ? 'answer' : 'review';
 const endsAt = phase === 'countdown' ? start : phase === 'flash' ? answerAt : phase === 'answer' ? reviewAt : roundStart + cycle;
 return { phase, round, numberIndex, visible, endsAt, answerAt, reviewAt };
}
export function createLobby(id: string, token: string, name: string, settings: Partial<Settings>, now: number): Lobby {
 return { id, created: now, settings: normalize(settings), players: [{ id: crypto.randomUUID(), token, name, ready: true, seen: now, answers: {} }], sets: [], startsAt: null, forfeited: null, finishedAt: null, match: 0 };
}
export function startMatch(room: Lobby, actor: Player, now: number) {
 if (actor.id !== room.players[0].id) throw new Error('Only the host can start the match.');
 const phase = timings(room, now).phase;
 if (phase !== 'waiting' && phase !== 'finished') throw new Error('A match is already in progress.');
 if (room.players.length !== 2 || room.players.some(p => !p.ready || now - p.seen > ONLINE_MS)) throw new Error('Both players need to be online and ready.');
 room.sets = Array.from({ length: MATCH_ROUNDS }, () => generate(room.settings));
 room.players.forEach(p => { p.answers = {}; p.ready = false; });
 room.startsAt = now + READY_MS; room.forfeited = null; room.finishedAt = null; room.match++;
}
export function submitAnswer(room: Lobby, player: Player, round: number, match: number, answer: number, now: number) {
 const time = timings(room, now);
 if (match !== room.match || time.phase !== 'answer' || time.round !== round) throw new Error('The answer window has closed or has not opened yet.');
 if (!Number.isSafeInteger(answer)) throw new Error('Enter a whole number.');
 if (Object.hasOwn(player.answers, round)) throw new Error('Your answer is already locked in.');
 player.answers[round] = answer;
}
export function publicLobby(room: Lobby, token: string | null, now: number) {
 const me = room.players.find(p => p.token === token);
 const time = timings(room, now);
 const completed = time.phase === 'finished' ? (room.forfeited ? time.round + ((room.finishedAt ?? 0) >= time.reviewAt ? 1 : 0) : MATCH_ROUNDS) : time.round + (time.phase === 'review' ? 1 : 0);
 const results = room.sets.slice(0, completed).map((values, round) => ({ round, total: values.reduce((a,b) => a+b, 0), answers: room.players.map(p => p.answers[round] ?? null) }));
 const players = room.players.map(p => ({ id: p.id, name: p.name, ready: p.ready, online: now-p.seen <= ONLINE_MS, score: results.filter(r => p.answers[r.round] === r.total).length, submitted: Object.hasOwn(p.answers, time.round) }));
 // Visitors only receive a lobby summary. Player secrets, future sets and unrevealed results never leave the server.
 if (!me) return { id: room.id, players: players.map(p => ({ id: p.id, name: p.name })), canJoin: room.players.length < 2 && time.phase === 'waiting', phase: time.phase, settings: room.settings, me: null, serverNow: now };
 const valuesRound = time.phase === 'countdown' ? 0 : time.phase === 'review' ? time.round + 1 : time.round;
 return { id: room.id, players, canJoin: false, me: me.id, host: room.players[0].id, settings: room.settings, match: room.match, startsAt: room.startsAt, serverNow: now, time, phase: time.phase, valuesRound, values: ['countdown','flash','review'].includes(time.phase) ? room.sets[valuesRound] ?? [] : [], results, myAnswer: me.answers[time.round] ?? null, forfeited: room.forfeited, finishedAt: room.finishedAt, rounds: MATCH_ROUNDS };
}
export type LobbyView = ReturnType<typeof publicLobby>;
