// Exercise the real registration submit handler with mocked HTTP and navigation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const source = fs.readFileSync(`${__dirname}/src/pages/RegisterPage.jsx`, 'utf8');
const { code } = transformSync(source, { loader: 'jsx', format: 'cjs', jsx: 'automatic' });

function registration(registrationReply, loginReply, step = 5) {
  const navigation = [], authenticated = [], requests = [], errors = [];
  const states = [step, false, false, { email: 'demo@example.com', password: 'DemoPassword-123',
    first_name: 'Demo', business_name: 'Demo Agency', services: ['websites', 'seo'],
    employees_band: 'solo_io', tax_regime: '', interested_modules: [], needs: [], terms_accepted: true }];
  let hook = 0;
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: { useState: () => [states[hook++], () => {}], useMemo: (fn) => fn() },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-router-dom': { Link: 'Link', useNavigate: () => (...args) => navigation.push(args) },
    '@/App': { API: '/api', useAuth: () => ({ login: (user) => authenticated.push(user) }) },
    axios: { post: async (url, body) => {
      requests.push({ url, body });
      return { data: url.endsWith('/register') ? registrationReply : loginReply };
    } },
    sonner: { toast: { success() {}, error: (error) => errors.push(error) } },
  };
  const context = { module: { exports: {} }, process: { env: {} }, require: (name) => modules[name] || new Proxy({}, { get: (_, key) => key }) };
  vm.runInNewContext(code, context);
  const tree = context.module.exports.RegisterPage();
  function find(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'form') return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const found = find(child); if (found) return found;
    }
  }
  return { submit: () => find(tree).props.onSubmit({ preventDefault() {} }), navigation, authenticated, requests, errors, tree };
}

for (const [name, registerReply, loginReply, destination, count] of [
  ['new account needs TOTP enrollment', {}, { mfa_setup_required: true }, '/mfa/setup', 2],
  ['setup flag takes precedence over user data', {}, { mfa_setup_required: true, user: { user_id: 'test' } }, '/mfa/setup', 2],
  ['registration needs email verification', { email_verification_required: true }, {}, '/verify-email/pending', 1],
  ['login needs email verification', {}, { status: 'EMAIL_VERIFICATION_REQUIRED' }, '/verify-email/pending', 2],
  ['existing TOTP challenge stays out of dashboard', {}, { mfa_required: true }, '/login', 2],
  ['unexpected login response fails closed', {}, {}, '/login', 2],
]) {
  test(name, async () => {
    const flow = registration(registerReply, loginReply);
    await flow.submit();
    assert.equal(flow.navigation.length, 1);
    assert.equal(flow.navigation[0][0], destination);
    assert.equal(flow.requests.length, count);
    assert.equal(flow.authenticated.length, 0);
    assert.equal(flow.errors.length, 0);
    assert.equal(flow.requests[0].body.services.join(','), 'websites,seo');
    assert.equal(flow.requests[0].body.tax_regime, null);
  });
}
test('registration displays Agency services and no vehicle configurator', () => {
  const services = JSON.stringify(registration({}, {}, 2).tree);
  for (const label of ['Siti web', 'E-commerce', 'SEO', 'Manutenzione', 'Marketing digitale']) assert.ok(services.includes(label));
  assert.doesNotMatch(services, /PPF|Wrap|Oscuramento|Tappezzeria/);
  assert.doesNotMatch(JSON.stringify(registration({}, {}, 5).tree), /Configuratore veicoli/);
});
