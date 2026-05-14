
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
  Scale
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

  return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="p-4 pb-24 space-y-6">
          {/* Header */}
          <div className="flex items-center space-x-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="p-2">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Settings</h1>
          </div>

          {/* Theme Settings */}
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {isDarkMode ? (
                    <Moon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  ) : (
                    <Sun className="w-5 h-5 text-gray-600" />
                  )}
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Dark Mode</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Switch between light and dark theme</p>
                  </div>
                </div>
                <Switch
                  checked={isDarkMode}
                  onCheckedChange={toggleTheme}
                />
              </div>
            </CardContent>
          </Card>

          {/* Account Settings */}
          <div>
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Account</h2>
            <div className="space-y-3">
              <Link to="/profile">
                <Card className="rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-fintech-orange rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Personal Information</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Update your profile details</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link to="/security">
                <Card className="rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                        <Shield className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Security Settings</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">PIN, Face ID, and security options</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>

          {/* Feedback Section */}
          <div>
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Feedback</h2>
            <div className="space-y-3">
              <Card className="rounded-2xl shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setShowFeedback(true)}>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white">Send Feedback</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Share your thoughts and suggestions</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>


          {/* Data Management */}
          <div>
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Data & Privacy</h2>
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start h-auto p-4 mb-3 border-gray-200 dark:border-gray-800"
                onClick={handleExportData}
              >
                <div className="flex items-center space-x-3 text-left">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center">
                    <FileText className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Export Data</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Download a copy of your personal data</p>
                  </div>
                </div>
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start h-auto p-4 border-red-200 dark:border-red-900/20 hover:bg-red-50 dark:hover:bg-red-900/10 hover:text-red-600 hover:border-red-300"
                onClick={() => setShowDeleteAlert(true)}
              >
                <div className="flex items-center space-x-3 text-left">
                  <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center">
                    <Trash2 className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-red-600 dark:text-red-400">Delete Account</h3>
                    <p className="text-sm text-red-500/70 dark:text-red-400/70">Permanently remove your account and data</p>
                  </div>
                </div>
              </Button>
            </div>
          </div>

          {/* Support & Legal */}
          <div>
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Support & Legal</h2>
            <div className="space-y-3">
              <Link to="/help">
                <Card className="rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                        <HelpCircle className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Help & Support</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Get help or contact support</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link to="/privacy">
                <Card className="rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center">
                        <FileText className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Privacy Policy</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Read our privacy policy</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link to="/terms">
                <Card className="rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-fintech-blue rounded-full flex items-center justify-center">
                        <Scale className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Terms of Use</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Our terms and conditions</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link to="/data-protection">
                <Card className="rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                        <Shield className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Data Protection</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Data compliance & safety</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>
        </div>

        {/* Feedback Modal */}
        {showFeedback && (
          <FeedbackForm
            isModal={true}
            onClose={() => setShowFeedback(false)}
          />
        )}

        <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete your account
                and remove your data from our servers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteAccount} className="bg-red-600 hover:bg-red-700">
                Delete Account
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
  );
};

export default Settings;
