
import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

interface ProcessingModalProps {
  isOpen: boolean;
  message?: string;
}

const ProcessingModal: React.FC<ProcessingModalProps> = ({
  isOpen,
  message = "Processing..."
}) => {
  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-md">
        <div className="flex flex-col items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-fintech-orange mb-4" />
          <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {message}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Please wait while we process your request...
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProcessingModal;
