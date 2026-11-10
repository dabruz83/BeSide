import { useEffect, useState, useRef, useCallback } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";

// Pages
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { VerifyEmailPage } from "@/pages/VerifyEmailPage";
import { EmailVerificationPendingPage } from "@/pages/EmailVerificationPendingPage";
import { SupportTicketPage } from "@/pages/SupportTicketPage";
import { RecoveryEmailVerifyPage } from "@/pages/RecoveryEmailVerifyPage";
import { RecoveryContactAcceptPage } from "@/pages/RecoveryContactAcceptPage";
import { Recovery2FARequestPage } from "@/pages/Recovery2FARequestPage";
import { Recovery2FAApprovePage } from "@/pages/Recovery2FAApprovePage";
import { MfaSetupPage } from "@/pages/MfaSetupPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { JobsPage } from "@/pages/JobsPage";
import { FinancePage } from "@/pages/FinancePage";
import { MarketingPage } from "@/pages/MarketingPage";
import { CalendarPage } from "@/pages/CalendarPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { OnboardingWizardPage } from "@/pages/OnboardingWizardPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { ClientOnboardingPage } from "@/pages/ClientOnboardingPage";
import { QuotePage } from "@/pages/QuotePage";
import { AdminPage } from "@/pages/AdminPage";
import { ConfiguratorPage } from "@/pages/ConfiguratorPage";
import { LegalTermsPage } from "@/pages/LegalTermsPage";
import { LegalPrivacyPage } from "@/pages/LegalPrivacyPage";

import { SubscriptionPage } from "@/pages/SubscriptionPage";

// Components
import { Layout } from "@/components/Layout";

// Keep browser requests same-origin in production so Safari does not need to
// accept a third-party session cookie. The frontend server proxies /api to the
// configured backend; Vite does the same in local development.
const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").trim().replace(/\/+$/, "");
export const API = process.env.REACT_APP_DIRECT_BACKEND === "true"
  ? `${BACKEND_URL}/api`
  : "/api";

// Configure axios defaults
axios.defaults.withCredentials = true;

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    // A rejected password or TOTP challenge is NOT an expired login session.
    // Logout only when a protected request explicitly reports missing,
    // revoked or expired session credentials.
    const detail = error.response?.data?.detail;
    const sessionErrors = new Set([
      "Non autenticato",
      "Sessione scaduta",
      "Sessione revocata o scaduta",
      "Sessione non valida o legacy",
    ]);
    const requestPath = (error.config?.url || "").split("?")[0];
    const isLoginChallenge = /\/auth\/(login|2fa\/verify|2fa\/confirm|2fa\/setup)$/.test(requestPath);
    if (error.response?.status === 401 && !isLoginChallenge &&
        typeof detail === "string" && sessionErrors.has(detail)) {
      window.dispatchEvent(new Event('beside:session-expired'));
    }
    return Promise.reject(error);
  }
);

// Auth Context
import { createContext, useContext } from "react";

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Remove credentials left by older builds. Authentication now uses only
    // Secure, HttpOnly cookies that JavaScript cannot read.
    window.localStorage.removeItem('beside_token');
    window.localStorage.removeItem('beside_admin_token');
    // CRITICAL: If returning from OAuth callback, skip the /me check.
    // AuthCallback will exchange the session_id and establish the session first.
    if (window.location.hash?.includes('session_id=')) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const handleExpiredSession = () => setUser(null);
    window.addEventListener('beside:session-expired', handleExpiredSession);
    return () => window.removeEventListener('beside:session-expired', handleExpiredSession);
  }, []);

  const login = (userData) => {
    setUser(userData);
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {});
    } catch (error) {
      console.error("Logout error:", error);
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

// Auth Callback Component
const AuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processCallback = async () => {
      const hash = location.hash;
      const sessionId = hash.split('session_id=')[1]?.split('&')[0];

      if (!sessionId) {
        navigate('/login', { replace: true });
        return;
      }

      try {
        const response = await axios.post(
          `${API}/auth/session`,
          { session_id: sessionId }
        );
        login(response.data.user);
        navigate('/dashboard', { replace: true, state: { user: response.data.user } });
      } catch (error) {
        console.error("Auth callback error:", error);
        navigate('/login', { replace: true });
      }
    };

    processCallback();
  }, [location, navigate, login]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Autenticazione in corso...</p>
      </div>
    </div>
  );
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Caricamento...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

// App Router Component
const AppRouter = () => {
  const location = useLocation();

  // Check URL fragment for session_id synchronously during render
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/termini" element={<LegalTermsPage />} />
      <Route path="/privacy" element={<LegalPrivacyPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/verify-email/pending" element={<EmailVerificationPendingPage />} />
      <Route path="/support" element={<SupportTicketPage />} />
      <Route path="/verify-recovery-email" element={<RecoveryEmailVerifyPage />} />
      <Route path="/recovery-contact/accept" element={<RecoveryContactAcceptPage />} />
      <Route path="/recovery-2fa" element={<Recovery2FARequestPage />} />
      <Route path="/recovery-2fa/approve" element={<Recovery2FAApprovePage />} />
      <Route path="/mfa/setup" element={<MfaSetupPage />} />
      <Route path="/onboarding/client/:token" element={<ClientOnboardingPage />} />
      <Route path="/personalizza" element={<ProtectedRoute><OnboardingWizardPage /></ProtectedRoute>} />
      <Route path="/quote/:token" element={<QuotePage />} />
      <Route path="/admin" element={<AdminPage />} />
      
      {/* Protected Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <DashboardPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/jobs"
        element={
          <ProtectedRoute>
            <Layout>
              <JobsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/finance"
        element={
          <ProtectedRoute>
            <Layout>
              <FinancePage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="/calendar" element={<ProtectedRoute><Layout><CalendarPage /></Layout></ProtectedRoute>} />
      <Route
        path="/marketing"
        element={
          <ProtectedRoute>
            <Layout>
              <MarketingPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <Layout>
              <OnboardingPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Layout>
              <ProfilePage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="/subscription" element={<ProtectedRoute><Layout><SubscriptionPage /></Layout></ProtectedRoute>} />
      <Route path="/subscription/success" element={<ProtectedRoute><Layout><SubscriptionPage /></Layout></ProtectedRoute>} />
      {/* Configurator - Protected route */}
      <Route
        path="/configurator"
        element={
          <ProtectedRoute>
            <ConfiguratorPage />
          </ProtectedRoute>
        }
      />
      
      {/* Catch all - redirect to dashboard if logged in, otherwise landing */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
