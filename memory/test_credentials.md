# BESIDE - Test Credentials

## Test User Account
- **Email:** tester1774887218@test.it
- **Password:** TestPass123!
- **Role:** user
- **Subscription:** essential (trial)

## Admin Account
- **Email:** admin@beside.it
- **Password:** BesideAdmin2026!
- **Role:** super_admin
- **Admin Panel URL:** /admin

## Other Test Users
- info@cameleon.design (Owner account)
- demo@beside.it (Demo account)
- davide831@hotmail.it (User account)

## API Endpoints
- **Base URL:** https://calm-installer.preview.emergentagent.com
- **API Prefix:** /api

## Auth Flow
- JWT tokens stored in localStorage as `beside_token`
- Token included via Axios interceptor as `Authorization: Bearer {token}`
- Admin tokens stored as `beside_admin_token`

## Key Endpoints to Test
- POST /api/auth/login - User login
- POST /api/admin/login - Admin login
- GET /api/export/jobs-csv - Export jobs to CSV
- GET /api/export/tax-accruals-csv - Export tax accruals to CSV
- POST /api/marketing/ai/generate - AI content generation with Gemini
