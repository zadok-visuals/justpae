
import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TransferReferenceDisplayProps {
  label: string;
  value: string;
  className?: string;
}

const TransferReferenceDisplay: React.FC<TransferReferenceDisplayProps> = ({
  label,
  value,
  className = ""
}) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const timeoutRef = useRef<NodeJS.Timeout>();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Reset copied state after 2 seconds
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 2000);

      toast({
        title: "Copied!",
        description: `${label} copied to clipboard`,
        duration: 2000,
      });
    } catch (error) {
      console.error('Failed to copy:', error);
      toast({
        title: "Copy failed",
        description: "Unable to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  return (
    <div className={`flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg ${className}`}>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</p>
        <p className="text-lg font-mono font-semibold text-gray-900 dark:text-white">{value}</p>
      </div>
      <Button
        onClick={handleCopy}
        variant="ghost"
        size="sm"
        className="ml-2 p-2"
        disabled={copied}
      >
        {copied ? (
          <Check className="w-4 h-4 text-green-500" />
        ) : (
          <Copy className="w-4 h-4 text-gray-500" />
        )}
      </Button>
    </div>
  );
};

export default TransferReferenceDisplay;
