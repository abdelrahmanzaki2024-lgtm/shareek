/* خادم اختبار للنسخة المستضافة: يشغّل منطق Apps Script الحقيقي (doPost) فوق مخزن وهمي */
const http = require('http');
const vm = require('vm');
const G = require('./t_gas_env.js').make();
const cx = G.ctx;

vm.runInContext('GAS.setup()', cx);
const post = (action, token, payload) => JSON.parse(cx.doPost({ postData: { contents: JSON.stringify({ action, token, payload: JSON.stringify(payload || {}) }) } }).getContent());
const reg = post('register', '', { name: 'تاجر تجريبي', phone: '01299990001', pin: '2468', plate: '1357 أ ب', agree: true });
console.log('register ok', reg.ok);

http.createServer((req, res) => {
  let data = '';
  req.on('data', (c) => { data += c; });
  req.on('end', () => {
    const out = cx.doPost({ postData: { contents: data } }).getContent();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(out);
  });
}).listen(8787, () => console.log('ready'));
