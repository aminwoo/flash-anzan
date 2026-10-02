import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { Miniflare } from 'miniflare';

// Exercise the built Worker with its real D1 API and independent browser cookies.
test('live 1v1: invites, two-player limit, authorization, rounds, scoring, reconnect and rematch', async () => {
 const root = new URL('../dist/server/', import.meta.url);
 const files = (await readdir(root,{recursive:true})).filter(f=>f.endsWith('.js')).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:0);
 const modules = await Promise.all(files.map(async path=>({type:'ESModule',path:new URL(path,root).pathname,contents:await readFile(new URL(path,root),'utf8')})));
 const mf = new Miniflare({
  modules,
  modulesRoot: new URL('../dist/server/', import.meta.url).pathname,
  modulesRules: [{type:'ESModule',include:['**/*.js'],fallthrough:true}],
  compatibilityDate:'2026-05-15', compatibilityFlags:['nodejs_compat'],
  d1Databases:['DB'], serviceBindings:{ASSETS:()=>new Response('Not found',{status:404})},
 });
 try {
  const db=await mf.getD1Database('DB');
  const sql=await readFile(new URL('../drizzle/0000_pale_absorbing_man.sql',import.meta.url),'utf8');
  await db.prepare(sql.trim()).run();
  for(const [path,text] of [['/','Make every number count.'],['/duel','Two minds. One challenge.']]) {
   const response=await mf.dispatchFetch(`http://localhost${path}`);
   assert.equal(response.status,200); assert.match(await response.text(),new RegExp(text));
  }
  const post=async (body,cookie='')=>{
   const response=await mf.dispatchFetch('http://localhost/api/lobbies',{method:'POST',headers:{'Content-Type':'application/json',cookie,origin:'http://localhost'},body:JSON.stringify(body)});
   return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  const get=async(id,cookie='')=>{const response=await mf.dispatchFetch(`http://localhost/api/lobbies?id=${id}`,{headers:{cookie}});return response.json();};
  const load=async id=>JSON.parse((await db.prepare('SELECT state FROM lobbies WHERE id=?').bind(id).first()).state);
  const save=async room=>db.prepare('UPDATE lobbies SET state=?,revision=revision+1 WHERE id=?').bind(JSON.stringify(room),room.id).run();
  const created=await post({action:'create',name:'Host',settings:{count:2,speed:1,gap:0,digits:1}});
  assert.equal(created.status,201);const id=created.data.id,host=created.cookie;
  assert.ok(host);assert.equal(created.data.players.length,1);
  const invitation=await get(id);assert.equal(invitation.canJoin,true);assert.equal(invitation.me,null);assert.ok(!JSON.stringify(invitation).includes('token'));
  const joined=await post({action:'join',id,name:'Guest'});assert.equal(joined.status,200);const guest=joined.cookie;
  assert.equal((await post({action:'join',id,name:'Third'})).status,400);
  assert.equal((await post({action:'start',id})).status,400);
  assert.equal((await post({action:'start',id},host)).status,400);
  await post({action:'ready',id,ready:true},guest);
  assert.equal((await post({action:'start',id},guest)).status,400);
  const started=await post({action:'start',id},host);assert.equal(started.status,200);assert.equal(started.data.phase,'countdown');
  assert.equal(started.data.valuesRound,0);assert.equal(started.data.values.length,2);assert.deepEqual(started.data.results,[]);
  assert.equal((await post({action:'answer',id,round:0,match:1,answer:0},host)).status,400);
  let room=await load(id);room.startsAt=Date.now()-100;await save(room);
  const a=await get(id,host),b=await get(id,guest);assert.equal(a.phase,'flash');assert.deepEqual(a.values,b.values);assert.equal(a.values.length,2);
  assert.ok(!JSON.stringify(a).includes(room.players[1].token));assert.ok(!('sets' in a));assert.equal((await get(id)).me,null);
  // Accelerate the server clock without waiting through ten rounds.
  const cycle=2000+15000+4000;
  for(let round=0;round<10;round++) {
   room=await load(id);room.startsAt=Date.now()-round*cycle-2100;await save(room);
   const total=room.sets[round].reduce((a,b)=>a+b,0);
   const responses=await Promise.all([
    post({action:'answer',id,round,match:1,answer:total},host),
    post({action:'answer',id,round,match:1,answer:round%2===0?total:total+1},guest),
   ]);responses.forEach(r=>assert.equal(r.status,200));
   assert.equal((await post({action:'answer',id,round,match:1,answer:total+1},host)).status,400);
   const hidden=await get(id,guest);assert.equal(hidden.results.length,round);assert.equal(hidden.myAnswer,round%2===0?total:total+1);
   room=await load(id);room.startsAt=Date.now()-round*cycle-17100;await save(room);
   const reveal=await get(id,host);assert.equal(reveal.phase,'review');assert.equal(reveal.results.at(-1).total,total);
   assert.equal((await post({action:'answer',id,round,match:1,answer:total},guest)).status,400);
  }
  room=await load(id);room.startsAt=Date.now()-10*cycle-100;await save(room);
  const finished=await get(id,host);assert.equal(finished.phase,'finished');assert.deepEqual(finished.players.map(p=>p.score),[10,5]);
  const reconnected=await get(id,guest);assert.equal(reconnected.me,joined.data.me);assert.equal(reconnected.players[1].score,5);
  assert.equal((await post({action:'start',id},host)).status,400);
  await post({action:'ready',id,ready:true},host);await post({action:'ready',id,ready:true},guest);
  const rematch=await post({action:'start',id},host);assert.equal(rematch.status,200);assert.equal(rematch.data.match,2);assert.deepEqual(rematch.data.players.map(p=>p.score),[0,0]);
  assert.equal((await post({action:'answer',id,round:0,match:1,answer:0},host)).status,400);
  room=await load(id);room.startsAt=Date.now()-10*cycle-100;await save(room);
  assert.deepEqual((await get(id,host)).players.map(p=>p.score),[0,0]);
  assert.equal((await post({action:'leave',id},guest)).status,200);
  assert.equal((await get(id,host)).forfeited,joined.data.me);
  const another=await post({action:'create',name:'Host'});
  const joinAttempts=await Promise.all(['First','Second'].map(name=>post({action:'join',id:another.data.id,name})));
  assert.deepEqual(joinAttempts.map(r=>r.status).sort(),[200,400]);
  assert.equal((await get(another.data.id,another.cookie)).players.length,2);
  room=await load(another.data.id);room.created=Date.now()-86400001;await save(room);
  const expired=await mf.dispatchFetch(`http://localhost/api/lobbies?id=${room.id}`);assert.equal(expired.status,404);
 } finally { await mf.dispose(); }
});
