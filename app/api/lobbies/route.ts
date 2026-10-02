import type { Settings } from '../../training';
import { getDb } from '../../../db';
import { createLobby, publicLobby, startMatch, changeSettings, submitAnswer, timings, upgradeLobby, type Lobby } from '../../duel/game';
export const dynamic = 'force-dynamic';
const cookieName = (id: string) => `anzan-duel-${id}`;
const tokenFrom = (request: Request, id: string) => request.headers.get('cookie')?.split(';').map(c => c.trim()).find(c => c.startsWith(cookieName(id)+'='))?.split('=')[1] ?? null;
const reply = (value: unknown, status = 200, cookie?: string) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...(cookie ? {'Set-Cookie':cookie} : {}) } });
const cookie = (request: Request, id: string, token: string) => `${cookieName(id)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
function database() { return getDb().$client; }
async function read(id: string): Promise<{room: Lobby; revision: number}> {
 if (!/^[a-f0-9]{16}$/.test(id)) throw new Error('Lobby not found.');
 const row = await database().prepare('SELECT state, revision FROM lobbies WHERE id = ?').bind(id).first<{state:string;revision:number}>();
 if (!row) throw new Error('Lobby not found.');
 const room = JSON.parse(row.state) as Lobby;
 if (Date.now() - Math.max(room.created,...room.players.map(p=>p.seen)) > 86400000) throw new Error('This lobby has expired. Create a new one.');
 if (upgradeLobby(room, Date.now())) {
  const updated = await database().prepare('UPDATE lobbies SET state = ?, revision = revision + 1 WHERE id = ? AND revision = ?').bind(JSON.stringify(room), id, row.revision).run();
  if (updated.meta.changes !== 1) return read(id);
  return {room, revision:row.revision + 1};
 }
 return {room, revision:row.revision};
}
async function update(id: string, fn: (room: Lobby) => void) {
 for (let attempt=0; attempt<8; attempt++) {
  const {room, revision} = await read(id);
  fn(room);
  const result = await database().prepare('UPDATE lobbies SET state = ?, revision = revision + 1 WHERE id = ? AND revision = ?').bind(JSON.stringify(room), id, revision).run();
  if (result.meta.changes === 1) return room;
 }
 throw new Error('The lobby is busy. Please try again.');
}
function errorResponse(error: unknown) {
 const message = error instanceof Error ? error.message : 'Unable to reach the lobby.';
 const known = /Lobby not found|expired|Only|Both|already|whole number|answer window|full|Join|progress|name|action|busy|ready|Invalid/.test(message);
 return reply({error: known ? message : 'Unable to reach the lobby. Please try again.'}, /not found|expired/.test(message) ? 404 : known ? 400 : 503);
}
export async function GET(request: Request) {
 try {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  let {room} = await read(id);
  const token = tokenFrom(request,id), me = room.players.find(p => p.token === token);
  if (me && Date.now()-me.seen > 5000) room = await update(id,r => { const player=r.players.find(p=>p.token===token); if(player)player.seen=Date.now(); });
  return reply(publicLobby(room,token,Date.now()),200,me&&token?cookie(request,id,token):undefined);
 } catch(error) { return errorResponse(error); }
}
export async function POST(request: Request) {
 try {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return reply({error:'Invalid request origin.'},403);
  if (Number(request.headers.get('content-length')) > 8192) return reply({error:'Invalid request.'},413);
  const raw: unknown = await request.json();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid request.');
  const body = raw as Record<string, unknown>;
  const action = body.action;
  const name = typeof body.name === 'string' ? body.name.trim().slice(0,24) : '';
  if (action === 'create') {
   if (!name) throw new Error('Enter your name.');
   const id=crypto.randomUUID().replaceAll('-','').slice(0,16), token=crypto.randomUUID();
   const room=createLobby(id,token,name,(body.settings && typeof body.settings === 'object' ? body.settings : {}) as Partial<Settings>,Date.now());
   await database().prepare('INSERT INTO lobbies (id,state,revision) VALUES (?,?,0)').bind(id,JSON.stringify(room)).run();
   return reply(publicLobby(room,token,Date.now()),201,cookie(request,id,token));
  }
  const id = typeof body.id === 'string' ? body.id : '';
  let token=tokenFrom(request,id);
  if (action === 'join') {
   if (!name) throw new Error('Enter your name.');
   token ??= crypto.randomUUID();
   const room = await update(id,r => {
    if (r.players.some(p=>p.token===token)) return;
    if (r.players.length>=2 || timings(r,Date.now()).phase!=='waiting') throw new Error('This lobby is full or a match is already in progress.');
    r.players.push({id:crypto.randomUUID(),token:token!,name,ready:false,seen:Date.now(),answers:{}});
   });
   return reply(publicLobby(room,token,Date.now()),200,cookie(request,id,token));
  }
  const room = await update(id,r => {
   const me=r.players.find(p=>p.token===token);
   if(!me) throw new Error('Join the lobby first.');
   const now=Date.now(); me.seen=now;
   if(action==='ready') {
    const phase=timings(r,now).phase;
    if(phase!=='waiting' && phase!=='finished')throw new Error('A match is in progress.');
    me.ready=body.ready===true;
   } else if(action==='start') startMatch(r,me,now);
   else if(action==='settings') {
    if(!body.settings||typeof body.settings!=='object'||Array.isArray(body.settings))throw new Error('Invalid settings.');
    changeSettings(r,me,body.settings as Partial<Settings>,now);
   }
   else if(action==='answer') {
    if(typeof body.round!=='number'||typeof body.match!=='number'||typeof body.answer!=='number') throw new Error('Invalid answer.');
    submitAnswer(r,me,body.round,body.match,body.answer,now);
   }
   else if(action==='leave') {
    if(timings(r,now).phase==='waiting' && me.id!==r.players[0].id) r.players=r.players.filter(p=>p.id!==me.id);
    else { r.forfeited=me.id; r.finishedAt=now; r.players.forEach(p=>{p.ready=false;}); }
    me.seen=0;
   } else throw new Error('Invalid lobby action.');
  });
  return reply(publicLobby(room,token,Date.now()));
 } catch(error) { return errorResponse(error); }
}
