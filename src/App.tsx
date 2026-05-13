
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { WalletProvider } from "@/contexts/WalletContext";
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <WalletProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/welcome" element={<Welcome />} />
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
                <Layout>
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/notifications" element={
                <Layout>
                  <ProtectedRoute>
                    <Notifications />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/chat" element={
                <Layout>
                  <ProtectedRoute>
                    <Chat />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/buy-crypto" element={
                <Layout>
                  <ProtectedRoute>
                    <BuyCrypto />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/sell-crypto" element={
                <Layout>
                  <ProtectedRoute>
                    <SellCrypto />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/gift-cards" element={
                <Layout>
                  <ProtectedRoute>
                    <GiftCards />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/kyc" element={
                <Layout>
                  <ProtectedRoute>
                    <KYCVerification />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/wallet" element={
                <Layout>
                  <ProtectedRoute>
                    <Wallet />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/profile" element={
                <Layout>
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/deposit" element={
                <Layout>
                  <ProtectedRoute>
                    <Deposit />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/withdraw" element={
                <Layout>
                  <ProtectedRoute>
                    <Withdraw />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/crypto-deposit" element={
                <Layout>
                  <ProtectedRoute>
                    <CryptoDeposit />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/settings" element={
                <Layout>
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/security" element={
                <Layout>
                  <ProtectedRoute>
                    <Security />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/help" element={
                <Layout>
                  <ProtectedRoute>
                    <HelpSupport />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfUse />} />
              <Route path="/data-protection" element={<DataProtection />} />
              <Route path="/change-password" element={
                <Layout>
                  <ProtectedRoute>
                    <ChangePassword />
                  </ProtectedRoute>
                </Layout>
              } />
              <Route path="/two-factor-auth" element={
                <Layout>
                  <ProtectedRoute>
                    <TwoFactorAuth />
                  </ProtectedRoute>
                </Layout>
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
