
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Users, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const AdminAnalytics = () => {
  const [analytics, setAnalytics] = useState({
    dailyTransactions: [],
    monthlyRevenue: [],
    userGrowth: [],
    transactionTypes: [],
    topCountries: []
  });
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    totalUsers: 0,
    completedTransactions: 0,
    avgTransactionValue: 0,
    growthRate: 0
  });

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      // Fetch transactions for analysis
      const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });

      // Fetch users for analysis
      const { data: users } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (transactions && users) {
        processAnalyticsData(transactions, users);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const processAnalyticsData = (transactions: any[], users: any[]) => {
    // Calculate metrics
    const completedTxs = transactions.filter(tx => tx.status === 'completed');
    const totalRevenue = completedTxs.reduce((sum, tx) => sum + (tx.fiat_amount || 0), 0);
    const avgTransactionValue = completedTxs.length > 0 ? totalRevenue / completedTxs.length : 0;

    // Daily transactions (last 30 days)
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split('T')[0];
    }).reverse();

    const dailyTransactions = last30Days.map(date => {
      const dayTxs = transactions.filter(tx => tx.created_at.startsWith(date));
      return {
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        transactions: dayTxs.length,
        volume: dayTxs.reduce((sum, tx) => sum + (tx.fiat_amount || 0), 0)
      };
    });

    // Monthly revenue (last 12 months)
    const last12Months = Array.from({ length: 12 }, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }).reverse();

    const monthlyRevenue = last12Months.map(month => {
      const monthTxs = completedTxs.filter(tx => tx.created_at.startsWith(month));
      const revenue = monthTxs.reduce((sum, tx) => sum + (tx.fiat_amount || 0), 0);
      return {
        month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short' }),
        revenue
      };
    });

    // User growth (last 12 months)
    const userGrowth = last12Months.map(month => {
      const monthUsers = users.filter(user => user.created_at.startsWith(month));
      return {
        month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short' }),
        users: monthUsers.length
      };
    });

    // Transaction types
    const typeGroups = transactions.reduce((acc, tx) => {
      acc[tx.type] = (acc[tx.type] || 0) + 1;
      return acc;
    }, {});

    const transactionTypes = Object.entries(typeGroups).map(([type, count]) => ({
      type: type.charAt(0).toUpperCase() + type.slice(1),
      count,
      percentage: ((count as number) / transactions.length * 100).toFixed(1)
    }));

    // Top countries
    const countryGroups = users.reduce((acc, user) => {
      const country = user.country || 'Unknown';
      acc[country] = (acc[country] || 0) + 1;
      return acc;
    }, {});

    const topCountries = Object.entries(countryGroups)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => (b.count as number) - (a.count as number))
      .slice(0, 5);

    setAnalytics({
      dailyTransactions,
      monthlyRevenue,
      userGrowth,
      transactionTypes,
      topCountries
    });

    setMetrics({
      totalRevenue,
      totalUsers: users.length,
      completedTransactions: completedTxs.length,
      avgTransactionValue,
      growthRate: 12.5 // This would be calculated based on historical data
    });
  };

  const COLORS = ['#ff7300', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fintech-orange"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">₦{metrics.totalRevenue.toLocaleString()}</div>
            <div className="flex items-center text-xs text-green-600">
              <TrendingUp className="w-3 h-3 mr-1" />
              +{metrics.growthRate}% from last month
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Users</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{metrics.totalUsers}</div>
            <div className="flex items-center text-xs text-blue-600">
              <TrendingUp className="w-3 h-3 mr-1" />
              +8.2% from last month
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Completed Transactions</CardTitle>
            <Activity className="h-4 w-4 text-fintech-orange" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{metrics.completedTransactions}</div>
            <div className="flex items-center text-xs text-fintech-orange">
              <TrendingUp className="w-3 h-3 mr-1" />
              +15.3% from last month
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Transaction Value</CardTitle>
            <DollarSign className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">₦{metrics.avgTransactionValue.toLocaleString()}</div>
            <div className="flex items-center text-xs text-red-600">
              <TrendingDown className="w-3 h-3 mr-1" />
              -2.1% from last month
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Transactions */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Daily Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.dailyTransactions}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#6B7280" />
                <YAxis stroke="#6B7280" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1F2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="transactions" fill="#ff7300" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Monthly Revenue */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Monthly Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" stroke="#6B7280" />
                <YAxis stroke="#6B7280" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1F2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px'
                  }}
                />
                <Line type="monotone" dataKey="revenue" stroke="#00C49F" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Transaction Types */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Transaction Types</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analytics.transactionTypes}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="count"
                >
                  {analytics.transactionTypes.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-4 mt-4">
              {analytics.transactionTypes.map((entry, index) => (
                <div key={entry.type} className="flex items-center">
                  <div 
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {entry.type} ({entry.percentage}%)
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Countries */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Top Countries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.topCountries.map((country, index) => (
                <div key={country.country} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-fintech-orange text-white flex items-center justify-center text-sm font-bold mr-3">
                      {index + 1}
                    </div>
                    <span className="text-gray-900 dark:text-white">{country.country}</span>
                  </div>
                  <span className="text-gray-600 dark:text-gray-400">{country.count} users</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminAnalytics;
