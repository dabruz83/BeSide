# BESIDE - Product Requirements Document

## Project Overview
**Name:** BESIDE  
**Type:** SaaS Dashboard for Italian Auto Wrap/PPF Installers  
**Target:** 1-5 person installation teams  
**Business Model:** €97-397/month subscription  

## Problem Statement
Italian auto wrap/PPF installers are excellent technicians but struggle with business management. BESIDE provides a comprehensive dashboard combining financial tools, automation, and analytics to help them understand profitability, plan taxes, and manage clients.

## User Personas
1. **Solo Installer** - Single technician managing all aspects of business
2. **Small Team Owner** - 2-5 person team needing coordination tools
3. **Growing Business** - Expanding operations needing analytics

## Core Requirements (Implemented)

### Authentication System ✅
- JWT-based email/password authentication
- Google OAuth via Emergent Auth
- Session management with secure cookies

### Dashboard ✅
- 5 Key Metrics:
  - Tax reserve balance (€ accrued)
  - Cash flow status (green/yellow/red)
  - Most profitable job type
  - Top performing lead source
  - Upcoming Italian tax deadlines (with 60-30-15 day alerts)
- Monthly statistics (jobs, revenue, margin)
- Quick action buttons

### Tax Planning Calculator ✅
- Italian tax regime support:
  - Forfettario 5%
  - Forfettario 15%
  - Regime Ordinario
- Auto-calculates:
  - IRPEF (income tax)
  - INPS (24% social security)
  - IVA (22% VAT for ordinario)
- 6-month cash flow forecast
- Monthly accrual tracking

### Job Profitability Tracker ✅
- Job types: PPF Full/Partial, Wrap Decorative/Commercial, Tint, Upholstery
- Vehicle types: Sedan, SUV, Van, Truck
- Tracks: quote, hours, materials, waste %
- Auto-calculates: net profit, margin %, hourly rate
- Profitability charts by job type and vehicle type

### Client Onboarding System ✅
- Pre-work checklist (6 items)
- Unique link generation for clients
- Status tracking: pending/in_progress/complete/overdue
- Public client-facing checklist page

### Lead Source Tracker ✅
- Sources: Passaparola, Instagram, Facebook, Google, Partnership, Fiere, Website
- Revenue per source analysis
- Hours invested tracking
- ROI calculation (€/hour)
- 80/20 insights auto-generated

### Subscription System ✅
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
- `/api/tax/*` - Tax calculations and accruals
- `/api/onboarding/*` - Client onboarding management
- `/api/marketing/*` - Lead source and effort tracking
- `/api/dashboard/*` - Dashboard metrics
- `/api/subscription/*` - Stripe checkout integration
- `/api/webhook/stripe` - Payment webhooks

### Frontend (React)
- Pages: Landing, Login, Register, Dashboard, Jobs, Finance, Marketing, Onboarding, Profile, Subscription
- Components: Layout with responsive sidebar/bottom nav
- UI: Shadcn/UI + Tailwind CSS
- Charts: Recharts

### Database (MongoDB)
- Collections: users, user_sessions, jobs, tax_accruals, onboardings, lead_sources, marketing_efforts, payment_transactions

## What's Been Implemented (March 2026)
- [x] Complete authentication (JWT + Google OAuth)
- [x] Dashboard with 5 KPIs
- [x] Tax calculator with all Italian regimes
- [x] Job tracker with profitability analytics
- [x] Client onboarding system
- [x] Lead source tracking
- [x] Marketing ROI calculator
- [x] Subscription tiers with Stripe
- [x] 100% Italian UI
- [x] Mobile-responsive design

## Prioritized Backlog

### P0 (Critical)
- [x] ~~User authentication~~ DONE
- [x] ~~Dashboard metrics~~ DONE
- [x] ~~Tax planning calculator~~ DONE
- [x] ~~Job profitability tracker~~ DONE

### P1 (High)
- [x] ~~Client onboarding system~~ DONE
- [x] ~~Lead source tracking~~ DONE
- [x] ~~Subscription/payment~~ DONE
- [ ] Email notifications (SendGrid configured, needs implementation)
- [ ] CSV export for accountant

### P2 (Medium)
- [ ] PWA installable
- [ ] Offline mode
- [ ] Bulk job import
- [ ] Custom job types
- [ ] Photo upload for jobs

### P3 (Future)
- [ ] AI Workflows (quote generator, email drafts)
- [ ] Visual configurator
- [ ] Team collaboration
- [ ] Native mobile apps
- [ ] API integrations (QuickBooks, Fatture in Cloud)

## Next Action Items
1. Implement SendGrid email notifications for tax deadlines
2. Add CSV export functionality
3. Configure PWA manifest and service worker
4. Add photo upload to onboarding checklist
5. Logo integration (user to provide)
