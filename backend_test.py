import requests
import sys
import json
from datetime import datetime

class BESIDEAPITester:
    def __init__(self, base_url="https://calm-installer.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0

    def run_test(self, name, method, endpoint, expected_status, data=None, auth_required=True):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=headers)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                if response.text:
                    try:
                        resp_json = response.json()
                        if len(str(resp_json)) < 200:
                            print(f"   Response: {resp_json}")
                    except:
                        print(f"   Response (text): {response.text[:100]}...")
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}...")

            return success, response.json() if response.text and response.status_code < 400 else {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_root(self):
        """Test root endpoint"""
        return self.run_test("Root API", "GET", "", 200, auth_required=False)

    def test_config_endpoints(self):
        """Test configuration endpoints"""
        endpoints = [
            ("Job Types Config", "config/job-types"),
            ("Vehicle Types Config", "config/vehicle-types"),
            ("Lead Sources Config", "config/lead-sources"),
            ("Tax Regimes Config", "config/tax-regimes"),
            ("Subscription Tiers Config", "config/subscription-tiers")
        ]
        
        results = []
        for name, endpoint in endpoints:
            success, _ = self.run_test(name, "GET", endpoint, 200, auth_required=False)
            results.append(success)
        return all(results)

    def test_user_registration(self, email, password, business_name="Test Business"):
        """Test user registration"""
        user_data = {
            "email": email,
            "password": password,
            "business_name": business_name,
            "team_size": 1,
            "services": ["ppf_full", "wrap_decorative"],
            "tax_regime": "forfettario_15"
        }
        return self.run_test("User Registration", "POST", "auth/register", 200, data=user_data, auth_required=False)

    def test_user_login(self, email, password):
        """Test user login"""
        login_data = {
            "email": email,
            "password": password
        }
        success, response = self.run_test("User Login", "POST", "auth/login", 200, data=login_data, auth_required=False)
        return success, response

    def test_get_current_user(self):
        """Test getting current user info"""
        return self.run_test("Get Current User", "GET", "auth/me", 200)

    def test_tax_calculation(self):
        """Test tax calculation"""
        tax_data = {
            "monthly_revenue": 5000,
            "tax_regime": "forfettario_15"
        }
        return self.run_test("Tax Calculation", "POST", "tax/calculate", 200, data=tax_data, auth_required=False)

    def test_tax_deadlines(self):
        """Test tax deadlines"""
        return self.run_test("Tax Deadlines", "GET", "tax/deadlines", 200, auth_required=False)

    def test_create_job(self):
        """Test creating a job"""
        job_data = {
            "client_name": "Mario Rossi Test",
            "job_type": "ppf_full",
            "vehicle_type": "sedan", 
            "quote_amount": 1500.00,
            "hours_worked": 8.0,
            "materials_cost": 500.00,
            "lead_source": "instagram",
            "notes": "Test job creation"
        }
        return self.run_test("Create Job", "POST", "jobs", 201, data=job_data)

    def test_get_jobs(self):
        """Test getting jobs list"""
        return self.run_test("Get Jobs", "GET", "jobs", 200)

    def test_dashboard_metrics(self):
        """Test dashboard metrics"""
        return self.run_test("Dashboard Metrics", "GET", "dashboard/metrics", 200)

    def test_tax_accruals(self):
        """Test tax accruals endpoints"""
        # First get existing accruals
        success1, _ = self.run_test("Get Tax Accruals", "GET", "tax/accruals", 200)
        
        # Then create a new accrual
        current_month = datetime.now().strftime("%Y-%m")
        accrual_data = {
            "month": current_month,
            "revenue": 3000.00
        }
        success2, _ = self.run_test("Create Tax Accrual", "POST", "tax/accruals", 200, data=accrual_data)
        
        return success1 and success2

    def test_onboarding_flow(self):
        """Test onboarding endpoints"""
        # Create onboarding
        onboarding_data = {
            "client_name": "Test Client",
            "client_email": "testclient@example.com",
            "vehicle_info": "BMW X5 2023"
        }
        success1, response = self.run_test("Create Onboarding", "POST", "onboarding", 200, data=onboarding_data)
        
        # Get onboardings list
        success2, _ = self.run_test("Get Onboardings", "GET", "onboarding", 200)
        
        return success1 and success2

    def test_marketing_endpoints(self):
        """Test marketing endpoints"""
        # Get lead source stats
        success1, _ = self.run_test("Get Lead Source Stats", "GET", "marketing/lead-sources", 200)
        
        # Create marketing effort
        effort_data = {
            "month": datetime.now().strftime("%Y-%m"),
            "channel": "instagram",
            "hours_invested": 10.0
        }
        success2, _ = self.run_test("Create Marketing Effort", "POST", "marketing/efforts", 200, data=effort_data)
        
        # Get marketing efforts
        success3, _ = self.run_test("Get Marketing Efforts", "GET", "marketing/efforts", 200)
        
        return success1 and success2 and success3

def main():
    print("🚀 Starting BESIDE API Tests...")
    print("=" * 60)
    
    tester = BESIDEAPITester()
    
    # Test public endpoints first
    print("\n📋 Testing Public Endpoints...")
    tester.test_root()
    tester.test_config_endpoints()
    tester.test_tax_calculation()  # Public endpoint
    tester.test_tax_deadlines()   # Public endpoint
    
    # Test user authentication
    print("\n🔐 Testing Authentication...")
    test_email = f"testuser_{datetime.now().strftime('%H%M%S')}@test.com"
    test_password = "test123456"
    
    # Register user
    reg_success, reg_response = tester.test_user_registration(test_email, test_password)
    if not reg_success:
        print("❌ Registration failed, trying with existing test user")
        test_email = "test@beside.it"
        test_password = "test123456"
    
    # Login user
    login_success, login_response = tester.test_user_login(test_email, test_password)
    if not login_success:
        print("❌ Login failed, stopping authenticated tests")
        print(f"\n📊 Final Results: {tester.tests_passed}/{tester.tests_run} tests passed")
        return 1
    
    print("✅ Authentication successful!")
    
    # Test authenticated endpoints
    print("\n🏢 Testing Authenticated Endpoints...")
    tester.test_get_current_user()
    tester.test_dashboard_metrics()
    tester.test_create_job()
    tester.test_get_jobs()
    tester.test_tax_accruals()
    tester.test_onboarding_flow()
    tester.test_marketing_endpoints()
    
    # Print final results
    print("\n" + "=" * 60)
    print(f"📊 Final Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    success_rate = (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0
    print(f"📈 Success Rate: {success_rate:.1f}%")
    
    if success_rate >= 80:
        print("🎉 Great! Most APIs are working correctly")
        return 0
    elif success_rate >= 50:
        print("⚠️  Some issues found, but core functionality works") 
        return 0
    else:
        print("🚨 Critical issues found in API testing")
        return 1

if __name__ == "__main__":
    sys.exit(main())