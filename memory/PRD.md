# BESIDE - Product Requirements Document

## Project Overview
**Name:** BESIDE  
**Type:** SaaS Dashboard for Italian Auto Wrap/PPF Installers  
**Target:** 1-5 person installation teams  
**Business Model:** €97-397/month subscription  
**Language:** 100% Italian UI

## Problem Statement
Italian auto wrap/PPF installers are excellent technicians but struggle with business management. BESIDE provides a comprehensive dashboard combining financial tools, automation, and analytics to help them understand profitability, plan taxes, and manage clients.

## User Personas
1. **Solo Installer** - Single technician managing all aspects of business
2. **Small Team Owner** - 2-5 person team needing coordination tools
3. **Growing Business** - Expanding operations needing analytics

## Core Features (All Implemented)

### Authentication System
- JWT-based email/password authentication
- Google OAuth via Emergent Auth
- Session management with secure cookies
- Admin-specific login at /admin

### Dashboard
- 5 Key Metrics:
  - Tax reserve balance (€ accrued)
  - Cash flow status (green/yellow/red)
  - Most profitable job type
  - Top performing lead source
  - Upcoming Italian tax deadlines (with 60-30-15 day alerts)
- Monthly statistics (jobs, revenue, margin)
- Quick action buttons (Nuovo Lavoro, Preventivo, Calcola Tasse, Nuovo Cliente, Marketing AI)

### Tax Planning Calculator
- Italian tax regime support:
  - Forfettario 5%
  - Forfettario 15%
  - Regime Ordinario
- Auto-calculates:
  - IRPEF (income tax)
  - INPS (26.07% social security)
  - IVA (22% VAT for ordinario)
- 6-month cash flow forecast
- Monthly accrual tracking
- Tax deadlines based on regime

### Job Profitability Tracker
- Job types: PPF Full/Partial, Wrap Decorative/Commercial, Tint, Upholstery
- Vehicle types: Sedan, SUV, Van, Truck
- Tracks: quote, hours, materials, waste %
- Auto-calculates: net profit, margin %, hourly rate
- Profitability charts by job type and vehicle type

### Quote Generator
- Create quotes (is_quote=true) with public link
- Public quote page at /quote/:token
- Client can accept/reject with signature
- Shows business info without internal metrics
- Converts to job on acceptance

### Client Onboarding System
- Pre-work checklist (6 items)
- Unique link generation for clients
- Status tracking: pending/in_progress/complete/overdue
- Public client-facing checklist page

### Lead Source Tracker
- Sources: Passaparola, Instagram, Facebook, Google, Partnership, Fiere, Website
- Revenue per source analysis
- Hours invested tracking
- ROI calculation (€/hour)
- 80/20 insights auto-generated

### Marketing AI Content Generator
- Powered by Gemini 3 Flash via Emergent LLM Key
- Steps: bacino_utenza, trova_argomenti, pain_points, genera_idea, sviluppo_testo, sviluppo_video
- Italian automotive content specialized
- Content history saved

### Admin Panel (/admin)
- Separate admin login (admin@beside.it)
- User management (view, edit, activate/deactivate)
- Subscription management (change tier/status)
- Payment history
- Platform statistics (total users, paying users, revenue)
- Admin chat with users

### Profile & Business Info
- Business details: P.IVA, Codice Fiscale, Indirizzo, Città, CAP, Provincia
- Invoice details: SDI, PEC, IBAN, Banca
- Logo upload (URL + width)
- Header customization for quotes

### Subscription System
- 3 Tiers with Stripe integration:
  - Essential: €97/month
  - Professional: €197/month
  - Elite: €397/month
- 14-day free trial
- Payment status polling

## Technical Architecture

### Backend (FastAPI)
- `/api/auth/*` - Authentication endpoints
- `/api/jobs/*` - Job CRUD and analytics
- `/api/quote/:token` - Public quote access
- `/api/tax/*` - Tax calculations and accruals
- `/api/onboarding/*` - Client onboarding management
- `/api/marketing/*` - Lead source, effort tracking, AI generation
- `/api/dashboard/*` - Dashboard metrics
- `/api/admin/*` - Admin panel endpoints
- `/api/subscription/*` - Stripe checkout integration
- `/api/webhook/stripe` - Payment webhooks

### Frontend (React)
- Pages: Landing, Login, Register, Dashboard, Jobs, Finance, Marketing, Onboarding, Profile, Subscription, Quote (public), Admin
- Components: Layout with responsive sidebar/bottom nav
- UI: Shadcn/UI + Tailwind CSS
- Charts: Recharts
- Axios interceptor for JWT Bearer token

### Database (MongoDB)
Collections: users, user_sessions, jobs, quote_tokens, tax_accruals, onboardings, lead_sources, marketing_efforts, ai_content_history, payment_transactions, admin_chat

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
- [x] Expanded business info fields (P.IVA, SDI, PEC, etc.)
- [x] Subscription tiers with Stripe
- [x] 100% Italian UI
- [x] Italian formatting (€1.234,56 / DD/MM/YYYY)
- [x] Mobile-responsive design

## Test Results (March 30, 2026)
- Backend: 100% (22/22 tests passed)
- Frontend: 100% (all pages functional)
- Italian localization: Complete

## Prioritized Backlog

### P0 (Critical) - COMPLETE
- [x] User authentication
- [x] Dashboard metrics
- [x] Tax planning calculator
- [x] Job profitability tracker
- [x] Quote generator
- [x] Admin panel
- [x] AI marketing content

### P1 (High)
- [x] Client onboarding system
- [x] Lead source tracking
- [x] Subscription/payment
- [ ] Email notifications (SendGrid configured, needs implementation for admin alerts on registration)
- [ ] CSV export for accountant

### P2 (Medium)
- [ ] PWA installable
- [ ] Offline mode
- [ ] Bulk job import
- [ ] Custom job types
- [ ] Photo upload for jobs
- [ ] Registro Imprese API integration (company lookup)

### P3 (Future)
- [ ] Visual configurator
- [ ] Team collaboration
- [ ] Native mobile apps
- [ ] API integrations (QuickBooks, Fatture in Cloud)
- [ ] Dynamic tax deadlines from Agenzia delle Entrate

## API Keys & Integrations
- **Stripe:** sk_test_emergent (configured)
- **Emergent LLM Key:** Configured for Gemini 3 Flash
- **SendGrid:** Placeholder in .env (needs real key for emails)

## Next Action Items
1. Implement SendGrid email notifications for registration alerts to info@cameleon.design
2. Add CSV export functionality for accountant
3. Configure PWA manifest and service worker
4. Add photo upload to jobs and onboarding
5. Research Registro Imprese API for company lookup feature
