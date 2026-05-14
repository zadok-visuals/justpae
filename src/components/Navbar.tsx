
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Home, History, MessageCircle, Gift, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const Navbar = () => {
  const location = useLocation();
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = async () => {
    if (!user) return;
    const { count, error } = await supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)
      .eq('sender_type', 'admin');
    
    if (!error) setUnreadCount(count || 0);
  };

  useEffect(() => {
    fetchUnreadCount();

    if (!user) return;

    const channel = supabase
      .channel('navbar_unread_count')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages'
        },
        () => fetchUnreadCount()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);
  
  const navItems = [
    { path: '/dashboard', label: 'Home', icon: Home },
    { path: '/wallet', label: 'History', icon: History },
    { path: '/chat', label: 'Chat', icon: MessageCircle, hasBadge: true },
    { path: '/gift-cards', label: 'Cards', icon: Gift },
    { path: '/profile', label: 'Profile', icon: User }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:top-0 md:bottom-auto w-full bg-white dark:bg-gray-900 border-t md:border-b border-gray-200 dark:border-gray-800 z-50">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-around md:justify-between items-center h-16">
          <div className="hidden md:flex items-center space-x-2">
            <img 
              src="/lovable-uploads/d8bf89ab-4a7e-4d3a-b1d3-c492661136b6.png" 
              alt="Logo" 
              className="w-8 h-8"
            />
            <span className="font-bold text-xl text-primary">Amazingpay</span>
          </div>

          <div className="flex justify-around md:justify-end items-center w-full md:w-auto md:space-x-8">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const IconComponent = item.icon;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex flex-col md:flex-row items-center py-2 px-3 transition-all duration-200 group relative",
                    isActive 
                      ? "text-primary" 
                      : "text-gray-500 hover:text-primary"
                  )}
                >
                  <div className="relative">
                    <IconComponent className="w-5 h-5 mb-1 md:mb-0 md:mr-2 group-hover:scale-110 transition-transform" />
                    {item.hasBadge && unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 md:right-1 w-3 h-3 bg-red-500 border-2 border-white dark:border-gray-900 rounded-full animate-pulse" />
                    )}
                  </div>
                  <span className="text-[10px] md:text-sm font-medium">{item.label}</span>
                  {isActive && (
                    <div className="w-1 h-1 bg-primary rounded-full mt-1 md:hidden" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
