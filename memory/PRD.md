# BESIDE - Product Requirements Document

## Project Overview
**Name:** BESIDE  
**Type:** SaaS Dashboard for Italian Auto Wrap/PPF Installers  
**Target:** 1-5 person installation teams  
**Business Model:** €97-397/month subscription  
**Language:** 100% Italian UI

## Core Features (All Implemented)

### 1. Authentication System
- JWT-based email/password authentication
- Google OAuth via Emergent Auth
- Session management with secure cookies
- Admin-specific login at /admin

### 2. Dashboard
- 5 Key Metrics with Quick Actions
- Monthly statistics
- Tax deadlines alerts

### 3. Tax Planning Calculator
- Italian tax regime support (Forfettario 5%/15%, Ordinario)
- Auto-calculates IRPEF, INPS, IVA
- 6-month forecast
- CSV Export for Accountant

### 4. Job Profitability Tracker
- Job types: PPF, Wrap, Tint, Upholstery
- Profitability analytics
- CSV Export

### 5. Quote Generator
- Public quote links (/quote/:token)
- Client accept/reject with signature

### 6. Client Onboarding System
- Pre-work checklist
- Public client-facing page

### 7. Lead Source Tracker & Marketing
- ROI calculation
- AI Content Generator (Gemini 3 Flash)

### 8. Admin Panel (/admin)
- User management
- Payment history
- Platform statistics

### 9. Email Notifications
- Registration notification to info@cameleon.design via SendGrid

### 10. PWA Support
- Manifest.json configured
- Service Worker for offline caching

## NEW: Wrap Configurator (March 31, 2026)

### Overview
Interactive 7-step vehicle wrap configurator allowing customers to:
- Select vehicle type (9 options)
- Choose base car color
- Select film finish and color (7 finishes, 40+ colors)
- Pick zones to wrap with real-time pricing
- Add optional tinting
- Book appointment
- Pay via Stripe

### Technical Implementation
- **Route:** /configurator (protected, requires login)
- **State Management:** useReducer hook
- **Animations:** Framer Motion
- **Preview:** Interactive SVG with zone highlighting
- **Pricing:** Dynamic calculation with vehicle × film multipliers

### Files Created
```
/app/frontend/src/components/configurator/
├── WrapConfigurator.jsx        (main component)
├── hooks/
│   └── useConfigurator.js      (state management)
├── data/
│   ├── vehicles.js             (9 vehicle types)
│   ├── films.js                (7 finishes + colors)
│   ├── zones.js                (6 wrappable zones)
│   ├── colors.js               (base colors)
│   ├── tinting.js              (tinting options)
│   └── mockAvailability.js     (calendar mock data)
├── utils/
│   └── priceCalculator.js      (price logic)
├── preview/
│   └── VehiclePreview.jsx      (SVG vehicle)
├── ui/
│   ├── StepIndicator.jsx
│   ├── ColorSwatch.jsx
│   ├── ZoneButton.jsx
│   └── PriceTag.jsx
└── steps/
    ├── Step0_Vehicle.jsx
    ├── Step1_BaseColor.jsx
    ├── Step2_Film.jsx
    ├── Step3_Zones.jsx
    ├── Step4_Tinting.jsx
    ├── Step5_Booking.jsx
    └── Step6_Summary.jsx
```

### Pricing Formula
```
total = (Σ zone_prices + Σ tinting_prices) × vehicle_mult × film_mult
```

### Vehicle Multipliers
- City Car: 0.70
- Segmento B: 0.85
- Segmento C: 1.00 (standard)
- Segmento D: 1.15
- Segmento E/GT: 1.30
- SUV: 1.20
- Furgoncino: 1.10
- Van: 1.50
- Furgone: 2.00

### Film Multipliers
- Lucida: 1.0
- Opaca: 1.1
- Satinata: 1.2
- Metallizzata: 1.3
- Perlescente: 1.4
- Carbonio: 1.5
- Cangiante: 1.8

### Zone Base Prices
- Tetto: €180
- Cofano: €140
- Porte+Fiancate: €280
- Parte Inferiore: €180
- Specchietti: €60
- Fari Anteriori: €60

## Technical Architecture

### Backend (FastAPI)
- All `/api/*` endpoints
- SendGrid email integration
- CSV export endpoints
- Gemini 3 Flash AI integration

### Frontend (React + PWA)
- Pages: Landing, Login, Register, Dashboard, Jobs, Finance, Marketing, Onboarding, Profile, Subscription, Quote (public), Admin, **Configurator**
- Shadcn/UI + Tailwind CSS
- Framer Motion for animations
- Axios with JWT interceptor

### Database (MongoDB)
All collections configured

## Prioritized Backlog

### COMPLETED
- [x] All P0/P1 features
- [x] **Wrap Configurator core** (vehicle preview + zone selection + pricing)

### IN PROGRESS
- [ ] Configurator: Stripe payment integration
- [ ] Configurator: Backend API for bookings
- [ ] Configurator: Admin settings for prices

### P2 (Medium)
- [ ] Apple Sign-In
- [ ] Registro Imprese API
- [ ] Configurator: Custom vehicle SVGs from user

### P3 (Future)
- [ ] Native mobile apps
- [ ] Team collaboration

## Test Credentials
- **User:** tester1774887218@test.it / TestPass123!
- **Admin:** admin@beside.it / BesideAdmin2026!

## API Keys & Integrations
- **Stripe:** sk_test_emergent (configured)
- **Emergent LLM Key:** Configured for Gemini 3 Flash
- **SendGrid:** Placeholder (needs real key for production)
