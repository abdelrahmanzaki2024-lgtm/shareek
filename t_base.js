const fs=require('fs'); 
const code=fs.readFileSync('src/01_base.js','utf8')+';module.exports=C3A;';
const m={exports:{}}; new Function('module',code)(m); const C=m.exports; const U=C.U;
const crypto=require('crypto');
function eq(a,b,msg){ if(a!==b){ console.log('FAIL',msg,a,b); process.exitCode=1;} else console.log('ok',msg); }
for (const s of ['', 'abc', 'مرحبا بالعالم 😀', 'x'.repeat(200)]) {
  eq(U.sha256Hex(s), crypto.createHash('sha256').update(s,'utf8').digest('hex'), 'sha256 '+s.slice(0,8));
}
eq(U.hmacHex('key','The quick brown fox jumps over the lazy dog'), crypto.createHmac('sha256','key').update('The quick brown fox jumps over the lazy dog').digest('hex'),'hmac');
eq(U.hmacHex('k'.repeat(100),'مرحبا'), crypto.createHmac('sha256','k'.repeat(100)).update('مرحبا','utf8').digest('hex'),'hmac long key');
const t=U.signToken({sub:'T-1',exp:2e12},'sec'); eq(JSON.stringify(U.verifyToken(t,'sec',1e12)),'{"sub":"T-1","exp":2000000000000}','token'); eq(U.verifyToken(t,'bad',1),null,'token bad'); eq(U.verifyToken(t,'sec',3e12),null,'token exp');
eq(U.normPhone('٠١٠٠١٢٣٤٥٦٧'),'01001234567','phone arabic'); eq(U.normPhone('+201001234567'),'01001234567','phone +20'); eq(U.normPhone('1001234567'),'01001234567','phone 10'); eq(U.normPhone('0211234567'),'','phone bad');
eq(U.dateKey(Date.UTC(2026,9,1,22,30)),'2026-10-02','tz cairo (UTC+3 DST)'); // 22:30Z => 01:30 next day (DST UTC+3)
eq(U.dateKey(Date.UTC(2026,10,15,22,30)),'2026-11-15','tz cairo winter (UTC+2): 22:30Z=00:30 -> next day?');
eq(U.weekStart('2026-10-01'),'2026-09-26','week start Sat (Thu Oct 1 2026)'); eq(U.weekStart('2026-10-03'),'2026-10-03','sat'); eq(U.weekStart('2026-10-02'),'2026-09-26','fri');
eq(U.addDays('2026-12-30',3),'2027-01-02','addDays'); eq(U.diffDays('2026-09-26','2026-10-01'),5,'diffDays');
eq(U.monthsBetween(Date.UTC(2026,0,15),Date.UTC(2026,6,14)),5,'monthsBetween'); eq(U.monthsBetween(Date.UTC(2026,0,15),Date.UTC(2026,6,15,12)),6,'monthsBetween2');
const h=U.hashPin('1234','salt','sec'); eq(h.length,64,'hashPin len'); eq(h===U.hashPin('1234','salt','sec'),true,'hashPin det'); eq(h===U.hashPin('1235','salt','sec'),false,'hashPin diff');
let t0=Date.now(); for(let i=0;i<20;i++) U.hashPin('1234','salt','sec'); console.log('hashPin ms each', (Date.now()-t0)/20);
