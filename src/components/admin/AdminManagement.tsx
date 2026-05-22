import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Shield, UserPlus, Trash2, CheckCircle, XCircle, Clock, History } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

interface AdminUser {
  id: string;
  user_id: string;
  admin_role: string;
  is_active: boolean;
  created_at: string;
  profiles: {
    email: string;
    name: string;
  } | null;
}

interface AdminSessionLog {
  id: string;
  admin_user_id: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
  admin_users: {
    admin_role: string;
    profiles: {
      name: string;
      email: string;
    } | null;
  };
}

const AdminManagement = () => {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [sessions, setSessions] = useState<AdminSessionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [newAdminId, setNewAdminId] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'admin' | 'super_admin' | 'moderator'>('admin');
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      console.log('Fetching administrators...');
      
      // Step 1: Fetch all admin user records
      const { data: adminData, error: adminError } = await supabase
        .from('admin_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (adminError) throw adminError;

      if (!adminData || adminData.length === 0) {
        setAdmins([]);
        return;
      }

      // Step 2: Fetch profiles for all these admins
      const userIds = adminData.map(a => a.user_id);
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, name')
        .in('id', userIds);

      if (profileError) throw profileError;

      // Step 3: Merge the data
      const profileMap = (profileData || []).reduce((acc, profile) => {
        acc[profile.id] = profile;
        return acc;
      }, {} as Record<string, any>);

      const mergedAdmins = adminData.map(admin => ({
        ...admin,
        profiles: profileMap[admin.user_id] || null
      }));

      setAdmins(mergedAdmins as any);
    } catch (error: any) {
      console.error('Error fetching admins:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load administrators",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      // Step 1: Fetch sessions with basic admin_users data only
      const { data: sessionData, error } = await supabase
        .from('admin_sessions')
        .select(`
          id,
          ip_address,
          user_agent,
          created_at,
          admin_user_id,
          admin_users (
            admin_role,
            user_id
          )
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      if (!sessionData || sessionData.length === 0) {
        setSessions([]);
        return;
      }

      // Step 2: Gather unique user_ids and fetch their profiles
      const userIds = [...new Set(sessionData.map((s: any) => s.admin_users?.user_id).filter(Boolean))];
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', userIds);

      const profileMap = (profileData || []).reduce((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {} as Record<string, any>);

      // Step 3: Merge profile data into sessions
      const merged = sessionData.map((s: any) => ({
        ...s,
        admin_users: s.admin_users
          ? {
              admin_role: s.admin_users.admin_role,
              profiles: profileMap[s.admin_users.user_id] || null
            }
          : null
      }));

      setSessions(merged as any);
    } catch (error) {
      console.error('Error fetching admin sessions:', error);
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
    fetchSessions();
  }, []);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminId) return;

    setProcessing(true);
    try {
      // Check if user exists in profiles
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', newAdminId)
        .single();

      if (profileError || !profile) {
        throw new Error('User ID not found in profiles. Ensure the user has a valid account.');
      }

      // Check if already an admin
      const { data: existingAdmins } = await supabase
        .from('admin_users')
        .select('id')
        .eq('user_id', newAdminId);

      if (existingAdmins && existingAdmins.length > 0) {
        throw new Error('User is already an administrator.');
      }

      const { error: insertError } = await supabase
        .from('admin_users')
        .insert({
          user_id: newAdminId,
          admin_role: newAdminRole,
          is_active: true
        });

      if (insertError) throw insertError;

      toast({
        title: "Success",
        description: `User has been appointed as ${newAdminRole}`,
      });
      setNewAdminId('');
      fetchAdmins();
    } catch (error: any) {
      console.error('Error adding admin:', error);
      toast({
        title: "Failed to Add Admin",
        description: error.message || "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  const toggleAdminStatus = async (adminId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('admin_users')
        .update({ is_active: !currentStatus })
        .eq('id', adminId);

      if (error) throw error;
      
      toast({
        title: "Status Updated",
        description: `Administrator has been ${!currentStatus ? 'activated' : 'deactivated'}`,
      });
      fetchAdmins();
    } catch (error) {
      console.error('Error toggling admin status:', error);
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white flex items-center">
            <Shield className="w-5 h-5 mr-2 text-fintech-orange" />
            Appoint New Administrator
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddAdmin} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm font-medium mb-1 block">User ID (UUID)</label>
                <Input 
                  value={newAdminId}
                  onChange={(e) => setNewAdminId(e.target.value)}
                  placeholder="e.g. 28789b38-04a9-48c1-9f85-6ca16c3f6308"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Role</label>
                <select 
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={newAdminRole}
                  onChange={(e) => setNewAdminRole(e.target.value as any)}
                >
                  <option value="moderator">Moderator</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
            </div>
            <Button 
              type="submit" 
              disabled={processing || !newAdminId}
              className="w-full bg-fintech-orange hover:bg-fintech-orange/90"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              {processing ? 'Processing...' : 'Appoint Administrator'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">Current Administrators</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-3 font-semibold">Admin Name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fintech-orange mx-auto"></div>
                    </td>
                  </tr>
                ) : admins.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-gray-500">No administrators found</td>
                  </tr>
                ) : (
                  admins.map((admin) => (
                    <tr key={admin.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-4 font-medium text-gray-900 dark:text-white">
                        {admin.profiles?.name || 'System Admin'}
                      </td>
                      <td className="px-4 py-4 text-gray-600 dark:text-gray-400">
                        {admin.profiles?.email || 'N/A'}
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant="outline" className={
                          admin.admin_role === 'super_admin' ? 'border-red-500 text-red-500' :
                          admin.admin_role === 'admin' ? 'border-fintech-orange text-fintech-orange' :
                          'border-blue-500 text-blue-500'
                        }>
                          {admin.admin_role.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        {admin.is_active ? (
                          <span className="flex items-center text-green-500">
                            <CheckCircle className="w-4 h-4 mr-1" /> Active
                          </span>
                        ) : (
                          <span className="flex items-center text-red-500">
                            <XCircle className="w-4 h-4 mr-1" /> Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => toggleAdminStatus(admin.id, admin.is_active)}
                          className={admin.is_active ? 'text-red-500 hover:text-red-600 hover:bg-red-50' : 'text-green-500 hover:text-green-600 hover:bg-green-50'}
                        >
                          {admin.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white flex items-center">
            <History className="w-5 h-5 mr-2 text-fintech-orange" />
            Recent Administrator Activity (Shift Log)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-3 font-semibold">Administrator</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Login Time</th>
                  <th className="px-4 py-3 font-semibold">IP Address</th>
                  <th className="px-4 py-3 font-semibold">Device</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {loadingSessions ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fintech-orange mx-auto"></div>
                    </td>
                  </tr>
                ) : sessions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-gray-500">No recent activity logs found</td>
                  </tr>
                ) : (
                  sessions.map((session) => (
                    <tr key={session.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-4 font-medium text-gray-900 dark:text-white">
                        {session.admin_users?.profiles?.name || 'System Admin'}
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant="secondary" className="text-[10px]">
                          {session.admin_users?.admin_role?.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-gray-600 dark:text-gray-400">
                        {format(new Date(session.created_at), 'MMM dd, yyyy HH:mm:ss')}
                      </td>
                      <td className="px-4 py-4 font-mono text-xs text-gray-500">
                        {session.ip_address || 'Internal'}
                      </td>
                      <td className="px-4 py-4 text-xs text-gray-500 truncate max-w-[150px]" title={session.user_agent}>
                        {session.user_agent || 'Unknown'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminManagement;
