"""Stripe Billing without platform-specific wrappers. Disabled until configured."""
import os
from datetime import datetime, timezone
from typing import Literal

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel


class CheckoutRequest(BaseModel):
    tier: Literal['essential', 'professional', 'elite']


def build_billing_router(db, current_user, require_roles, frontend_url, external_enabled):
    router = APIRouter(prefix='/api')

    def configured():
        return bool(external_enabled() and os.getenv('STRIPE_SECRET_KEY') and os.getenv('STRIPE_WEBHOOK_SECRET'))

    def client():
        if not configured():
            raise HTTPException(503, 'Pagamenti non configurati; nessun addebito eseguito.')
        return stripe.StripeClient(os.environ['STRIPE_SECRET_KEY'])

    @router.get('/subscription/config')
    async def configuration(user=Depends(current_user)):
        return {'enabled': configured(), 'tiers': {
            tier: bool(configured() and os.getenv(f'STRIPE_PRICE_{tier.upper()}'))
            for tier in ('essential', 'professional', 'elite')
        }}

    @router.post('/subscription/checkout')
    async def checkout(data: CheckoutRequest, user=Depends(require_roles('owner', 'admin'))):
        api = client()
        price = os.getenv(f'STRIPE_PRICE_{data.tier.upper()}')
        if not price:
            raise HTTPException(503, 'Prezzo del piano non configurato.')
        company = await db.companies.find_one({'company_id': user['company_id']})
        if company.get('stripe_subscription_id'):
            raise HTTPException(409, 'Gestisci il piano esistente dal portale abbonamenti.')
        params = {
            'mode': 'subscription',
            'line_items': [{'price': price, 'quantity': 1}],
            'client_reference_id': user['company_id'],
            'metadata': {'company_id': user['company_id'], 'tier': data.tier},
            'subscription_data': {'metadata': {'company_id': user['company_id'], 'tier': data.tier}},
            'success_url': frontend_url + '/subscription/success?session_id={CHECKOUT_SESSION_ID}',
            'cancel_url': frontend_url + '/subscription',
        }
        if company.get('stripe_customer_id'):
            params['customer'] = company['stripe_customer_id']
        else:
            params['customer_email'] = user['email']
        try:
            session = await api.v1.checkout.sessions.create_async(params)
        except stripe.StripeError:
            raise HTTPException(502, 'Il servizio pagamenti non è disponibile.')
        await db.payment_transactions.insert_one({
            'session_id': session.id, 'company_id': user['company_id'], 'user_id': user['user_id'],
            'tier': data.tier, 'payment_status': 'pending',
            'created_at': datetime.now(timezone.utc).isoformat(),
        })
        return {'checkout_url': session.url, 'session_id': session.id}

    @router.get('/subscription/status/{session_id}')
    async def status(session_id: str, user=Depends(current_user)):
        transaction = await db.payment_transactions.find_one({'session_id': session_id, 'company_id': user['company_id']})
        if not transaction:
            raise HTTPException(404, 'Sessione non trovata.')
        # Activation comes only from a verified webhook, never a browser redirect.
        return {'payment_status': transaction['payment_status'], 'status': transaction.get('status', 'open')}

    @router.post('/subscription/portal')
    async def portal(user=Depends(require_roles('owner', 'admin'))):
        api = client()
        company = await db.companies.find_one({'company_id': user['company_id']})
        if not company.get('stripe_customer_id'):
            raise HTTPException(400, 'Nessun abbonamento da gestire.')
        try:
            session = await api.v1.billing_portal.sessions.create_async({
                'customer': company['stripe_customer_id'], 'return_url': frontend_url + '/subscription',
            })
        except stripe.StripeError:
            raise HTTPException(502, 'Il servizio pagamenti non è disponibile.')
        return {'url': session.url}

    @router.post('/webhook/stripe')
    async def webhook(request: Request):
        api = client()
        try:
            event = stripe.Webhook.construct_event(
                await request.body(), request.headers.get('stripe-signature', ''), os.environ['STRIPE_WEBHOOK_SECRET'],
            )
        except (ValueError, stripe.SignatureVerificationError):
            raise HTTPException(400, 'Firma webhook non valida.')
        if await db.billing_events.find_one({'_id': event['id'], 'processed': True}):
            return {'received': True}
        obj = event['data']['object']
        event_type = event['type']
        if event_type in {'checkout.session.completed', 'checkout.session.async_payment_succeeded'}:
            transaction = await db.payment_transactions.find_one({'session_id': obj['id']})
            if not transaction:
                # Return retryable status: the webhook may beat the checkout insert.
                raise HTTPException(409, 'Sessione in preparazione.')
            if obj.get('client_reference_id') != transaction['company_id']:
                raise HTTPException(400, 'Azienda non corrispondente.')
            if obj.get('payment_status') == 'paid':
                try:
                    subscription = await api.v1.subscriptions.retrieve_async(obj['subscription'])
                except stripe.StripeError:
                    raise HTTPException(502, 'Stato abbonamento non disponibile.')
                await db.companies.update_one({'company_id': transaction['company_id']}, {'$set': {
                    'plan_id': transaction['tier'], 'subscription_status': subscription['status'],
                    'stripe_customer_id': obj.get('customer'), 'stripe_subscription_id': obj.get('subscription'),
                }})
                await db.payment_transactions.update_one({'session_id': obj['id']}, {'$set': {
                    'payment_status': 'paid', 'status': 'complete', 'amount': (obj.get('amount_total') or 0) / 100,
                }})
        elif event_type == 'checkout.session.expired':
            await db.payment_transactions.update_one({'session_id': obj['id']}, {'$set': {'status': 'expired'}})
        elif event_type in {'customer.subscription.updated', 'customer.subscription.deleted'}:
            # Retrieve current state to prevent delayed/out-of-order events reverting plans.
            try:
                subscription = await api.v1.subscriptions.retrieve_async(obj['id'])
            except stripe.StripeError:
                raise HTTPException(502, 'Stato abbonamento non disponibile.')
            updates = {'subscription_status': subscription['status']}
            current_price = subscription['items']['data'][0]['price']['id'] if subscription['items']['data'] else None
            for tier in ('essential', 'professional', 'elite'):
                if current_price and current_price == os.getenv(f'STRIPE_PRICE_{tier.upper()}'):
                    updates['plan_id'] = tier
            await db.companies.update_one({'stripe_subscription_id': obj['id']}, {'$set': updates})
        await db.billing_events.update_one({'_id': event['id']}, {'$set': {
            'processed': True, 'type': event_type, 'processed_at': datetime.now(timezone.utc).isoformat(),
        }}, upsert=True)
        return {'received': True}

    return router
