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

## API Endpoints
- **Base URL:** https://calm-installer.preview.emergentagent.com
- **API Prefix:** /api

## Auth Flow
- JWT tokens stored in localStorage as `beside_token`
- Token included via Axios interceptor as `Authorization: Bearer {token}`
