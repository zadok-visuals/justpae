
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Home, History, MessageCircle, Gift, User } from 'lucide-react';

const Navbar = () => {
  const location = useLocation();
  
  const navItems = [
    { path: '/dashboard', label: 'Home', icon: Home },
    { path: '/wallet', label: 'History', icon: History },
    { path: '/chat', label: 'Chat', icon: MessageCircle },
    { path: '/gift-cards', label: 'Cards', icon: Gift },
    { path: '/profile', label: 'Profile', icon: User }
  ];

  return (
    <nav className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-md bg-card border-t border-border px-4 py-2 z-50">
      <div className="flex justify-around items-center">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const IconComponent = item.icon;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center py-2 px-3 transition-all duration-200",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-primary"
              )}
            >
              <IconComponent className="w-5 h-5 mb-1" />
              <span className="text-xs font-medium">{item.label}</span>
              {isActive && (
                <div className="w-1 h-1 bg-primary rounded-full mt-1" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default Navbar;
