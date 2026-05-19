
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Plus, Minus } from 'lucide-react';
import TransactionAuth from '@/components/auth/TransactionAuth';

const QuickActions: React.FC = () => {
  const navigate = useNavigate();

  const handleAuthSuccess = (route: string) => {
    navigate(route);
  };

  const handleAuthCancel = () => {
    // Do nothing, user cancelled
  };

  const actions = [
    {
      to: '/sell-crypto',
      icon: Minus,
      label: 'Sell',
      gradient: 'from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700',
      requiresAuth: false
    },
    {
      to: '/withdraw',
      icon: ArrowUp,
      label: 'Withdraw',
      gradient: 'from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700',
      requiresAuth: true
    },
    {
      to: '/deposit',
      icon: ArrowDown,
      label: 'Deposit',
      gradient: 'from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700',
      requiresAuth: false
    },
    {
      to: '/buy-crypto',
      icon: Plus,
      label: 'Buy',
      gradient: 'from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700',
      requiresAuth: true
    }
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4 flex items-center text-gray-900 dark:text-white">
        Quick Actions 🚀
      </h2>
      <div className="grid grid-cols-4 gap-3">
        {actions.map((action) => {
          const ActionIcon = action.icon;



          if (action.requiresAuth) {
            return (
              <TransactionAuth
                key={action.to}
                onSuccess={() => handleAuthSuccess(action.to)}
                onCancel={handleAuthCancel}
                transactionType={action.label.toLowerCase()}
              >
                <div className="text-center group cursor-pointer">
                  <div className={`w-14 h-14 bg-gradient-to-br ${action.gradient} text-white rounded-2xl flex items-center justify-center mx-auto mb-2 transition-all duration-200 group-hover:scale-105 shadow-lg`}>
                    <ActionIcon className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{action.label}</span>
                </div>
              </TransactionAuth>
            );
          }

          return (
            <Link key={action.to} to={action.to}>
              <div className="text-center group">
                <div className={`w-14 h-14 bg-gradient-to-br ${action.gradient} text-white rounded-2xl flex items-center justify-center mx-auto mb-2 transition-all duration-200 group-hover:scale-105 shadow-lg`}>
                  <ActionIcon className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{action.label}</span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Gift Cards Link */}
      <div className="mt-4">
        <Link to="/gift-cards">
          <div className="bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20 rounded-2xl p-4 text-center group">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 text-white rounded-lg flex items-center justify-center">
                <span className="text-sm">🎁</span>
              </div>
              <span className="font-semibold text-gray-900 dark:text-white">Gift Cards</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">Convert gift cards to cash</p>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default QuickActions;
