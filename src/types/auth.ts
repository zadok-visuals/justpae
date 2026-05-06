
import { User, Session } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone?: string;
  country?: string;
  avatar_url?: string;
  is_kyc_verified: boolean;
}

export interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  signup: (email: string, password: string, name: string, phone?: string, country?: string) => Promise<{ error?: string; needsVerification?: boolean }>;
  verifyOtp: (email: string, token: string) => Promise<{ error?: string; success?: boolean }>;
  resendOtp: (email: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error?: string }>;
  updateKYCStatus: (isVerified: boolean) => Promise<{ error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ error?: string }>;
  loading: boolean;
  // MFA Methods
  initializeMFA: () => Promise<{ id: string; secret: string; qr: string } | { error: string }>;
  verifyMFA: (factorId: string, code: string) => Promise<{ error?: string }>;
  checkMFAStatus: () => Promise<boolean>;
  listFactors: () => Promise<{ data: any } | { error: string }>;
  exportUserData: (userId: string) => Promise<{ success?: boolean; error?: string }>;
  deleteAccount: (userId: string) => Promise<{ success?: boolean; error?: string }>;
}
