import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { Miniflare } from 'miniflare';

// Exercise the built Worker with its real D1 API and independent browser cookies.
test('live 1v1: untimed answers, instant reveal, unlimited rounds, live settings, scores and reconnect', async () => {
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
   assert.equal(response.status,200); const html=await response.text(); assert.match(html,new RegExp(text));
   assert.match(html,/Read numbers aloud/);
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
  assert.equal((await post({action:'start',id},host)).status,400);
  const joined=await post({action:'join',id,name:'Guest'});assert.equal(joined.status,200);const guest=joined.cookie;
  assert.equal((await post({action:'join',id,name:'Third'})).status,400);
  assert.equal((await post({action:'start',id})).status,400);
  assert.equal((await post({action:'start',id},guest)).status,400);
  const started=await post({action:'start',id},host);assert.equal(started.status,200);assert.equal(started.data.phase,'countdown');
  assert.equal(started.data.valuesRound,0);assert.equal(started.data.values.length,2);assert.deepEqual(started.data.results,[]);
  assert.equal((await post({action:'answer',id,round:0,match:1,answer:0},host)).status,400);
  let room=await load(id);room.startsAt=Date.now()-100;room.roundStarts[0]=room.startsAt;await save(room);
  const a=await get(id,host),b=await get(id,guest);assert.equal(a.phase,'flash');assert.deepEqual(a.values,b.values);assert.equal(a.values.length,2);
  assert.ok(!JSON.stringify(a).includes(room.players[1].token));assert.ok(!('sets' in a));assert.equal((await get(id)).me,null);
  // Host edits affect the upcoming round, never the numbers already being shown.
  const currentNumbers=[...a.values];
  assert.equal((await post({action:'settings',id,settings:{digits:2,count:3,speed:0.2,gap:0}},guest)).status,400);
  const edited=await post({action:'settings',id,settings:{digits:2,count:3,speed:0.2,gap:0}},host);
  assert.equal(edited.status,200);assert.equal(edited.data.settingsForRound,1);
  assert.deepEqual((await get(id,host)).values,currentNumbers);
  assert.equal((await get(id,guest)).settings.count,3);
  for(let round=0;round<12;round++) {
   room=await load(id);
   const config=room.roundSettings[round];
   const flashMs=config.count*config.speed*1000+(config.count-1)*config.gap*1000;
   room.roundStarts[round]=Date.now()-flashMs-100;
   if(round>0)room.revealedAt[round-1]=Date.now()-10000;
   await save(room);
   const total=room.sets[round].reduce((a,b)=>a+b,0);
   if(round===0) {
    assert.equal((await post({action:'answer',id,round,match:1,answer:total},host)).status,200);
    // More than an hour can pass without a reveal, skipped round or answer timeout.
    room=await load(id);room.roundStarts[0]=Date.now()-3600000;await save(room);
    const waiting=await get(id,host);assert.equal(waiting.phase,'answer');assert.equal(waiting.time.endsAt,null);
    assert.equal(waiting.myAnswer,total);assert.equal(waiting.results.length,0);assert.deepEqual(waiting.players.map(p=>p.score),[0,0]);
    assert.equal((await post({action:'answer',id,round,match:1,answer:total+1},host)).status,400);
    const locked=await post({action:'answer',id,round,match:1,answer:total},guest);
    assert.equal(locked.status,200);assert.equal(locked.data.phase,'review');assert.equal(locked.data.results[0].total,total);
    assert.deepEqual(locked.data.players.map(p=>p.score),[1,1]);
    assert.equal(locked.data.roundSettings[1].count,3);assert.equal(locked.data.values.length,3);
    // Edits during review refresh the next round and leave a shared preload countdown.
    const duringReview=await post({action:'settings',id,settings:{count:4,speed:0.3}},host);
    assert.equal(duringReview.data.roundSettings[1].count,4);assert.equal(duringReview.data.values.length,4);
    assert.equal(duringReview.data.results[0].total,total);
    room=await load(id);room.revealedAt[0]=Date.now()-4100;room.roundStarts[1]=Date.now()+5000;await save(room);
    const countdown=await get(id,guest);assert.equal(countdown.phase,'countdown');assert.equal(countdown.time.round,1);
    assert.equal(countdown.time.settings.count,4);assert.equal(countdown.valuesRound,1);
    const duringCountdown=await post({action:'settings',id,settings:{count:3,speed:0.2}},host);
    assert.equal(duringCountdown.status,200);assert.equal(duringCountdown.data.time.settings.count,3);
    assert.ok(duringCountdown.data.time.endsAt-duringCountdown.data.serverNow>4500);
   } else {
    const responses=await Promise.all([
     post({action:'answer',id,round,match:1,answer:total},host),
     post({action:'answer',id,round,match:1,answer:round%2===0?total:total+1},guest),
    ]);responses.forEach(r=>assert.equal(r.status,200));
   }
   const reveal=await get(id,host);assert.equal(reveal.phase,round===0?'countdown':'review');assert.equal(reveal.results.at(-1).total,total);
   assert.equal(reveal.completed,round+1);assert.equal(reveal.results.length,round+1);
   assert.equal((await post({action:'answer',id,round,match:1,answer:total},guest)).status,400);
  }
  room=await load(id);room.revealedAt[11]=Date.now()-10000;room.roundStarts[12]=Date.now()-100;await save(room);
  const continuing=await get(id,host);assert.equal(continuing.phase,'flash');assert.equal(continuing.time.round,12);
  assert.deepEqual(continuing.players.map(p=>p.score),[12,6]);assert.equal(continuing.completed,12);
  const reconnected=await get(id,guest);assert.equal(reconnected.me,joined.data.me);assert.equal(reconnected.players[1].score,6);
  assert.equal((await post({action:'start',id},host)).status,400);
  assert.equal((await post({action:'leave',id},guest)).status,200);
  const ended=await get(id,host);assert.equal(ended.phase,'finished');assert.equal(ended.forfeited,joined.data.me);
  assert.deepEqual(ended.players.map(p=>p.score),[12,6]);
  assert.equal((await post({action:'start',id},host)).status,400);
  await get(id,guest);
  const rematch=await post({action:'start',id},host);assert.equal(rematch.status,200);assert.equal(rematch.data.match,2);
  assert.deepEqual(rematch.data.players.map(p=>p.score),[0,0]);assert.equal(rematch.data.completed,0);
  assert.equal((await post({action:'answer',id,round:0,match:1,answer:0},host)).status,400);
  // Older saved lobbies retain scores and get the new unlimited session clock.
  const legacy=await post({action:'create',name:'Legacy host',settings:{count:2,speed:1,gap:0}});
  await post({action:'join',id:legacy.data.id,name:'Legacy guest'});
  room=await load(legacy.data.id);room.sets=[[4,5],[6,7]];room.startsAt=Date.now()-21100;
  room.players.forEach(p=>{p.answers={0:9};});room.match=1;
  delete room.revealedAt;delete room.roundStarts;delete room.roundSettings;await save(room);
  const upgraded=await get(room.id,legacy.cookie);assert.equal(upgraded.completed,1);
  assert.deepEqual(upgraded.players.map(p=>p.score),[1,1]);assert.equal(upgraded.phase,'countdown');
  assert.equal(upgraded.time.round,1);assert.deepEqual(upgraded.values,[6,7]);
  room=await load(legacy.data.id);room.created=Date.now()-2*86400000;await save(room);
  assert.equal((await get(room.id,legacy.cookie)).me,legacy.data.me);
  const another=await post({action:'create',name:'Host'});
  const joinAttempts=await Promise.all(['First','Second'].map(name=>post({action:'join',id:another.data.id,name})));
  assert.deepEqual(joinAttempts.map(r=>r.status).sort(),[200,400]);
  assert.equal((await get(another.data.id,another.cookie)).players.length,2);
  room=await load(another.data.id);room.created=Date.now()-86400001;room.players.forEach(p=>p.seen=0);await save(room);
  const expired=await mf.dispatchFetch(`http://localhost/api/lobbies?id=${room.id}`);assert.equal(expired.status,404);
 } finally { await mf.dispose(); }
});
