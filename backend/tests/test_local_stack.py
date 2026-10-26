"""Real HTTP + real MongoDB checks on a unique local-only database."""
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
import uuid

import httpx
import pytest
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parents[2]

@pytest.fixture(scope='module')
def stack():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    database = 'beside_test_' + uuid.uuid4().hex
    outbox = ROOT / '.local' / database / 'outbox'
    outbox.mkdir(parents=True)
    env = dict(os.environ, APP_ENV='local', EXTERNAL_SERVICES_ENABLED='false', DB_NAME=database,
               MONGO_URL='mongodb://127.0.0.1:27018', COOKIE_SECURE='false',
               LOCAL_OUTBOX_DIR=str(outbox), RATE_LIMITING_ENABLED='false')
    log = open(outbox.parent / 'backend.log', 'w')
    process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'server:app', '--host', '127.0.0.1',
                                '--port', str(port), '--no-access-log'], cwd=ROOT / 'backend',
                               env=env, stdout=log, stderr=log)
    base = f'http://127.0.0.1:{port}'
    try:
        for _ in range(80):
            try:
                if httpx.get(base + '/health').status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(.1)
        else:
            pytest.fail('Local test backend did not start; see private test log.')
        mongo = MongoClient('mongodb://127.0.0.1:27018')
        yield {'base': base, 'outbox': outbox, 'db': mongo[database], 'env': env}
        mongo.close()
    finally:
        process.terminate()
        process.wait(timeout=10)
        log.close()

@pytest.fixture
def account(stack):
    password = uuid.uuid4().hex + 'A1!'
    email = uuid.uuid4().hex + '@example.com'
    with httpx.Client(base_url=stack['base'], headers={'Origin': 'http://localhost:3000'}) as client:
        r = client.post('/api/auth/register', json={'email': email, 'password': password, 'business_name': 'Test BeSide', 'first_name': 'Test'})
        assert r.status_code == 200, r.status_code
        r = client.post('/api/auth/login', json={'email': email, 'password': password})
        assert r.status_code == 200
        yield client, email, password, r.json()['user']

def job_payload(**overrides):
    return dict(client_name='Cliente Demo', client_email='client@example.com', job_type='ppf_full',
                vehicle_type='sedan', quote_amount=2500, hours_worked=12, materials_cost=600, **overrides)

def test_real_mongo_indexes_and_health(stack):
    assert httpx.get(stack['base'] + '/health').json()['database'] == 'connected'
    assert stack['db'].users.index_information()['email_1']['unique']
    assert stack['db'].user_sessions.index_information()['expires_at_dt_1']['expireAfterSeconds'] == 0
    assert {'users', 'companies', 'jobs', 'quote_tokens', 'cash_plan_entries'}.issubset(stack['db'].list_collection_names())

def test_cookie_login_csrf_and_logout(account):
    c, _, _, _ = account
    assert c.get('/api/auth/me').status_code == 200
    assert c.post('/api/jobs', json=job_payload(), headers={'Origin':'https://invalid.example'}).status_code == 403
    assert c.post('/api/auth/logout').status_code == 200
    assert c.get('/api/auth/me').status_code == 401

def test_jobs_dashboard_csv_and_tenant_isolation(stack, account):
    c, _, _, user = account
    r = c.post('/api/jobs', json=job_payload())
    assert r.status_code == 200
    job = r.json()
    assert c.get('/api/jobs').json()[0]['job_id'] == job['job_id']
    assert c.get('/api/dashboard/metrics').status_code == 200
    assert c.get('/api/export/jobs-csv').status_code == 200
    with httpx.Client(base_url=stack['base'], headers={'Origin':'http://localhost:3000'}) as other:
        password = uuid.uuid4().hex+'A1!'; email = uuid.uuid4().hex+'@example.com'
        assert other.post('/api/auth/register', json={'email':email,'password':password,'business_name':'Altra azienda'}).status_code == 200
        assert other.post('/api/auth/login', json={'email':email,'password':password}).status_code == 200
        assert other.get('/api/jobs').json() == []
        assert other.get('/api/jobs/'+job['job_id']).status_code == 404
        assert other.get('/api/admin/users').status_code == 403

def test_quote_save_email_and_public_acceptance(stack, account):
    c, _, _, _ = account
    r = c.post('/api/jobs', json=job_payload(is_quote=True)); assert r.status_code == 200
    job = r.json(); token = job['quote_link'].rsplit('/',1)[1]
    assert c.post('/api/jobs/'+job['job_id']+'/send-quote').status_code == 200
    assert httpx.get(stack['base']+'/api/quote/'+token).status_code == 200
    r = httpx.post(stack['base']+'/api/quote/'+token+'/accept', json={'accepted':True,'client_signature':'Cliente Demo'})
    assert r.status_code == 200
    assert c.get('/api/jobs/'+job['job_id']).json()['quote_status'] == 'accepted'
    assert httpx.post(stack['base']+'/api/quote/'+token+'/accept', json={'accepted':True}).status_code == 400

def test_finance_cash_plan_and_marketing(account):
    c, _, _, _ = account
    assert c.put('/api/finance/settings',json={'revenue':5000,'fixed_expenses':800,'variable_expenses':200}).status_code == 200
    assert c.get('/api/finance/cash-flow').status_code == 200
    assert c.post('/api/finance/cash-plan/months',json={'month':'2026-10','revenue':5000,'fixed_expenses':800}).status_code == 200
    assert c.get('/api/finance/cash-plan/summary').status_code == 200
    assert c.post('/api/finance/cash-plan/forecast/generate',json={'method':'copy_previous','months':2}).status_code == 200
    assert c.post('/api/tax/accruals',json={'month':'2026-10','revenue':5000}).status_code == 200
    assert c.post('/api/marketing/efforts',json={'month':'2026-10','channel':'instagram','hours_invested':4}).status_code == 200
    assert c.get('/api/marketing/lead-sources').status_code == 200

def test_onboarding_and_profile(account):
    c, _, _, _ = account
    r = c.post('/api/onboarding',json={'client_name':'Cliente Demo','client_email':'client@example.com','vehicle_info':'Golf'})
    assert r.status_code == 200
    token = r.json()['unique_link'].rsplit('/',1)[1]
    r = c.get('/api/onboarding/client/'+token); assert r.status_code == 200
    items=r.json()['checklist_items']; items[1]['completed']=True
    assert c.put('/api/onboarding/client/'+token,json={'checklist_items':items}).status_code == 200
    assert c.put('/api/auth/profile',json={'business_name':'Officina Demo'}).status_code == 200

def test_password_reset_local_email_and_revocation(stack, account):
    c, email, password, _ = account
    assert c.post('/api/auth/forgot-password',json={'email':email}).status_code == 200
    messages = [json.loads(p.read_text()) for p in stack['outbox'].glob('*.json')]
    message = next(m for m in messages if m['to']==email and '/reset-password?' in m['html'])
    token = re.search(r'token=([^"&<]+)', message['html']).group(1)
    new_password = uuid.uuid4().hex+'A1!'
    assert c.post('/api/auth/reset-password',json={'token':token,'password':new_password}).status_code == 200
    assert c.get('/api/auth/me').status_code == 401
    assert c.post('/api/auth/login',json={'email':email,'password':new_password}).status_code == 200
    assert c.post('/api/auth/reset-password',json={'token':token,'password':new_password}).status_code == 400

def test_external_services_are_disabled(account):
    c, _, _, _ = account
    assert c.get('/api/subscription/config').json()['enabled'] is False
    assert c.post('/api/subscription/checkout',json={'tier':'essential'}).status_code == 503
    assert c.post('/api/marketing/ai/generate',json={'step':'genera_idea','user_input':'demo'}).status_code == 503
    assert c.post('/api/auth/session',json={'session_id':'demo'}).status_code == 503

def test_admin_login_and_stats(stack):
    with httpx.Client(base_url=stack['base'],headers={'Origin':'http://localhost:3000'}) as c:
        r=c.post('/api/admin/login',json={'email':stack['env']['ADMIN_EMAIL'],'password':stack['env']['ADMIN_PASSWORD']})
        assert r.status_code == 200
        assert c.get('/api/admin/stats').status_code == 200
        assert c.get('/api/admin/users').status_code == 200
