"""
BESIDE API Tests - Comprehensive backend testing for Italian auto wrap/PPF installer SaaS
Tests: Auth, Jobs, Tax Calculator, Marketing, Admin, Quote endpoints
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://calm-installer.preview.emergentagent.com').rstrip('/')

# Test credentials from test_credentials.md
TEST_USER_EMAIL = "tester1774887218@test.it"
TEST_USER_PASSWORD = "TestPass123!"
ADMIN_EMAIL = "admin@beside.it"
ADMIN_PASSWORD = "BesideAdmin2026!"


class TestHealthAndRoot:
    """Basic API health checks"""
    
    def test_api_root(self):
        """Test API root endpoint returns welcome message"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ API root: {data['message']}")


class TestAuthentication:
    """Authentication flow tests"""
    
    def test_login_with_test_user(self):
        """Test login with test user credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_USER_EMAIL
        assert "first_name" in data["user"], "first_name field missing in user object"
        print(f"✓ Login successful for {TEST_USER_EMAIL}, first_name='{data['user'].get('first_name')}'")
        return data["token"]

    def test_register_with_first_name(self):
        """Test user registration accepts first_name field"""
        unique_email = f"test_reg_{uuid.uuid4().hex[:8]}@test.it"
        payload = {
            "email": unique_email,
            "password": "TestPass123!",
            "first_name": "Marco",
            "business_name": "TEST_Register_Business",
            "team_size": 1,
            "services": ["ppf"],
            "tax_regime": "forfettario_15"
        }
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code in [200, 201], f"Register failed: {response.text}"

        # Verify first_name is returned via login
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": unique_email, "password": "TestPass123!"
        })
        assert login_resp.status_code == 200
        user = login_resp.json()["user"]
        assert user.get("first_name") == "Marco", f"first_name mismatch: {user.get('first_name')}"
        print(f"✓ Registered {unique_email} with first_name='Marco'")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@test.it",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected")
    
    def test_get_current_user_with_token(self):
        """Test /auth/me endpoint with valid token"""
        # First login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        token = login_response.json()["token"]
        
        # Get current user
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == TEST_USER_EMAIL
        print(f"✓ /auth/me returned user: {data['email']}")
    
    def test_get_current_user_without_token(self):
        """Test /auth/me without token returns 401"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("✓ /auth/me correctly requires authentication")


class TestDashboard:
    """Dashboard metrics tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        return response.json()["token"]
    
    def test_dashboard_metrics(self, auth_token):
        """Test dashboard metrics endpoint returns 5 KPIs"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/metrics",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify 5 key metrics exist
        assert "tax_reserve_balance" in data
        assert "cash_flow_status" in data
        assert "most_profitable_job_type" in data
        assert "top_lead_source" in data
        assert "upcoming_tax_deadlines" in data
        
        print(f"✓ Dashboard metrics: tax_reserve={data['tax_reserve_balance']}, cash_flow={data['cash_flow_status']}")


class TestJobs:
    """Jobs and Quotes CRUD tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        return response.json()["token"]
    
    def test_create_job(self, auth_token):
        """Test creating a new job"""
        job_data = {
            "client_name": f"TEST_Client_{uuid.uuid4().hex[:6]}",
            "job_type": "ppf_full",
            "vehicle_type": "sedan",
            "vehicle_info": "BMW Serie 3 2024",
            "quote_amount": 2500.00,
            "hours_worked": 12.0,
            "materials_cost": 800.00,
            "lead_source": "instagram",
            "is_quote": False
        }
        
        response = requests.post(
            f"{BASE_URL}/api/jobs",
            json=job_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Job creation failed: {response.text}"
        data = response.json()
        
        assert "job_id" in data
        assert data["client_name"] == job_data["client_name"]
        assert data["profit_margin"] > 0  # Verify profitability calculation
        assert data["net_profit"] > 0
        assert data["hourly_rate"] > 0
        
        print(f"✓ Job created: {data['job_id']}, profit_margin={data['profit_margin']:.1f}%")
        return data["job_id"]
    
    def test_create_quote_with_link(self, auth_token):
        """Test creating a quote generates a public link"""
        quote_data = {
            "client_name": f"TEST_QuoteClient_{uuid.uuid4().hex[:6]}",
            "client_email": "testclient@example.it",
            "job_type": "wrap_decorative",
            "vehicle_type": "suv",
            "vehicle_info": "Audi Q5 2023",
            "quote_amount": 3500.00,
            "hours_worked": 0,  # Quote doesn't need hours
            "materials_cost": 0,
            "notes": "Preventivo per wrap completo colore personalizzato",
            "is_quote": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/jobs",
            json=quote_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Quote creation failed: {response.text}"
        data = response.json()
        
        assert data["is_quote"] == True
        assert data["quote_status"] == "pending"
        assert data["quote_link"] is not None
        assert "/quote/" in data["quote_link"]
        
        print(f"✓ Quote created with link: {data['quote_link']}")
        return data
    
    def test_get_jobs_list(self, auth_token):
        """Test getting list of jobs"""
        response = requests.get(
            f"{BASE_URL}/api/jobs",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Jobs list returned {len(data)} jobs")
    
    def test_get_profitability_analytics(self, auth_token):
        """Test profitability analytics endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/jobs/analytics/profitability",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "by_job_type" in data
        assert "by_vehicle_type" in data
        print(f"✓ Profitability analytics: {len(data['by_job_type'])} job types analyzed")


class TestPublicQuote:
    """Public quote viewing and acceptance tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        return response.json()["token"]
    
    def test_public_quote_access(self, auth_token):
        """Test accessing a quote via public link"""
        # First create a quote
        quote_data = {
            "client_name": f"TEST_PublicQuote_{uuid.uuid4().hex[:6]}",
            "client_email": "public@test.it",
            "job_type": "tint",
            "vehicle_type": "sedan",
            "quote_amount": 500.00,
            "hours_worked": 0,
            "materials_cost": 0,
            "is_quote": True
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/jobs",
            json=quote_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        quote = create_response.json()
        
        # Extract token from quote link
        quote_token = quote["quote_link"].split("/quote/")[-1]
        
        # Access public quote (no auth needed)
        response = requests.get(f"{BASE_URL}/api/quote/{quote_token}")
        assert response.status_code == 200
        data = response.json()
        
        assert data["client_name"] == quote_data["client_name"]
        assert data["quote_amount"] == quote_data["quote_amount"]
        assert "business_name" in data  # Should include business info
        
        print(f"✓ Public quote accessible: {data['client_name']}, amount={data['quote_amount']}")
    
    def test_quote_not_found(self):
        """Test accessing invalid quote token returns 404"""
        response = requests.get(f"{BASE_URL}/api/quote/invalid_token_12345")
        assert response.status_code == 404
        print("✓ Invalid quote token correctly returns 404")


class TestTaxCalculator:
    """Italian tax calculation tests"""
    
    def test_forfettario_15_calculation(self):
        """Test tax calculation for forfettario 15% regime"""
        response = requests.post(f"{BASE_URL}/api/tax/calculate", json={
            "revenue": 5000.00,
            "tax_regime": "forfettario_15",
            "period": "monthly"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["revenue"] == 5000.00
        assert data["tax_regime"] == "forfettario_15"
        assert data["irpef_amount"] > 0  # 15% on 78% of revenue
        assert data["inps_amount"] > 0   # 26.07% on 78% of revenue
        assert data["iva_amount"] == 0   # Forfettario is IVA exempt
        assert data["total_accrual"] > 0
        assert data["net_income"] > 0
        assert data["yearly_projection"] is not None
        
        print(f"✓ Forfettario 15%: IRPEF={data['irpef_amount']:.2f}, INPS={data['inps_amount']:.2f}, Net={data['net_income']:.2f}")
    
    def test_forfettario_5_calculation(self):
        """Test tax calculation for forfettario 5% regime (new businesses)"""
        response = requests.post(f"{BASE_URL}/api/tax/calculate", json={
            "revenue": 5000.00,
            "tax_regime": "forfettario_5",
            "period": "monthly"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["irpef_amount"] > 0  # 5% on 78% of revenue
        assert data["iva_amount"] == 0   # Forfettario is IVA exempt
        
        print(f"✓ Forfettario 5%: IRPEF={data['irpef_amount']:.2f}, Net={data['net_income']:.2f}")
    
    def test_ordinario_calculation(self):
        """Test tax calculation for regime ordinario"""
        response = requests.post(f"{BASE_URL}/api/tax/calculate", json={
            "revenue": 5000.00,
            "tax_regime": "ordinario",
            "period": "monthly"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["irpef_amount"] > 0  # Progressive IRPEF
        assert data["inps_amount"] > 0
        assert data["iva_amount"] > 0    # Ordinario has IVA
        
        print(f"✓ Ordinario: IRPEF={data['irpef_amount']:.2f}, IVA={data['iva_amount']:.2f}")
    
    def test_tax_deadlines(self):
        """Test tax deadlines endpoint"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        token = login_response.json()["token"]
        
        response = requests.get(
            f"{BASE_URL}/api/tax/deadlines",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "deadlines" in data
        if len(data["deadlines"]) > 0:
            deadline = data["deadlines"][0]
            assert "date" in deadline
            assert "description" in deadline
            assert "days_until" in deadline
            assert "urgency" in deadline
            print(f"✓ Tax deadlines: {len(data['deadlines'])} upcoming, next: {deadline['description']}")
        else:
            print("✓ Tax deadlines: No upcoming deadlines in next 120 days")


class TestMarketing:
    """Marketing and AI content generation tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        return response.json()["token"]
    
    def test_lead_sources_stats(self, auth_token):
        """Test lead sources statistics endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/marketing/lead-sources",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "lead_sources" in data
        print(f"✓ Lead sources: {len(data['lead_sources'])} sources tracked")
    
    def test_ai_content_generation_bacino_utenza(self, auth_token):
        """Test AI content generation for bacino_utenza step"""
        response = requests.post(
            f"{BASE_URL}/api/marketing/ai/generate",
            json={
                "step": "bacino_utenza",
                "context": {},
                "user_input": "Milano nord, zona Monza-Brianza"
            },
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=60  # AI generation can take time
        )
        assert response.status_code == 200, f"AI generation failed: {response.text}"
        data = response.json()
        
        assert "content" in data
        assert "step" in data
        assert data["step"] == "bacino_utenza"
        assert len(data["content"]) > 100  # Should have substantial content
        
        print(f"✓ AI content generated for bacino_utenza: {len(data['content'])} chars")


class TestAdmin:
    """Admin panel tests"""
    
    def test_admin_login(self):
        """Test admin login with super admin credentials"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        
        assert "token" in data
        assert "user" in data
        print(f"✓ Admin login successful: {data['user'].get('email', ADMIN_EMAIL)}")
        return data["token"]
    
    def test_admin_get_users(self):
        """Test admin can get users list"""
        # Login as admin
        login_response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_response.json()["token"]
        
        response = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "users" in data
        assert "total" in data
        print(f"✓ Admin users list: {data['total']} users")
    
    def test_admin_get_stats(self):
        """Test admin statistics endpoint"""
        # Login as admin
        login_response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_response.json()["token"]
        
        response = requests.get(
            f"{BASE_URL}/api/admin/stats",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "total_users" in data
        assert "active_users" in data
        assert "trial_users" in data
        assert "paying_users" in data
        assert "total_jobs" in data
        assert "total_revenue" in data
        assert isinstance(data["total_revenue"], (int, float))
        assert data["total_revenue"] >= 0
        
        print(f"✓ Admin stats: {data['total_users']} users, {data['total_jobs']} jobs, revenue=€{data['total_revenue']:.2f}")


class TestProfile:
    """Profile update tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        return response.json()["token"]
    
    def test_update_profile_business_info(self, auth_token):
        """Test updating profile with business info (P.IVA, SDI, PEC)"""
        update_data = {
            "business_name": "Test Installatore PPF",
            "team_size": 3,
            "tax_regime": "forfettario_15",
            "business_info": {
                "partita_iva": "IT12345678901",
                "sdi": "XXXXXXX",
                "pec": "test@pec.it",
                "indirizzo": "Via Test 123",
                "citta": "Milano",
                "cap": "20100",
                "provincia": "MI"
            }
        }
        
        response = requests.put(
            f"{BASE_URL}/api/auth/profile",
            json=update_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["business_name"] == update_data["business_name"]
        assert data["business_info"]["partita_iva"] == "IT12345678901"
        assert data["business_info"]["sdi"] == "XXXXXXX"
        
        print(f"✓ Profile updated: P.IVA={data['business_info']['partita_iva']}")


# Cleanup fixture to remove test data
@pytest.fixture(scope="session", autouse=True)
def cleanup_test_data():
    """Cleanup test data after all tests complete"""
    yield
    # Note: In production, we'd delete TEST_ prefixed data here
    print("\n✓ Test session complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
