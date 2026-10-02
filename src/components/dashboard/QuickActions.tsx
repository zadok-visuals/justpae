
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Plus, Minus, Gift } from 'lucide-react';
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
    { to: '/sell-crypto', icon: Minus, label: 'Sell', requiresAuth: false },
    { to: '/withdraw', icon: ArrowUp, label: 'Withdraw', requiresAuth: true },
    { to: '/deposit', icon: ArrowDown, label: 'Deposit', requiresAuth: false },
    { to: '/buy-crypto', icon: Plus, label: 'Buy', requiresAuth: true }
  ];

  const tileClass =
    'w-14 h-14 bg-card border border-border text-primary rounded-2xl flex items-center justify-center mx-auto mb-2 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/40';

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        Quick Actions
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
                  <div className={tileClass}>
                    <ActionIcon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium text-foreground">{action.label}</span>
                </div>
              </TransactionAuth>
            );
          }

          return (
            <Link key={action.to} to={action.to}>
              <div className="text-center group">
                <div className={tileClass}>
                  <ActionIcon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-foreground">{action.label}</span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-4">
        <Link to="/gift-cards">
          <div className="group flex items-center gap-3 bg-card border border-border rounded-2xl p-4 transition-colors hover:border-primary/40">
            <div className="w-10 h-10 shrink-0 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
              <Gift className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="block font-semibold text-sm text-foreground">Gift Cards</span>
              <p className="text-xs text-muted-foreground truncate">Convert gift cards to cash</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default QuickActions;
