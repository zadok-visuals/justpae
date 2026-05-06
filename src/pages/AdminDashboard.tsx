
import React from 'react';
import AdminRouteGuard from '@/components/admin/AdminRouteGuard';
import AdminLayout from '@/components/admin/AdminLayout';
import AdminHeader from '@/components/admin/AdminHeader';
import DashboardStats from '@/components/admin/dashboard/DashboardStats';
import AdminTabs from '@/components/admin/dashboard/AdminTabs';
import { useAdminStats } from '@/hooks/useAdminStats';

const AdminDashboard = () => {
  const { stats, fetchDashboardStats } = useAdminStats();

  return (
    <AdminRouteGuard>
      <AdminLayout>
        <AdminHeader />
        
        <div className="container mx-auto p-6">
          <DashboardStats stats={stats} />
          <AdminTabs stats={stats} onStatsUpdate={fetchDashboardStats} />
        </div>
      </AdminLayout>
    </AdminRouteGuard>
  );
};

export default AdminDashboard;
