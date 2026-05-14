
import { supabase } from '@/integrations/supabase/client';
import { cleanupAuthState } from '@/utils/authUtils';

export const authService = {
  login: async (email: string, password: string) => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      console.log('Attempting login for:', normalizedEmail);

      // Removed cleanupAuthState() as it may interfere with Supabase client session handling
      // during the immediate subsequent signInWithPassword call.

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        console.error('Login error details:', {
          message: error.message,
          status: error.status,
          name: error.name,
          email: normalizedEmail
        });
        
        // If it's a 400 with 'Invalid login credentials', it could also mean unconfirmed
        // depending on project configuration, though usually it returns 'Email not confirmed'.
        if (error.message.includes('Email not confirmed')) {
          return { error: 'Please verify your email before logging in.' };
        }
        
        return { error: error.message };
      }

      if (data.user && !data.user.email_confirmed_at) {
        console.warn('User logged in but email not confirmed yet. Confirming status...', data.user.email_confirmed_at);
        return { error: 'Please verify your email before logging in.' };
      }

      console.log('Login successful:', data.user?.id);
      return { user: data.user };
    } catch (error) {
      console.error('Login catch error:', error);
      return { error: 'An unexpected error occurred during login.' };
    }
  },

  signInWithGoogle: async () => {
    try {
      console.log('Attempting Google Sign-In');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        }
      });

      if (error) {
        console.error('Google Sign-In error:', error);
        return { error: error.message };
      }

      return { data };
    } catch (error) {
      console.error('Google Sign-In catch error:', error);
      return { error: 'An unexpected error occurred during Google Sign-In.' };
    }
  },

  signup: async (email: string, password: string, name: string, phone?: string, country?: string) => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      console.log('Attempting signup for:', normalizedEmail);

      // Clean up any existing auth state first
      cleanupAuthState();

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            name,
            phone: phone || '',
            country: country || ''
          },
          emailRedirectTo: `${window.location.origin}/login`
        }
      });

      if (error) {
        console.error('Signup error details:', {
          message: error.message,
          status: error.status,
          name: error.name
        });

        // If user already exists, they might be unconfirmed. 
        // We should try to resend the verification code instead of just failing.
        if (error.message.includes('User already registered') || error.status === 422) {
          console.warn('User already registered. Resending OTP. Note: The password was NOT updated.', normalizedEmail);
          const resendResult = await authService.resendOtp(normalizedEmail);

          if (!resendResult.error) {
            return {
              needsVerification: true,
              message: 'This email is already registered. We\'ve sent a verification code to confirm your identity. Note: If you signed up with Google, you may need to use the Forgot Password flow to set a password.'
            };
          }
        }

        return { error: error.message };
      }

      console.log('Signup response data:', data);

      if (data.user && !data.session) {
        console.log('User created, email confirmation required. User ID:', data.user.id);

        // Call our custom Edge Function to send the OTP via Resend
        console.log('Invoking send-verification-email function...');
        const { error: funcError } = await supabase.functions.invoke('send-verification-email', {
          body: {
            email: normalizedEmail,
            user_id: data.user.id,
            action: 'signup'
          }
        });

        if (funcError) {
          console.error('Error invoking send-verification-email:', funcError);
          // Try to log more details if it's an HTTP error
          if (funcError instanceof Error && 'context' in funcError) {
            const context = (funcError as any).context;
            if (context instanceof Response) {
              try {
                const errorBody = await context.json();
                console.error('Function error body:', JSON.stringify(errorBody, null, 2));
              } catch (e) {
                console.error('Could not parse function error body');
              }
            }
          }
        }

        return {
          user: data.user,
          needsVerification: true,
          message: 'Please check your email and enter the verification code sent to you.'
        };
      }

      return { user: data.user };
    } catch (error) {
      console.error('Signup catch error:', error);
      return { error: 'An unexpected error occurred during signup.' };
    }
  },

  verifyOtp: async (email: string, token: string) => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      console.log('Verifying OTP for:', normalizedEmail, 'using custom Edge Function');

      const { data, error } = await supabase.functions.invoke('verify-email-otp', {
        body: {
          email: normalizedEmail,
          otp: token
        }
      });

      if (error || (data && data.error)) {
        console.error('OTP verification error:', error || data.error);
        return { error: error?.message || data?.error || 'Verification failed' };
      }

      console.log('OTP verification successful via Edge Function');
      return { success: true };
    } catch (error) {
      console.error('OTP verification catch error:', error);
      return { error: 'An unexpected error occurred during verification.' };
    }
  },

  resendOtp: async (email: string) => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      console.log('Resending OTP for:', normalizedEmail, 'using custom Edge Function');

      const { data, error } = await supabase.functions.invoke('send-verification-email', {
        body: {
          email: normalizedEmail,
          action: 'resend'
        }
      });

      if (error || (data && data.error)) {
        console.error('Resend OTP error details:', error || data.error);
        return { error: error?.message || data?.error || 'Failed to resend code' };
      }

      console.log('OTP resent successfully via Edge Function');
      return { success: true };
    } catch (error) {
      console.error('Resend OTP catch error:', error);
      return { error: 'An unexpected error occurred while resending code.' };
    }
  },

  logout: async () => {
    try {
      console.log('Logging out user');

      cleanupAuthState();

      const { error } = await supabase.auth.signOut({ scope: 'global' });

      if (error) {
        console.error('Logout error:', error);
      }

      // Force page reload to ensure clean state
      window.location.href = '/';
    } catch (error) {
      console.error('Logout catch error:', error);
      // Still redirect even if logout fails
      window.location.href = '/';
    }
  },

  updateProfile: async (userId: string, updates: any) => {
    try {
      console.log('Updating profile for:', userId);

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId);

      if (error) {
        console.error('Profile update error:', error);
        return { error: error.message };
      }

      console.log('Profile updated successfully');
      return { success: true };
    } catch (error) {
      console.error('Profile update catch error:', error);
      return { error: 'An unexpected error occurred during profile update.' };
    }
  },

  updatePassword: async (newPassword: string) => {
    try {
      console.log('Updating password');

      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        console.error('Password update error:', error);
        return { error: error.message };
      }

      console.log('Password updated successfully');
      return { success: true };
    } catch (error) {
      console.error('Password update catch error:', error);
      return { error: 'An unexpected error occurred during password update.' };
    }
  },

  initializeMFA: async () => {
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp'
      });
      if (error) {
        console.error('MFA enroll error:', error);
        return { error: error.message };
      }
      return {
        id: data.id,
        secret: data.totp.secret,
        qr: data.totp.qr_code
      };
    } catch (error) {
      console.error('MFA enroll catch error:', error);
      return { error: 'An unexpected error occurred during MFA initialization.' };
    }
  },

  verifyMFA: async (factorId: string, code: string) => {
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) {
        console.error('MFA challenge error:', challenge.error);
        return { error: challenge.error.message };
      }

      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code,
      });
      if (verify.error) {
        console.error('MFA verify error:', verify.error);
        return { error: verify.error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('MFA verify catch error:', error);
      return { error: 'An unexpected error occurred during MFA verification.' };
    }
  },

  checkMFAStatus: async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return false;

      const totpFactor = data.totp.find(f => f.status === 'verified');
      return !!totpFactor;
    } catch (error) {
      console.error('Check MFA status error:', error);
      return false;
    }
  },

  listFactors: async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return { error: error.message };
    return { data };
  },

  exportUserData: async (userId: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;

      // Convert to JSON and blob for download
      const dataStr = JSON.stringify(profile, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

      const exportFileDefaultName = 'user_data.json';

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      return { success: true };
    } catch (error: any) {
      console.error('Export data error:', error);
      return { error: error.message };
    }
  },

  deleteAccount: async (userId: string) => {
    try {
      // Note: Actual deletion often requires calling an Edge Function or having specific RLS policies.
      // We attempt to delete the profile first.
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      await supabase.auth.signOut();
      window.location.href = '/';
      return { success: true };
    } catch (error: any) {
      console.error('Delete account error:', error);
      return { error: error.message };
    }
  }
};
