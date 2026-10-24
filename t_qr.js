const C=require('./dist/core.js');
const strs=['C3A:TJ7K','C3A:ABCD','C3A|T|7K2P|9','https://example.com/very/long/url/with/many/chars/1234567890?x=abcdefghij&y=zzzzzzzzzzzzzzzzzzzz','مرحبا TR-0012','x'.repeat(100)];
const out=strs.map(s=>{const q=C.QR.matrix(s); return {s, size:q.size, ver:q.ver, rows:q.mod.map(r=>r.map(b=>b?'1':'0').join(''))}});
require('fs').writeFileSync('qr_out.json',JSON.stringify(out));
console.log(out.map(o=>o.s.slice(0,20)+' v'+o.ver).join('\n'));
