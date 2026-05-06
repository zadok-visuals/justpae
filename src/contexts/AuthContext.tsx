
import React, { createContext, useContext } from 'react';
import { AuthContextType, UserProfile } from '@/types/auth';
import { useAuthState } from '@/hooks/useAuthState';
import { authService } from '@/services/authService';
import { sessionService } from '@/services/sessionService';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    user,
    session,
    profile,
    loading,
    setProfile
  } = useAuthState();

  const login = async (email: string, password: string): Promise<{ error?: string }> => {
    const result = await authService.login(email, password);

    // Set session if login successful
    if (!result.error && user) {
      sessionService.setUserSession(user.id);
    }

    return result;
  };

  const signup = async (
    email: string,
    password: string,
    name: string,
    phone?: string,
    country?: string
  ): Promise<{ error?: string; needsVerification?: boolean }> => {
    return await authService.signup(email, password, name, phone, country);
  };

  const verifyOtp = async (email: string, token: string): Promise<{ error?: string; success?: boolean }> => {
    return await authService.verifyOtp(email, token);
  };

  const resendOtp = async (email: string): Promise<{ error?: string }> => {
    return await authService.resendOtp(email);
  };

  const logout = async () => {
    // Clear session before logging out
    sessionService.clearUserSession();
    await authService.logout();
  };

  const updateProfile = async (updates: Partial<UserProfile>): Promise<{ error?: string }> => {
    if (!user) return { error: 'No user logged in' };

    const result = await authService.updateProfile(user.id, updates);

    if (!result.error && profile) {
      setProfile({ ...profile, ...updates });
    }

    return result;
  };

  const updateKYCStatus = async (isVerified: boolean): Promise<{ error?: string }> => {
    return updateProfile({ is_kyc_verified: isVerified });
  };

  const updatePassword = async (newPassword: string): Promise<{ error?: string }> => {
    return await authService.updatePassword(newPassword);
  };

  const isAuthenticated = !!user && !!session;

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      session,
      isAuthenticated,
      login,
      signup,
      verifyOtp,
      resendOtp,
      logout,
      updateProfile,
      updateKYCStatus,
      updatePassword,
      loading,
      initializeMFA: authService.initializeMFA,
      verifyMFA: authService.verifyMFA,
      checkMFAStatus: authService.checkMFAStatus,
      listFactors: authService.listFactors,
      exportUserData: authService.exportUserData,
      deleteAccount: authService.deleteAccount
    }}>
      {children}
    </AuthContext.Provider>
  );
};
