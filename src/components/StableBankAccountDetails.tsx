
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Building } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

import { supabase } from '@/integrations/supabase/client';

interface StableBankAccountDetailsProps {
  amount: string;
  paymentMethod: string;
}

const StableBankAccountDetails: React.FC<StableBankAccountDetailsProps> = ({
  amount,
  paymentMethod
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [referenceNumber, setReferenceNumber] = useState<string>('');

  // Generate stable reference number based on user ID and current date
  useEffect(() => {
    if (user) {
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const userIdLast4 = user.id.slice(-4);
      const stableRef = `AP${today}${userIdLast4}`;
      setReferenceNumber(stableRef);
    }
  }, [user]);

  const [bankDetails, setBankDetails] = useState({
    accountName: "Loading...",
    accountNumber: "Loading...",
    bankName: "Loading...",
    sortCode: ""
  });
  const [loading, setLoading] = useState(true);

  // Fetch corporate bank details from system settings database
  useEffect(() => {
    const fetchCorporateDetails = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('setting_key, setting_value')
          .in('setting_key', ['corporate_bank_name', 'corporate_account_number', 'corporate_account_name']);

        if (error) throw error;

        const settingsMap = (data || []).reduce((acc, curr) => {
          acc[curr.setting_key] = curr.setting_value;
          return acc;
        }, {} as Record<string, string>);

        setBankDetails({
          accountName: settingsMap.corporate_account_name || "justpae Limited",
          accountNumber: settingsMap.corporate_account_number || "2109876543",
          bankName: settingsMap.corporate_bank_name || "justpae Bank",
          sortCode: ""
        });
      } catch (error) {
        console.error('Failed to fetch corporate bank details:', error);
        setBankDetails({
          accountName: "justpae Limited",
          accountNumber: "2109876543",
          bankName: "justpae Bank",
          sortCode: ""
        });
      } finally {
        setLoading(false);
      }
    };

    fetchCorporateDetails();
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`,
    });
  };

  const copyAccountDetails = () => {
    const details = `Bank: ${bankDetails.bankName}
Account Name: ${bankDetails.accountName}
Account Number: ${bankDetails.accountNumber}
Amount: ₦${parseFloat(amount).toLocaleString()}
Reference: ${referenceNumber}`;

    navigator.clipboard.writeText(details);
    toast({
      title: "Copied",
      description: "All account details copied to clipboard",
    });
  };

  return (
    <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 text-gray-900 dark:text-white">
          <Building className="w-5 h-5 text-fintech-orange" />
          <span>Bank Transfer Details</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-fintech-orange/5 p-4 rounded-lg border border-fintech-orange/20">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Bank Name:</span>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-gray-900 dark:text-white">{bankDetails.bankName}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(bankDetails.bankName, 'Bank name')}
                  className="p-1"
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Account Name:</span>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-gray-900 dark:text-white">{bankDetails.accountName}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(bankDetails.accountName, 'Account name')}
                  className="p-1"
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Account Number:</span>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-gray-900 dark:text-white font-mono">{bankDetails.accountNumber}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(bankDetails.accountNumber, 'Account number')}
                  className="p-1"
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Amount:</span>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg text-fintech-orange">₦{parseFloat(amount).toLocaleString()}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(amount, 'Amount')}
                  className="p-1"
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Reference:</span>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-gray-900 dark:text-white font-mono">{referenceNumber}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(referenceNumber, 'Reference number')}
                  className="p-1"
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Button
          onClick={copyAccountDetails}
          variant="outline"
          className="w-full border-fintech-orange text-fintech-orange hover:bg-fintech-orange hover:text-white"
        >
          <Copy className="w-4 h-4 mr-2" />
          Copy All Details
        </Button>

        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Important Instructions:</h4>
          <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
            <li>• Use the exact reference number: <strong>{referenceNumber}</strong></li>
            <li>• Transfer exactly ₦{parseFloat(amount).toLocaleString()}</li>
            <li>• Your wallet will be credited within 5-15 minutes</li>
            <li>• Contact support if transfer takes longer than expected</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default StableBankAccountDetails;
