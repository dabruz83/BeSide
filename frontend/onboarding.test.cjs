const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

function page(name, initial = []) {
  const state = [...initial], refs = [], calls = [];
  let cursor = 0, refCursor = 0, token = 'test-token', effect;
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: {
      useState(value) { const index = cursor++; if (!(index in state)) state[index] = value;
        return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
      useMemo: fn => fn(), useRef(value) { return refs[refCursor++] ||= { current: value }; },
      useEffect(fn) { effect = fn; },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-router-dom': { Link: 'Link', useNavigate: () => () => {}, useSearchParams: () => [{ get: () => token }] },
    '@/App': { API: '/api', useAuth: () => ({ login() {} }) },
    sonner: { toast: { success() {}, error() {} } },
    axios: { post: (...args) => new Promise((resolve, reject) => calls.push({ args, resolve, reject })) },
  };
  const context = { module: { exports: {} }, process: { env: {} }, require: name => modules[name] || new Proxy({}, { get: (_, key) => key }) };
  const source = fs.readFileSync(`${__dirname}/src/pages/${name}.jsx`, 'utf8');
  vm.runInNewContext(transformSync(source, { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code, context);
  return { state, calls, render(nextToken = token) { token = nextToken; cursor = refCursor = 0; return context.module.exports[name](); }, run: () => effect() };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('registration uses optional bands and preserves field identifiers', () => {
  const p = page('RegisterPage', [5, false, false, { services: [], needs: [], interested_modules: [], revenue_band: '', monthly_quotes_band: '', location_general: 'online' }]);
  let tree = p.render();
  for (const [id, expected] of [['revenue_band', ['0–25k €', '25–50k €', '50–100k €', '100–250k €', '250–500k €', '500k–1M €', 'Oltre 1M €']], ['monthly_quotes_band', ['0', '1–5', '6–10', '11–20', '21–50', '51–100', 'Oltre 100']]]) {
    const select = nodes(tree).find(n => n.type === 'Select' && nodes(n).some(c => c.type === 'SelectTrigger' && c.props.id === id));
    assert.ok(select);
    assert.equal(select.props.value, '');
    const options = nodes(select).filter(n => n.type === 'SelectItem');
    assert.deepEqual(options.map(n => n.props.children), ['Preferisco non rispondere', ...expected]);
    select.props.onValueChange(options[2].props.value);
    assert.equal(p.state[3][id], options[2].props.value);
    select.props.onValueChange('skip');
    assert.equal(p.state[3][id], '');
  }
  p.state[0] = 3; tree = p.render();
  assert.ok(JSON.stringify(tree).includes('Area geografica in cui operi'));
  assert.ok(JSON.stringify(tree).includes('Bolzano e provincia, tutta Italia, online'));
  const location = nodes(tree).find(n => n.props?.id === 'location-general');
  location.props.onChange({ target: { value: 'Bolzano' } });
  assert.equal(p.state[3].location_general, 'Bolzano');
});

test('verification effect replay sends a single request and shows success', async () => {
  const p = page('VerifyEmailPage'); p.render(); const cleanup = p.run();
  assert.equal(p.state[0], 'loading'); cleanup(); p.run();
  assert.equal(p.calls.length, 1); assert.equal(p.calls[0].args[2].timeout, 15000);
  p.calls[0].resolve({ data: { message: 'Email verificata.', mfa_setup_required: true } }); await flush();
  assert.equal(p.state[0], 'success'); assert.match(p.state[1], /Dopo l'accesso configurerai l'autenticazione a due fattori/);
  assert.ok(nodes(p.render()).some(n => n.props?.to === '/login'));
});

test('old verification responses cannot override a new token', async () => {
  const p = page('VerifyEmailPage'); p.render(); const cleanup = p.run(); cleanup();
  p.render('new-token'); p.run();
  p.calls[1].resolve({ data: { message: 'New success' } }); await flush();
  p.calls[0].reject({ response: { data: { detail: 'Old error' } } }); await flush();
  assert.equal(p.state[0], 'success'); assert.equal(p.state[1], 'Indirizzo email verificato. Ora puoi accedere al tuo account.');
});
for (const [name, error, pattern] of [['expired', { response: { data: { detail: 'Link scaduto' } } }, /Link scaduto/], ['network timeout', { code: 'ECONNABORTED' }, /Prova ad accedere/]]) {
  test(`verification ${name} shows error without retry`, async () => {
    const p = page('VerifyEmailPage'); p.render(); p.run(); p.calls[0].reject(error); await flush();
    assert.equal(p.state[0], 'error'); assert.match(p.state[1], pattern);
    p.render(); p.run(); await flush(); assert.equal(p.calls.length, 1);
    assert.ok(nodes(p.render()).some(n => n.props?.role === 'alert'));
  });
}
test('missing token reports error without submitting', () => {
  const p = page('VerifyEmailPage'); p.render(''); p.run();
  assert.equal(p.state[0], 'error'); assert.equal(p.calls.length, 0);
});
