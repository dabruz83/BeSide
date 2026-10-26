"""Stripe contract tests: no real credentials and no network calls."""
import asyncio
import hashlib
import hmac
import json
import time
from types import SimpleNamespace
import uuid

from fastapi import FastAPI
import httpx
import pytest

import billing
from test_deployment import InMemoryDatabase

@pytest.fixture
def fixture(monkeypatch):
    db = InMemoryDatabase()
    db.companies.documents.append({'company_id':'company_a','name':'Demo'})
    user={'company_id':'company_a','user_id':'user_a','role':'owner','email':'demo@example.com'}
    async def current(): return user
    calls=[]
    async def create(params):
        calls.append(params)
        return SimpleNamespace(id='cs_demo',url='https://checkout.stripe.com/demo')
    async def retrieve(subscription_id):
        return {'id':subscription_id,'status':'active','items':{'data':[{'price':{'id':'price_demo'}}]}}
    api=SimpleNamespace(v1=SimpleNamespace(checkout=SimpleNamespace(sessions=SimpleNamespace(create_async=create)),
          subscriptions=SimpleNamespace(retrieve_async=retrieve)))
    monkeypatch.setattr(billing.stripe,'StripeClient',lambda _:api)
    secret=uuid.uuid4().hex
    monkeypatch.setenv('STRIPE_SECRET_KEY',uuid.uuid4().hex)
    monkeypatch.setenv('STRIPE_WEBHOOK_SECRET',secret)
    monkeypatch.setenv('STRIPE_PRICE_ESSENTIAL','price_demo')
    app=FastAPI();app.include_router(billing.build_billing_router(db,current,lambda *roles:current,'https://beside.example',lambda:True))
    return app,db,calls,secret

def request(app, method, url, **kwargs):
    async def call():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as c:
            return await c.request(method,url,**kwargs)
    return asyncio.run(call())

def test_checkout_uses_server_price_and_safe_redirect(fixture):
    app,db,calls,_=fixture
    r=request(app,'POST','/api/subscription/checkout',json={'tier':'essential','origin_url':'https://attacker.invalid'})
    assert r.status_code==200
    assert calls[0]['line_items']==[{'price':'price_demo','quantity':1}]
    assert calls[0]['success_url'].startswith('https://beside.example/')
    assert db.payment_transactions.documents[0]['company_id']=='company_a'
    assert db.payment_transactions.documents[0]['payment_status']=='pending'

def test_checkout_does_not_duplicate_active_subscription(fixture):
    app,db,calls,_=fixture;db.companies.documents[0]['stripe_subscription_id']='sub_existing'
    assert request(app,'POST','/api/subscription/checkout',json={'tier':'essential'}).status_code==409
    assert calls==[]

def test_status_is_tenant_scoped(fixture):
    app,db,_,_=fixture
    db.payment_transactions.documents.append({'session_id':'foreign','company_id':'company_b','payment_status':'paid'})
    assert request(app,'GET','/api/subscription/status/foreign').status_code==404

def test_forged_webhook_is_rejected(fixture):
    app,_,_,_=fixture
    assert request(app,'POST','/api/webhook/stripe',content='{}',headers={'stripe-signature':'forged'}).status_code==400

def test_verified_webhook_activates_once(fixture):
    app,db,_,secret=fixture
    request(app,'POST','/api/subscription/checkout',json={'tier':'essential'})
    event={'id':'evt_local','type':'checkout.session.completed','data':{'object':{
        'id':'cs_demo','client_reference_id':'company_a','payment_status':'paid',
        'subscription':'sub_local','customer':'cus_local','amount_total':9700}}}
    payload=json.dumps(event);timestamp=str(int(time.time()))
    signature=hmac.new(secret.encode(),f'{timestamp}.{payload}'.encode(),hashlib.sha256).hexdigest()
    for _ in range(2):
        r=request(app,'POST','/api/webhook/stripe',content=payload,headers={'stripe-signature':f't={timestamp},v1={signature}'})
        assert r.status_code==200
    assert db.companies.documents[0]['subscription_status']=='active'
    assert db.payment_transactions.documents[0]['payment_status']=='paid'
    assert len(db.billing_events.documents)==1

def test_missing_price_never_calls_stripe(fixture,monkeypatch):
    app,_,calls,_=fixture;monkeypatch.delenv('STRIPE_PRICE_ESSENTIAL')
    assert request(app,'POST','/api/subscription/checkout',json={'tier':'essential'}).status_code==503
    assert calls==[]
