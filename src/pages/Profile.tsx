import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, ArrowLeft, Shield, Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const Profile = () => {
  const { user, profile, updateProfile, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [isEditing, setIsEditing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editData, setEditData] = useState({
    full_name: profile?.full_name || '',
    phone: profile?.phone || '',
    country: profile?.country || ''
  });

  useEffect(() => {
    checkAdminStatus();
  }, [user]);

  const checkAdminStatus = async () => {
    if (!user) return;
    
    try {
      const { data: isAdminData, error } = await supabase
        .rpc('is_admin_safe', { user_uuid: user.id });
      
      if (!error && isAdminData) {
        setIsAdmin(true);
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  };

  const handleSave = async () => {
    try {
      const result = await updateProfile(editData);
      
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Profile updated successfully",
        });
        setIsEditing(false);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive",
      });
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast({
        title: "Success",
        description: "Logged out successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to logout",
        variant: "destructive",
      });
    }
  };

  const handleAdminLogin = () => {
    navigate('/admin');
  };

  const getInitials = (name?: any) => {
    if (!name || typeof name !== 'string') return 'U';
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (!user || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Loading...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-gray-50 dark:bg-gray-900 flex flex-col relative">
      <div className="flex-1 w-full max-w-2xl mx-auto p-4 space-y-6">
        {/* Sticky Header Section */}
        <div className="sticky top-0 z-30 bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-md -mx-4 px-4 sm:-mx-6 sm:px-6 pt-2 pb-2 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/dashboard">
                <Button variant="ghost" size="sm" className="p-2 text-gray-600 dark:text-gray-300">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Profile</h1>
            </div>
            <Link to="/settings">
              <Button variant="ghost" size="sm" className="p-2 text-gray-600 dark:text-gray-300">
                <Settings className="w-5 h-5" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Profile Header */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="text-center pb-4">
            <div className="relative inline-block">
              <Avatar className="w-24 h-24 mx-auto">
                <AvatarImage src={profile.avatar_url} alt={profile.full_name} />
                <AvatarFallback className="text-lg font-semibold bg-fintech-orange text-white">
                  {getInitials(profile.full_name)}
                </AvatarFallback>
              </Avatar>
              <Button
                size="sm"
                variant="outline"
                className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full p-0 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              >
                <Camera className="w-4 h-4" />
              </Button>
            </div>
            <CardTitle className="mt-4 text-gray-900 dark:text-white">{profile.full_name}</CardTitle>
            <p className="text-gray-600 dark:text-gray-400">{profile.email}</p>
            <div className="flex justify-center mt-2 space-x-2">
              <Badge variant={profile.is_kyc_verified ? "default" : "secondary"}>
                {profile.is_kyc_verified ? "KYC Verified" : "KYC Pending"}
              </Badge>
              {isAdmin && (
                <Badge variant="outline" className="bg-fintech-orange/10 text-fintech-orange border-fintech-orange">
                  Admin
                </Badge>
              )}
            </div>
          </CardHeader>
        </Card>

        {/* Profile Information */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-gray-900 dark:text-white">Profile Information</CardTitle>
            <Button
              variant="outline"
              onClick={() => setIsEditing(!isEditing)}
              className="border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {isEditing ? 'Cancel' : 'Edit'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-gray-900 dark:text-white">Full Name</Label>
              {isEditing ? (
                <Input
                  id="full_name"
                  value={editData.full_name}
                  onChange={(e) => setEditData({ ...editData, full_name: e.target.value })}
                  className="mt-1 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
                />
              ) : (
                <p className="mt-1 text-gray-900 dark:text-white">{profile.full_name}</p>
              )}
            </div>

            <div>
              <Label htmlFor="email" className="text-gray-900 dark:text-white">Email Address</Label>
              <p className="mt-1 text-gray-900 dark:text-white">{profile.email}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Email cannot be changed</p>
            </div>

            <div>
              <Label htmlFor="phone" className="text-gray-900 dark:text-white">Phone Number</Label>
              {isEditing ? (
                <Input
                  id="phone"
                  value={editData.phone}
                  onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                  className="mt-1 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
                />
              ) : (
                <p className="mt-1 text-gray-900 dark:text-white">{profile.phone || 'Not provided'}</p>
              )}
            </div>

            <div>
              <Label htmlFor="country" className="text-gray-900 dark:text-white">Country</Label>
              {isEditing ? (
                <Input
                  id="country"
                  value={editData.country}
                  onChange={(e) => setEditData({ ...editData, country: e.target.value })}
                  className="mt-1 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
                />
              ) : (
                <p className="mt-1 text-gray-900 dark:text-white">{profile.country || 'Not provided'}</p>
              )}
            </div>

            {isEditing && (
              <div className="flex space-x-4">
                <Button onClick={handleSave} className="flex-1 bg-fintech-orange hover:bg-fintech-orange/90">
                  Save Changes
                </Button>
                <Button variant="outline" onClick={() => setIsEditing(false)} className="flex-1 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700">
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Actions */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Account Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link to="/change-password">
              <Button variant="outline" className="w-full border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700">
                Change Password
              </Button>
            </Link>

            {!profile.is_kyc_verified && (
              <Link to="/kyc">
                <Button className="w-full bg-fintech-orange hover:bg-fintech-orange/90 mt-2">
                  Complete KYC Verification
                </Button>
              </Link>
            )}
            {isAdmin && (
              <Button 
                onClick={handleAdminLogin}
                className="w-full bg-fintech-orange hover:bg-fintech-orange/90 flex items-center justify-center space-x-2"
              >
                <Shield className="w-4 h-4" />
                <span>Access Admin Panel</span>
              </Button>
            )}
            <Button 
              variant="outline" 
              onClick={handleLogout} 
              className="w-full border-gray-200 dark:border-gray-700 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Logout
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Profile;
