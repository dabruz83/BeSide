"""Stripe Billing without platform-specific wrappers. Disabled until configured."""
import os
from datetime import datetime, timezone
from typing import Literal

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel


class CheckoutRequest(BaseModel):
    tier: Literal['essential', 'professional', 'elite']


def _stripe_field(resource, name, default=None):
    """Read StripeObject and dict payloads through the SDK-compatible index API."""
    if resource is None:
        return default
    try:
        value = resource[name]
    except (KeyError, TypeError, AttributeError):
        return default
    return default if value is None else value


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
        event_id = _stripe_field(event, 'id')
        event_type = _stripe_field(event, 'type')
        event_data = _stripe_field(event, 'data')
        obj = _stripe_field(event_data, 'object')
        if not event_id or not event_type or obj is None:
            raise HTTPException(400, 'Evento Stripe incompleto.')
        if await db.billing_events.find_one({'_id': event_id, 'processed': True}):
            return {'received': True}
        if event_type in {'checkout.session.completed', 'checkout.session.async_payment_succeeded'}:
            session_id = _stripe_field(obj, 'id')
            if not session_id:
                raise HTTPException(400, 'Sessione Stripe incompleta.')
            transaction = await db.payment_transactions.find_one({'session_id': session_id})
            if not transaction:
                # Return retryable status: the webhook may beat the checkout insert.
                raise HTTPException(409, 'Sessione in preparazione.')
            if _stripe_field(obj, 'client_reference_id') != transaction['company_id']:
                raise HTTPException(400, 'Azienda non corrispondente.')
            if _stripe_field(obj, 'payment_status') == 'paid':
                subscription_id = _stripe_field(obj, 'subscription')
                if not subscription_id:
                    raise HTTPException(400, 'Abbonamento Stripe mancante.')
                try:
                    subscription = await api.v1.subscriptions.retrieve_async(subscription_id)
                except stripe.StripeError:
                    raise HTTPException(502, 'Stato abbonamento non disponibile.')
                subscription_status = _stripe_field(subscription, 'status')
                if not subscription_status:
                    raise HTTPException(502, 'Stato abbonamento non disponibile.')
                amount_total = _stripe_field(obj, 'amount_total', 0) or 0
                try:
                    amount = float(amount_total) / 100
                except (TypeError, ValueError):
                    raise HTTPException(400, 'Importo Stripe non valido.')
                await db.companies.update_one({'company_id': transaction['company_id']}, {'$set': {
                    'plan_id': transaction['tier'], 'subscription_status': subscription_status,
                    'stripe_customer_id': _stripe_field(obj, 'customer'), 'stripe_subscription_id': subscription_id,
                }})
                await db.payment_transactions.update_one({'session_id': session_id}, {'$set': {
                    'payment_status': 'paid', 'status': 'complete', 'amount': amount,
                }})
        elif event_type == 'checkout.session.expired':
            session_id = _stripe_field(obj, 'id')
            if not session_id:
                raise HTTPException(400, 'Sessione Stripe incompleta.')
            await db.payment_transactions.update_one({'session_id': session_id}, {'$set': {'status': 'expired'}})
        elif event_type in {'customer.subscription.updated', 'customer.subscription.deleted'}:
            # Retrieve current state to prevent delayed/out-of-order events reverting plans.
            subscription_id = _stripe_field(obj, 'id')
            if not subscription_id:
                raise HTTPException(400, 'Abbonamento Stripe mancante.')
            try:
                subscription = await api.v1.subscriptions.retrieve_async(subscription_id)
            except stripe.StripeError:
                raise HTTPException(502, 'Stato abbonamento non disponibile.')
            subscription_status = _stripe_field(subscription, 'status')
            items = _stripe_field(subscription, 'items', {})
            item_data = _stripe_field(items, 'data', []) or []
            first_item = item_data[0] if item_data else None
            price = _stripe_field(first_item, 'price', {})
            current_price = _stripe_field(price, 'id')
            if not subscription_status:
                raise HTTPException(502, 'Stato abbonamento non disponibile.')
            updates = {'subscription_status': subscription_status}
            for tier in ('essential', 'professional', 'elite'):
                if current_price and current_price == os.getenv(f'STRIPE_PRICE_{tier.upper()}'):
                    updates['plan_id'] = tier
            await db.companies.update_one({'stripe_subscription_id': subscription_id}, {'$set': updates})
        await db.billing_events.update_one({'_id': event_id}, {'$set': {
            'processed': True, 'type': event_type, 'processed_at': datetime.now(timezone.utc).isoformat(),
        }}, upsert=True)
        return {'received': True}

    return router
