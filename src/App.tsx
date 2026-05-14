import { useEffect } from "react";
import { App as CapacitorApp, URLOpenListenerEvent } from "@capacitor/app";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { WalletProvider } from "@/contexts/WalletContext";
import { supabase } from "@/integrations/supabase/client"; // Replace with your exact custom client path if different
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRouteGuard from "@/components/admin/AdminRouteGuard";
import Layout from "@/components/Layout";
import Index from "./pages/Index";
import Welcome from "./pages/Welcome";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import VerifyResetToken from "./pages/VerifyResetToken";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import BuyCrypto from "./pages/BuyCrypto";
import SellCrypto from "./pages/SellCrypto";
import GiftCards from "./pages/GiftCards";
import KYCVerification from "./pages/KYCVerification";
import Wallet from "./pages/Wallet";
import Profile from "./pages/Profile";
import Deposit from "./pages/Deposit";
import Withdraw from "./pages/Withdraw";
import CryptoDeposit from "./pages/CryptoDeposit";
import Settings from "./pages/Settings";
import Security from "./pages/Security";
import HelpSupport from "./pages/HelpSupport";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import NotFound from "./pages/NotFound";
import ChangePassword from "./pages/ChangePassword";
import TwoFactorAuth from "./pages/TwoFactorAuth";
import AdminDashboard from "./pages/AdminDashboard";
import AdminLogin from "./pages/AdminLogin";
import Notifications from "@/pages/Notifications";
import Chat from "@/pages/Chat";
import TermsOfUse from "./pages/TermsOfUse";
import DataProtection from "./pages/DataProtection";

const queryClient = new QueryClient();

// NEW ISOLATED CORE DEEP LINK LISTENER
const DeepLinkHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const initDeepLinks = async () => {
      await CapacitorApp.addListener("appUrlOpen", async (event: URLOpenListenerEvent) => {
        const urlString = event.url;
        
        // Handle variations in how iOS formats deep links
        const hashSplit = urlString.split("#");
        const cleanUrl = hashSplit[0]; // This is 'amazingpay://oauth2redirect'
        
        if (hashSplit.length > 1) {
          const hashParams = new URLSearchParams(hashSplit[1]);
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");

          if (accessToken && refreshToken) {
            // Direct injection to ensure Supabase bypasses network delays
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (!error) {
              // Crucial step: give the context provider half a second to save state, then push
              setTimeout(() => {
                navigate("/dashboard", { replace: true });
              }, 500);
            } else {
              console.error("Session sync issue:", error.message);
              navigate("/login", { replace: true });
            }
          }
        }
      });
    };

    initDeepLinks();

    return () => {
      CapacitorApp.removeAllListeners();
    };
  }, [navigate]);

  return null;
};



const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <WalletProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            {/* INJECTED INSIDE BROWSERROUTER PARENT CONTEXT CONTAINER */}
            <DeepLinkHandler />
            <Routes>
              <Route path="/" element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              } />
              <Route path="/welcome" element={
                <ProtectedRoute>
                  <Welcome />
                </ProtectedRoute>
              } />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/verify-reset-token" element={<VerifyResetToken />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              
              {/* Admin Routes */}
              <Route path="/admin-login" element={<AdminLogin />} />
              <Route path="/admin" element={
                <ProtectedRoute redirectTo="/admin-login">
                  <AdminRouteGuard>
                    <AdminDashboard />
                  </AdminRouteGuard>
                </ProtectedRoute>
              } />
              
              {/* Protected Routes with Layout */}
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/notifications" element={
                <ProtectedRoute>
                  <Layout>
                    <Notifications />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/chat" element={
                <ProtectedRoute>
                  <Layout>
                    <Chat />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/buy-crypto" element={
                <ProtectedRoute>
                  <Layout>
                    <BuyCrypto />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/sell-crypto" element={
                <ProtectedRoute>
                  <Layout>
                    <SellCrypto />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/gift-cards" element={
                <ProtectedRoute>
                  <Layout>
                    <GiftCards />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/kyc" element={
                <ProtectedRoute>
                  <Layout>
                    <KYCVerification />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/wallet" element={
                <ProtectedRoute>
                  <Layout>
                    <Wallet />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute>
                  <Layout>
                    <Profile />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/deposit" element={
                <ProtectedRoute>
                  <Layout>
                    <Deposit />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/withdraw" element={
                <ProtectedRoute>
                  <Layout>
                    <Withdraw />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/crypto-deposit" element={
                <ProtectedRoute>
                  <Layout>
                    <CryptoDeposit />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/settings" element={
                <ProtectedRoute>
                  <Layout>
                    <Settings />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/security" element={
                <ProtectedRoute>
                  <Layout>
                    <Security />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/help" element={
                <ProtectedRoute>
                  <Layout>
                    <HelpSupport />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/privacy" element={
                <ProtectedRoute>
                  <PrivacyPolicy />
                </ProtectedRoute>
              } />
              <Route path="/terms" element={
                <ProtectedRoute>
                  <TermsOfUse />
                </ProtectedRoute>
              } />
              <Route path="/data-protection" element={
                <ProtectedRoute>
                  <DataProtection />
                </ProtectedRoute>
              } />
              <Route path="/change-password" element={
                <ProtectedRoute>
                  <Layout>
                    <ChangePassword />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/two-factor-auth" element={
                <ProtectedRoute>
                  <Layout>
                    <TwoFactorAuth />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </WalletProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
