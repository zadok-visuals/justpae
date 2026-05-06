
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  is_kyc_verified: boolean;
  account_status: string;
  created_at: string;
}

export const useUserManagement = (onStatsUpdate: () => void) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingAction, setProcessingAction] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchUsers = async (statusFilter: string = 'all') => {
    try {
      if (!user) {
        console.log('No user found, skipping users fetch');
        return;
      }

      // First verify admin status using the safe function
      const { data: isAdminData, error: adminError } = await supabase
        .rpc('is_admin_safe', { user_uuid: user.id });
      
      if (adminError) {
        console.error('Error checking admin status:', adminError);
        toast({
          title: "Permission Error",
          description: "Failed to verify admin permissions. Please contact support.",
          variant: "destructive",
        });
        return;
      }

      if (!isAdminData) {
        console.log('User is not an admin');
        toast({
          title: "Access Denied",
          description: "You don't have permission to view users.",
          variant: "destructive",
        });
        return;
      }

      let query = supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter === 'pending_kyc') {
        query = query.eq('is_kyc_verified', false);
      } else if (statusFilter !== 'all') {
        query = query.eq('account_status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKycAction = async (userId: string, action: 'approve' | 'reject' | 'revoke') => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to perform this action.",
        variant: "destructive",
      });
      return;
    }

    setProcessingAction(true);
    try {
      console.log('Processing KYC action:', { userId, action, adminId: user.id });

      // First, verify admin status again
      const { data: isAdminData, error: adminError } = await supabase
        .rpc('is_admin_safe', { user_uuid: user.id });
      
      if (adminError || !isAdminData) {
        throw new Error('Unauthorized: Admin access required');
      }

      // Update the user's KYC status
      const newKycStatus = action === 'approve' ? true : false;
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          is_kyc_verified: newKycStatus
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Error updating KYC:', updateError);
        throw new Error(`Failed to ${action} KYC: ${updateError.message}`);
      }

      // Log admin action in admin_actions table
      const { error: logError } = await supabase
        .from('admin_actions')
        .insert({
          admin_user_id: user.id,
          action_type: `${action}_kyc`,
          target_user_id: userId,
          target_table: 'profiles',
          target_id: userId,
          details: { action_type: `${action}_kyc`, timestamp: new Date().toISOString() }
        });

      if (logError) {
        console.error('Error logging admin action:', logError);
        // Don't fail the main action if logging fails
      }

      const actionMessages = {
        approve: 'approved',
        reject: 'rejected',
        revoke: 'revoked'
      };

      toast({
        title: "Success",
        description: `KYC ${actionMessages[action]} successfully`,
      });

      await fetchUsers();
      onStatsUpdate();
    } catch (error: any) {
      console.error('Error updating KYC:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update KYC status",
        variant: "destructive"
      });
    } finally {
      setProcessingAction(false);
    }
  };

  const handleAccountAction = async (userId: string, action: 'suspend' | 'activate') => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to perform this action.",
        variant: "destructive",
      });
      return;
    }

    setProcessingAction(true);
    try {
      console.log('Processing account action:', { userId, action, adminId: user.id });

      // First, verify admin status again
      const { data: isAdminData, error: adminError } = await supabase
        .rpc('is_admin_safe', { user_uuid: user.id });
      
      if (adminError || !isAdminData) {
        throw new Error('Unauthorized: Admin access required');
      }

      const newStatus = action === 'suspend' ? 'suspended' : 'active';

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ account_status: newStatus })
        .eq('id', userId);

      if (updateError) {
        throw new Error(`Failed to ${action} account: ${updateError.message}`);
      }

      // Log admin action
      const { error: logError } = await supabase
        .from('admin_actions')
        .insert({
          admin_user_id: user.id,
          action_type: `${action}_user`,
          target_user_id: userId,
          target_table: 'profiles',
          target_id: userId,
          details: { action_type: `${action}_user`, timestamp: new Date().toISOString() }
        });

      if (logError) {
        console.error('Error logging admin action:', logError);
        // Don't fail the main action if logging fails
      }

      toast({
        title: "Success",
        description: `User account ${action === 'suspend' ? 'suspended' : 'activated'} successfully`,
      });

      await fetchUsers();
      onStatsUpdate();
    } catch (error: any) {
      console.error('Error updating account status:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update account status",
        variant: "destructive"
      });
    } finally {
      setProcessingAction(false);
    }
  };

  return {
    users,
    loading,
    processingAction,
    fetchUsers,
    handleKycAction,
    handleAccountAction
  };
};
