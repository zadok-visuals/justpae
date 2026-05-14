
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, UserCheck, UserX, ShieldX, FileText } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  is_kyc_verified: boolean;
  account_status: string;
  created_at: string;
  kyc_phone_number?: string;
  kyc_address_proof_url?: string;
  kyc_submitted_at?: string;
}

interface UserDetailModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onKycAction: (userId: string, action: 'approve' | 'reject' | 'revoke') => Promise<void>;
  onAccountAction: (userId: string, action: 'suspend' | 'activate') => Promise<void>;
  processingAction: boolean;
}

const UserDetailModal: React.FC<UserDetailModalProps> = ({
  user,
  isOpen,
  onClose,
  onKycAction,
  onAccountAction,
  processingAction
}) => {
  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">User Management</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Name</label>
              <p className="text-gray-900 dark:text-white font-medium">{user.name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Email</label>
              <p className="text-gray-900 dark:text-white font-medium">{user.email}</p>
            </div>
          </div>

          <Separator className="bg-gray-100 dark:bg-gray-700" />

          <div>
            <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3 uppercase tracking-wider">KYC Verification Data</h4>
            <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">KYC Phone Number</label>
                <p className="text-gray-900 dark:text-white font-medium">{user.kyc_phone_number || 'Not provided'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Submission Date</label>
                <p className="text-gray-900 dark:text-white font-medium">
                  {user.kyc_submitted_at ? new Date(user.kyc_submitted_at).toLocaleDateString() : 'N/A'}
                </p>
              </div>
              <div className="col-span-2 pt-2">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">Proof of Address Document</label>
                {user.kyc_address_proof_url ? (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full border-fintech-blue text-fintech-blue hover:bg-fintech-blue/5"
                    onClick={() => window.open(user.kyc_address_proof_url, '_blank')}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    View Proof of Address
                  </Button>
                ) : (
                  <p className="text-sm text-gray-400 italic">No document uploaded</p>
                )}
              </div>
            </div>
          </div>

          <Separator className="bg-gray-100 dark:bg-gray-700" />


          <div className="flex flex-wrap gap-3">
            {!user.is_kyc_verified ? (
              <>
                <Button
                  onClick={() => onKycAction(user.id, 'approve')}
                  disabled={processingAction}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <UserCheck className="w-4 h-4 mr-2" />
                  {processingAction ? 'Processing...' : 'Approve KYC'}
                </Button>
                <Button
                  onClick={() => onKycAction(user.id, 'reject')}
                  disabled={processingAction}
                  variant="destructive"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  {processingAction ? 'Processing...' : 'Reject KYC'}
                </Button>
              </>
            ) : (
              <Button
                onClick={() => onKycAction(user.id, 'revoke')}
                disabled={processingAction}
                variant="outline"
                className="border-orange-300 text-orange-600"
              >
                <ShieldX className="w-4 h-4 mr-2" />
                {processingAction ? 'Processing...' : 'Revoke KYC'}
              </Button>
            )}

            {user.account_status === 'active' ? (
              <Button
                onClick={() => onAccountAction(user.id, 'suspend')}
                disabled={processingAction}
                variant="outline"
                className="border-red-300 text-red-600"
              >
                <UserX className="w-4 h-4 mr-2" />
                {processingAction ? 'Processing...' : 'Suspend Account'}
              </Button>
            ) : (
              <Button
                onClick={() => onAccountAction(user.id, 'activate')}
                disabled={processingAction}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {processingAction ? 'Processing...' : 'Activate Account'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserDetailModal;
