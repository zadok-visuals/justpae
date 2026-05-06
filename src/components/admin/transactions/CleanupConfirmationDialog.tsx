
import React from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

interface CleanupConfirmationDialogProps {
  cleaningPending: boolean;
  onConfirm: () => void;
}

const CleanupConfirmationDialog: React.FC<CleanupConfirmationDialogProps> = ({
  cleaningPending,
  onConfirm
}) => {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          disabled={cleaningPending}
          variant="outline"
          className="border-red-200 text-red-600 bg-red-50"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          {cleaningPending ? 'Cleaning...' : 'Clean All Pending'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Cleanup</AlertDialogTitle>
          <AlertDialogDescription>
            This action will permanently delete all pending transactions. 
            This action cannot be undone. Are you sure you want to proceed?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700"
          >
            Delete All Pending
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CleanupConfirmationDialog;
