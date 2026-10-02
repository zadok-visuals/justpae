
import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Settings, Bell } from 'lucide-react';

interface DashboardHeaderProps {
  userName: string;
  unreadNotifications: number;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  userName,
  unreadNotifications
}) => {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-foreground">
            Hello, {userName} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">What are you trading today?</p>
        </div>
        <div className="flex items-center space-x-2">
          <Link to="/notifications" className="relative">
            <Button variant="ghost" size="icon" className="rounded-full bg-card border border-border hover:bg-accent">
              <Bell className="w-4.5 h-4.5 text-foreground" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-semibold rounded-full w-4.5 h-4.5 min-w-[18px] px-1 flex items-center justify-center">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </Button>
          </Link>
          <Link to="/settings">
            <Button variant="ghost" size="icon" className="rounded-full bg-card border border-border hover:bg-accent">
              <Settings className="w-4.5 h-4.5 text-foreground" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default DashboardHeader;
