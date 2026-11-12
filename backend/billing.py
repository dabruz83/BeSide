"""Stripe Billing without platform-specific wrappers. Disabled until configured."""
import os
from datetime import datetime, timezone
from typing import Literal

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field


class CheckoutRequest(BaseModel):
    tier: Literal['essential', 'professional', 'elite']
    interval: Literal['month', 'year'] = 'month'


class PauseRequest(BaseModel):
    reason: str = Field(default='', max_length=60)
    details: str = Field(default='', max_length=500)


PAUSE_REASONS = {'', 'pausa', 'utilizzo', 'costo', 'funzioni', 'alternativa', 'altro'}


def _price_env(tier: str, interval: str) -> str:
    # Preserve existing monthly price IDs and require an explicit annual ID.
    key = f'STRIPE_PRICE_{tier.upper()}'
    return f'{key}_ANNUAL' if interval == 'year' else key


def _period_end(subscription):
    """Stripe can expose current_period_end on the subscription or its item."""
    value = _stripe_field(subscription, 'current_period_end')
    if not value:
        items = _stripe_field(_stripe_field(subscription, 'items', {}), 'data', []) or []
        value = _stripe_field(items[0], 'current_period_end') if items else None
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc).isoformat() if value else None
    except (ValueError, TypeError, OverflowError):
        return None


def _is_paused(company):
    deadline = (company or {}).get('subscription_pause_effective_at')
    if not deadline:
        return False
    try:
        return datetime.fromisoformat(deadline.replace('Z', '+00:00')) <= datetime.now(timezone.utc)
    except (ValueError, TypeError):
        return False


def _stripe_field(resource, name, default=None):
    """Read StripeObject and dict payloads through the SDK-compatible index API."""
    if resource is None:
        return default
    try:
        value = resource[name]
    except (KeyError, TypeError, AttributeError):
        return default
    return default if value is None else value


async def cancel_subscription_immediately(subscription_id: str):
    """Cancel a subscription now and verify Stripe reports it as cancelled.

    Used by the account-deletion workflow. It deliberately does not fall back
    to ``cancel_at_period_end``: deletion must not leave future billing active.
    """
    if not subscription_id or not os.getenv('STRIPE_SECRET_KEY'):
        raise RuntimeError('Stripe non configurato')
    api = stripe.StripeClient(os.environ['STRIPE_SECRET_KEY'])
    subscription = await api.v1.subscriptions.retrieve_async(subscription_id)
    status = _stripe_field(subscription, 'status')
    if status in {'canceled', 'incomplete_expired'}:
        return subscription
    await api.v1.subscriptions.cancel_async(subscription_id)
    verified = await api.v1.subscriptions.retrieve_async(subscription_id)
    if _stripe_field(verified, 'status') != 'canceled':
        raise RuntimeError('Stripe non ha confermato la cessazione dell’abbonamento')
    return verified


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
        if not configured():
            return {'enabled': False, 'tiers': {
                tier: {period: {'available': False} for period in ('month', 'year')}
                for tier in ('essential', 'professional', 'elite')
            }}
        api = client()
        tiers = {}
        for tier in ('essential', 'professional', 'elite'):
            tiers[tier] = {}
            for period in ('month', 'year'):
                price_id = os.getenv(_price_env(tier, period))
                meta = {'available': False}
                if price_id:
                    try:
                        price = await api.v1.prices.retrieve_async(price_id)
                        recurrence = _stripe_field(price, 'recurring', {})
                        if (_stripe_field(price, 'active', True)
                                and _stripe_field(recurrence, 'interval') == period
                                and _stripe_field(price, 'currency') == 'eur'
                                and _stripe_field(price, 'unit_amount') is not None):
                            meta = {'available': True, 'amount_cents': _stripe_field(price, 'unit_amount'),
                                    'currency': 'eur'}
                    except stripe.StripeError:
                        pass
                tiers[tier][period] = meta
        return {'enabled': True, 'tiers': tiers}

    @router.post('/subscription/checkout')
    async def checkout(data: CheckoutRequest, user=Depends(require_roles('owner', 'admin'))):
        api = client()
        price = os.getenv(_price_env(data.tier, data.interval))
        if not price:
            raise HTTPException(503, 'Prezzo del piano e della periodicità non configurato.')
        company = await db.companies.find_one({'company_id': user['company_id']})
        if not company:
            raise HTTPException(404, 'Azienda non trovata.')
        if company.get('stripe_subscription_id'):
            # Never create a second subscription while an existing one may bill.
            try:
                existing = await api.v1.subscriptions.retrieve_async(company['stripe_subscription_id'])
            except stripe.StripeError:
                raise HTTPException(502, 'Verifica dell’abbonamento esistente non disponibile.')
            if _stripe_field(existing, 'status') not in {'canceled', 'incomplete_expired'}:
                raise HTTPException(409, 'Gestisci il piano esistente dal portale abbonamenti.')
        try:
            selected_price = await api.v1.prices.retrieve_async(price)
        except stripe.StripeError:
            raise HTTPException(502, 'Verifica del prezzo non disponibile.')
        recurrence = _stripe_field(selected_price, 'recurring', {})
        if (_stripe_field(recurrence, 'interval') != data.interval
                or _stripe_field(selected_price, 'currency') != 'eur'
                or not _stripe_field(selected_price, 'active', True)):
            raise HTTPException(503, 'Prezzo o periodicità non valida.')
        params = {
            'mode': 'subscription',
            'line_items': [{'price': price, 'quantity': 1}],
            'client_reference_id': user['company_id'],
            'metadata': {'company_id': user['company_id'], 'tier': data.tier, 'interval': data.interval},
            'subscription_data': {'metadata': {'company_id': user['company_id'], 'tier': data.tier,
                                                'interval': data.interval}},
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
            'tier': data.tier, 'interval': data.interval, 'payment_status': 'pending',
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

    @router.get('/subscription/lifecycle')
    async def lifecycle(user=Depends(current_user)):
        company = await db.companies.find_one({'company_id': user['company_id']}, {'_id': 0})
        if not company:
            raise HTTPException(404, 'Azienda non trovata.')
        return {
            'tier': company.get('plan_id', 'essential'),
            'billing_interval': company.get('billing_interval', 'month'),
            'subscription_status': company.get('subscription_status', 'trialing'),
            'pause_requested': bool(company.get('subscription_pause_requested_at')),
            'pause_effective_at': company.get('subscription_pause_effective_at'),
            'suspended': _is_paused(company),
            'current_period_end': company.get('subscription_current_period_end'),
        }

    @router.post('/subscription/suspend')
    async def schedule_suspend(data: PauseRequest, request: Request,
                               user=Depends(require_roles('owner'))):
        api = client()
        if data.reason not in PAUSE_REASONS:
            raise HTTPException(422, 'Motivo non valido.')
        company = await db.companies.find_one({'company_id': user['company_id']})
        if not company or not company.get('stripe_subscription_id'):
            raise HTTPException(409, 'Nessun abbonamento attivo da sospendere.')
        if company.get('subscription_pause_requested_at'):
            raise HTTPException(409, 'Sospensione già programmata.')
        try:
            subscription = await api.v1.subscriptions.retrieve_async(company['stripe_subscription_id'])
        except stripe.StripeError:
            raise HTTPException(502, 'Verifica abbonamento non disponibile.')
        if _stripe_field(subscription, 'status') not in {'active', 'trialing'}:
            raise HTTPException(409, 'Abbonamento non sospendibile in questo stato.')
        effective_at = _period_end(subscription)
        if not effective_at or datetime.fromisoformat(effective_at) <= datetime.now(timezone.utc):
            raise HTTPException(502, 'Scadenza del periodo pagato non disponibile.')
        try:
            await api.v1.subscriptions.update_async(company['stripe_subscription_id'],
                                                      {'cancel_at_period_end': True})
        except stripe.StripeError:
            raise HTTPException(502, 'Impossibile disattivare il rinnovo.')
        now = datetime.now(timezone.utc).isoformat()
        await db.companies.update_one({'company_id': user['company_id'],
                                       'stripe_subscription_id': company['stripe_subscription_id']}, {'$set': {
            'subscription_pause_requested_at': now,
            'subscription_pause_effective_at': effective_at,
            'subscription_current_period_end': effective_at,
            'updated_at': now,
        }})
        await db.subscription_lifecycle_events.insert_one({
            'company_id': user['company_id'], 'event': 'pause_scheduled',
            'reason': data.reason, 'details': data.details.strip(), 'created_at': now,
        })
        return {'pause_requested': True, 'pause_effective_at': effective_at}

    @router.post('/subscription/suspend/cancel')
    async def undo_suspend(user=Depends(require_roles('owner'))):
        api = client()
        company = await db.companies.find_one({'company_id': user['company_id']})
        if not company or not company.get('subscription_pause_requested_at'):
            raise HTTPException(409, 'Nessuna sospensione programmata.')
        if _is_paused(company):
            raise HTTPException(409, 'Account già sospeso: seleziona un nuovo abbonamento.')
        subscription_id = company.get('stripe_subscription_id')
        try:
            sub = await api.v1.subscriptions.retrieve_async(subscription_id)
            if _stripe_field(sub, 'status') not in {'active', 'trialing'}:
                raise HTTPException(409, 'Abbonamento già terminato.')
            await api.v1.subscriptions.update_async(subscription_id, {'cancel_at_period_end': False})
        except stripe.StripeError:
            raise HTTPException(502, 'Impossibile ripristinare il rinnovo.')
        await db.companies.update_one({'company_id': user['company_id'],
                                       'stripe_subscription_id': subscription_id}, {
            '$unset': {'subscription_pause_requested_at': '', 'subscription_pause_effective_at': ''},
            '$set': {'updated_at': datetime.now(timezone.utc).isoformat()},
        })
        return {'pause_requested': False}

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
                await db.companies.update_one({'company_id': transaction['company_id']}, {
                    '$set': {
                        'plan_id': transaction['tier'], 'subscription_status': subscription_status,
                        'billing_interval': transaction.get('interval', 'month'),
                        'subscription_current_period_end': _period_end(subscription),
                        'stripe_customer_id': _stripe_field(obj, 'customer'), 'stripe_subscription_id': subscription_id,
                    },
                    '$unset': {'subscription_pause_requested_at': '', 'subscription_pause_effective_at': ''},
                })
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
            updates = {'subscription_status': subscription_status,
                       'subscription_current_period_end': _period_end(subscription)}
            for tier in ('essential', 'professional', 'elite'):
                for period in ('month', 'year'):
                    if current_price and current_price == os.getenv(_price_env(tier, period)):
                        updates.update({'plan_id': tier, 'billing_interval': period})
            await db.companies.update_one({'stripe_subscription_id': subscription_id}, {'$set': updates})
        await db.billing_events.update_one({'_id': event_id}, {'$set': {
            'processed': True, 'type': event_type, 'processed_at': datetime.now(timezone.utc).isoformat(),
        }}, upsert=True)
        return {'received': True}

    return router
