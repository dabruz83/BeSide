"""Idempotent demo data, strictly on this Mac's beside_demo database."""
from pathlib import Path
import httpx
from dotenv import dotenv_values
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parents[1]
config=dotenv_values(ROOT/'backend/.env')
assert config.get('APP_ENV')=='local' and config.get('DB_NAME')=='beside_demo'
assert config.get('MONGO_URL')=='mongodb://127.0.0.1:27018'
credentials=dotenv_values(ROOT/'.local/demo.env')
with MongoClient(config['MONGO_URL']) as mongo, httpx.Client(base_url='http://localhost:3100',headers={'Origin':'http://localhost:3100'}) as c:
    db=mongo['beside_demo']
    if not db.users.find_one({'email':credentials['DEMO_EMAIL']}):
        r=c.post('/api/auth/register',json={'email':credentials['DEMO_EMAIL'],'password':credentials['DEMO_PASSWORD'],'first_name':'Demo','business_name':'BeSide · Officina dimostrativa','services':['ppf','wrap','tint']})
        if r.status_code != 200: raise SystemExit(f'Demo registration failed: HTTP {r.status_code}')
    r=c.post('/api/auth/login',json={'email':credentials['DEMO_EMAIL'],'password':credentials['DEMO_PASSWORD']})
    if r.status_code != 200: raise SystemExit(f'Demo login failed: HTTP {r.status_code}')
    if not c.get('/api/jobs').json():
        for name,kind,amount in [('Cliente Demo A','ppf_full',3200),('Cliente Demo B','wrap_decorative',2200)]:
            r=c.post('/api/jobs',json={'client_name':name,'job_type':kind,'vehicle_type':'sedan','vehicle_info':'Veicolo dimostrativo','quote_amount':amount,'hours_worked':14,'materials_cost':700,'lead_source':'passaparola'})
            r.raise_for_status()
    if not c.get('/api/onboarding').json():
        r=c.post('/api/onboarding',json={'client_name':'Cliente Demo C','client_email':'demo-client@example.com','vehicle_info':'Veicolo dimostrativo'})
        r.raise_for_status()
print('Demo data ready. Access details are stored privately in .local/demo.env; no secrets displayed.')
