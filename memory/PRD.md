# BESIDE - Product Requirements Document

## Project Overview
**Name:** BESIDE  
**Type:** SaaS Dashboard for Italian Auto Wrap/PPF Installers  
**Target:** 1-5 person installation teams  
**Business Model:** €97-397/month subscription  
**Language:** 100% Italian UI

## Problem Statement
Italian auto wrap/PPF installers are excellent technicians but struggle with business management. BESIDE provides a comprehensive dashboard combining financial tools, automation, and analytics to help them understand profitability, plan taxes, and manage clients.

## Core Features (All Implemented)

### Authentication System
- JWT-based email/password authentication
- Google OAuth via Emergent Auth
- Session management with secure cookies
- Admin-specific login at /admin

### Dashboard
- 5 Key Metrics with Quick Actions
- Monthly statistics
- Tax deadlines alerts

### Tax Planning Calculator
- Italian tax regime support (Forfettario 5%/15%, Ordinario)
- Auto-calculates IRPEF, INPS, IVA
- 6-month forecast
- **CSV Export for Accountant** ✅ NEW

### Job Profitability Tracker
- Job types: PPF, Wrap, Tint, Upholstery
- Profitability analytics
- **CSV Export** ✅ NEW

### Quote Generator
- Public quote links (/quote/:token)
- Client accept/reject with signature

### Client Onboarding System
- Pre-work checklist
- Public client-facing page

### Lead Source Tracker & Marketing
- ROI calculation
- **AI Content Generator (Gemini 3 Flash)** ✅

### Admin Panel (/admin)
- User management
- Payment history
- Platform statistics
- Admin chat

### Email Notifications
- **Registration notification to info@cameleon.design via SendGrid** ✅ NEW

### PWA Support
- **Manifest.json configured** ✅ NEW
- **Service Worker for offline caching** ✅ NEW
- Installable on mobile devices

## Technical Architecture

### Backend (FastAPI)
- All `/api/*` endpoints
- SendGrid email integration
- CSV export endpoints
- Gemini 3 Flash AI integration

### Frontend (React + PWA)
- Shadcn/UI + Tailwind CSS
- Axios with JWT interceptor
- Service Worker for offline support

### Database (MongoDB)
- All collections configured

## What's Been Implemented (March 30, 2026)
- [x] Complete authentication (JWT + Google OAuth)
- [x] Dashboard with 5 KPIs
- [x] Tax calculator with all Italian regimes
- [x] Job tracker with profitability analytics
- [x] Quote generator with public links
- [x] Client onboarding system
- [x] Lead source tracking
- [x] Marketing ROI calculator
- [x] AI Content Generator (Gemini 3 Flash)
- [x] Admin Panel with user management
- [x] Expanded business info fields
- [x] Subscription tiers with Stripe
- [x] 100% Italian UI
- [x] **CSV Export for jobs and taxes** ✅ NEW
- [x] **SendGrid email notifications** ✅ NEW
- [x] **PWA manifest and service worker** ✅ NEW
- [x] **Admin login bug fix** ✅ FIXED

## Prioritized Backlog

### P0 (Critical) - COMPLETE
All P0 features implemented

### P1 (High) - COMPLETE
- [x] CSV export for accountant
- [x] Email notifications (SendGrid)

### P2 (Medium)
- [x] PWA installable
- [ ] Apple Sign-In (Requires Apple Developer account €99/year and certificates setup)
- [ ] Registro Imprese API (Requires OpenAPI.it subscription)
- [ ] Offline mode
- [ ] Bulk job import

### P3 (Future)
- [ ] Custom job types
- [ ] Photo upload for jobs
- [ ] Team collaboration
- [ ] Native mobile apps

## API Keys & Integrations
- **Stripe:** sk_test_emergent (configured)
- **Emergent LLM Key:** Configured for Gemini 3 Flash
- **SendGrid:** Placeholder in .env (SENDGRID_API_KEY required for production emails)

## Notes on Apple Sign-In
Apple Sign-In requires:
1. Apple Developer account (€99/year)
2. Service ID configuration in Apple Developer Portal
3. Private key (.p8 file) for JWT client secret
4. Complex JWT signing implementation

Emergent platform currently supports only Google OAuth natively. Apple would require manual implementation.

## Notes on Registro Imprese API
Italian Business Register lookup requires:
- OpenAPI.it subscription
- API key for authentication
- Implementation of company data fetch endpoint
