import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type AdminRole = 'super_admin' | 'admin' | 'moderator' | null;

export const useAdminRole = () => {
  const [role, setRole] = useState<AdminRole>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const fetchRole = async () => {
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('admin_users')
          .select('admin_role')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('Error fetching admin role:', error);
          setRole(null);
        } else {
          setRole(data?.admin_role as AdminRole);
        }
      } catch (error) {
        console.error('Unexpected error fetching admin role:', error);
        setRole(null);
      } finally {
        setLoading(false);
      }
    };

    fetchRole();
  }, [user]);

  return { role, loading };
};
