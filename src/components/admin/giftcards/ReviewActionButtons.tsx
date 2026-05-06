
import React from 'react';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';

interface ReviewActionButtonsProps {
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
  processingAction: boolean;
}

const ReviewActionButtons: React.FC<ReviewActionButtonsProps> = ({
  onApprove,
  onReject,
  onCancel,
  processingAction
}) => {
  return (
    <div className="flex space-x-3">
      <Button
        onClick={onApprove}
        disabled={processingAction}
        className="bg-green-600 hover:bg-green-700 text-white"
      >
        <Check className="w-4 h-4 mr-2" />
        {processingAction ? 'Processing...' : 'Approve'}
      </Button>
      <Button
        onClick={onReject}
        disabled={processingAction}
        variant="destructive"
      >
        <X className="w-4 h-4 mr-2" />
        {processingAction ? 'Processing...' : 'Reject'}
      </Button>
      <Button
        onClick={onCancel}
        variant="outline"
        disabled={processingAction}
      >
        Cancel
      </Button>
    </div>
  );
};

export default ReviewActionButtons;
