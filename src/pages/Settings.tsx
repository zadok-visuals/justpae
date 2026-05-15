import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/contexts/ThemeContext';
import FeedbackForm from '@/components/FeedbackForm';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Moon,
  Sun,
  HelpCircle,
  Shield,
  User,
  FileText,
  MessageSquare,
  Trash2,
  Scale,
  ChevronRight
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const Settings = () => {
  const { isDarkMode, toggleTheme } = useTheme();
  const [showFeedback, setShowFeedback] = useState(false);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const { user, exportUserData, deleteAccount } = useAuth();
  const { toast } = useToast();

  const handleExportData = async () => {
    if (!user) return;
    toast({ title: "Exporting data...", description: "Your data download will start shortly." });
    const { error } = await exportUserData(user.id);
    if (error) {
      toast({ title: "Export failed", description: error, variant: "destructive" });
    } else {
      toast({ title: "Export successful", description: "Your data has been downloaded." });
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    const { error } = await deleteAccount(user.id);
    if (error) {
      toast({ title: "Deletion failed", description: error, variant: "destructive" });
    }
  };

  const SettingItem = ({ icon: Icon, title, description, to, onClick, colorClass = "bg-fintech-orange", trailing = <ChevronRight className="w-5 h-5 text-gray-400" /> }: any) => {
    const content = (
      <div className="flex items-center space-x-3 p-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer group">
        <div className={`w-10 h-10 ${colorClass} rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-white leading-none mb-1">{title}</h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">{description}</p>
        </div>
        {trailing}
      </div>
    );

    if (to) return <Link to={to} className="block border-b border-gray-100 dark:border-gray-800 last:border-none">{content}</Link>;
    return <div onClick={onClick} className="border-b border-gray-100 dark:border-gray-800 last:border-none">{content}</div>;
  };

  return (
    <div className="w-full bg-gray-50 dark:bg-gray-900 flex flex-col relative">
      <div className="flex-1 w-full max-w-2xl mx-auto p-4 space-y-8">
        
        {/* Sticky Header Section */}
        <div className="sticky top-0 z-30 bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-md -mx-4 px-4 sm:-mx-6 sm:px-6 pt-2 pb-2 border-b border-gray-100 dark:border-gray-800 mb-6">
          <div className="flex items-center space-x-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="p-2 text-gray-600 dark:text-gray-300">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Settings</h1>
          </div>
        </div>

        {/* Display & Accessibility */}
        <section>
          <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1 mb-3">Display & App</h2>
          <Card className="rounded-3xl overflow-hidden border-gray-100 dark:border-gray-800 shadow-sm">
            <SettingItem 
              icon={isDarkMode ? Moon : Sun}
              title="Theme Mode"
              description="Switch between light and dark visual themes"
              colorClass="bg-fintech-blue"
              trailing={<Switch checked={isDarkMode} onCheckedChange={toggleTheme} />}
            />
          </Card>
        </section>

        {/* Account Management */}
        <section>
          <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1 mb-3">Account & Security</h2>
          <Card className="rounded-3xl overflow-hidden border-gray-100 dark:border-gray-800 shadow-sm">
            <SettingItem 
              icon={User}
              title="Personal Information"
              description="Update your legal name, phone and profile details"
              to="/profile"
              colorClass="bg-fintech-orange"
            />
            <SettingItem 
              icon={Shield}
              title="Security Settings"
              description="PIN, Biometrics, and Two-Factor Authentication"
              to="/security"
              colorClass="bg-blue-600"
            />
          </Card>
        </section>

        {/* Feedback & Support */}
        <section>
          <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1 mb-3">Support & Feedback</h2>
          <Card className="rounded-3xl overflow-hidden border-gray-100 dark:border-gray-800 shadow-sm">
            <SettingItem 
              icon={MessageSquare}
              title="Send Feedback"
              description="Share your thoughts or suggest new features"
              onClick={() => setShowFeedback(true)}
              colorClass="bg-purple-600"
            />
            <SettingItem 
              icon={HelpCircle}
              title="Help & Support Center"
              description="Get help or contact our support team"
              to="/help"
              colorClass="bg-green-600"
            />
          </Card>
        </section>

        {/* Legal & Data */}
        <section>
          <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1 mb-3">Data & Privacy</h2>
          <Card className="rounded-3xl overflow-hidden border-gray-100 dark:border-gray-800 shadow-sm">
            <SettingItem 
              icon={FileText}
              title="Privacy Policy"
              description="Review how we handle and protect your data"
              to="/privacy"
              colorClass="bg-indigo-600"
            />
            <SettingItem 
              icon={Scale}
              title="Terms of Use"
              description="Our legal agreement and service terms"
              to="/terms"
              colorClass="bg-slate-700"
            />
            <SettingItem 
              icon={Shield}
              title="Data Protection"
              description="GDPR and data compliance information"
              to="/data-protection"
              colorClass="bg-teal-600"
            />
            <SettingItem 
              icon={FileText}
              title="Export Your Data"
              description="Download a copy of all your account information"
              onClick={handleExportData}
              colorClass="bg-blue-500"
            />
          </Card>
        </section>

        {/* Danger Zone */}
        <section className="pb-10">
          <Card className="rounded-3xl overflow-hidden border-red-100 dark:border-red-900/20 shadow-sm bg-red-50/30 dark:bg-red-950/10">
            <SettingItem 
              icon={Trash2}
              title="Delete Account"
              description="Permanently remove your account and all data"
              onClick={() => setShowDeleteAlert(true)}
              colorClass="bg-red-600"
              trailing={<ChevronRight className="w-5 h-5 text-red-400" />}
            />
          </Card>
        </section>

      </div>

      {/* Feedback Modal */}
      {showFeedback && (
        <FeedbackForm
          isModal={true}
          onClose={() => setShowFeedback(false)}
        />
      )}

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent className="rounded-3xl border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500">
              This action cannot be undone. This will permanently delete your account
              and remove your data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-2xl border-gray-100">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAccount} className="bg-red-600 hover:bg-red-700 rounded-2xl">
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Settings;
