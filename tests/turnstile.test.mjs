import test from 'node:test';
import assert from 'node:assert/strict';
import {turnstileConfig,verifyTurnstile} from '../worker/turnstile.js';

const env={TURNSTILE_SITE_KEY:'test-public-site-key',TURNSTILE_SECRET_KEY:'test-only-secret',TURNSTILE_EXPECTED_HOSTNAME:'catan.example'};
const valid={success:true,hostname:'catan.example',action:'catan_room'};

test('Turnstile config exposes only the public site key and rejects incomplete configuration',()=>{
  assert.deepEqual(turnstileConfig(env),{required:true,siteKey:env.TURNSTILE_SITE_KEY});
  for(const key of Object.keys(env)){
    for(const value of [undefined,'','   ',false])assert.throws(()=>turnstileConfig({...env,[key]:value}),error=>error.status===503);
  }
  assert.throws(()=>turnstileConfig(),error=>error.status===503);
});

test('Turnstile verifies the supplied token server-side with the configured secret and visitor IP',async()=>{
  const calls=[];
  await verifyTurnstile(env,'fresh-token','203.0.113.8',async(url,options)=>{
    calls.push({url,options});
    assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(options.method,'POST');
    assert.deepEqual(Object.fromEntries(options.body),{secret:env.TURNSTILE_SECRET_KEY,response:'fresh-token',remoteip:'203.0.113.8'});
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(valid);
  });
  assert.equal(calls.length,1);
  await verifyTurnstile(env,'another-token','unknown',async(url,options)=>{
    assert.equal(options.body.has('remoteip'),false);
    return Response.json(valid);
  });
});

test('Turnstile rejects missing and oversized tokens before calling Siteverify',async()=>{
  let calls=0;const verifyFetch=async()=>{calls++;return Response.json(valid);};
  for(const token of [undefined,null,'','  ',false,{},'x'.repeat(2049)])await assert.rejects(()=>verifyTurnstile(env,token,'unknown',verifyFetch),error=>error.status===403);
  await assert.rejects(()=>verifyTurnstile({},'token','unknown',verifyFetch),error=>error.status===503);
  assert.equal(calls,0);
});

test('Turnstile requires a boolean success and exact hostname and action',async()=>{
  for(const value of [
    {...valid,success:false,'error-codes':['timeout-or-duplicate']},
    {...valid,success:'true'},
    {...valid,hostname:'catan.example.evil.test'},
    {...valid,hostname:'CATAN.EXAMPLE'},
    {...valid,action:'patchwork_room'},
    {...valid,action:undefined},
    null,{},[],
  ])await assert.rejects(()=>verifyTurnstile(env,'token','unknown',async()=>Response.json(value)),error=>error.status===403);
});

test('Turnstile rejects network, upstream HTTP and invalid JSON failures',async()=>{
  for(const verifyFetch of [
    async()=>{throw new Error('offline');},
    async()=>new Response('unavailable',{status:503}),
    async()=>new Response('not-json'),
  ])await assert.rejects(()=>verifyTurnstile(env,'token','unknown',verifyFetch),error=>error.status===503);
});

test('Turnstile aborts a stalled verification and fails closed',async t=>{
  let signal;
  const keepAlive=setTimeout(()=>{},7000);t.after(()=>clearTimeout(keepAlive));
  await assert.rejects(()=>verifyTurnstile(env,'token','unknown',async(url,options)=>{
    signal=options.signal;
    return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  }),error=>error.status===503);
  assert.equal(signal.aborted,true);
});
