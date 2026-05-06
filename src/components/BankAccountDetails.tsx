
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BankAccountDetailsProps {
  amount: string;
  paymentMethod: string;
}

const BankAccountDetails: React.FC<BankAccountDetailsProps> = ({ amount, paymentMethod }) => {
  const { toast } = useToast();

  
  // Virtual bank account details for user
  const bankAccount = {
    bankName: "AmazingPay Bank",
    accountNumber: "2109876543",
    accountName: "AmazingPay Wallet",
    sortCode: "058",
    reference: `AP${Date.now().toString().slice(-6)}`
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  const getPaymentInstructions = () => {
    if (paymentMethod === 'ussd') {
      return {
        title: "USSD Payment Instructions",
        steps: [
          `Dial *058*${bankAccount.accountNumber}*${amount}# on your phone`,
          "Follow the prompts to complete the transfer",
          "Enter your bank PIN when prompted",
          "Your wallet will be credited within 2-5 minutes"
        ]
      };
    }
    
    return {
      title: "Bank Transfer Instructions",
      steps: [
        "Use the account details below to make a transfer",
        "Include the reference number in your transfer description",
        "Your wallet will be credited within 5-15 minutes",
        "Keep your transfer receipt for reference"
      ]
    };
  };

  const instructions = getPaymentInstructions();

  return (
    <Card className="rounded-2xl shadow-sm border-2 border-fintech-orange/20">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 text-fintech-orange">
          <Building className="w-5 h-5" />
          <span>{instructions.title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-green-50 dark:bg-green-950/30 p-4 rounded-lg space-y-3 border border-green-200 dark:border-green-800">
          <h3 className="font-semibold text-green-800 dark:text-green-200 mb-3">Transfer Details</h3>
          
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Bank Name:</span>
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-gray-900 dark:text-white">{bankAccount.bankName}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(bankAccount.bankName, "Bank name")}
                className="p-1 h-6 w-6 text-fintech-orange hover:text-fintech-orange/80"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Account Number:</span>
            <div className="flex items-center space-x-2">
              <span className="font-semibold font-mono text-gray-900 dark:text-white">{bankAccount.accountNumber}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(bankAccount.accountNumber, "Account number")}
                className="p-1 h-6 w-6 text-fintech-orange hover:text-fintech-orange/80"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Account Name:</span>
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-gray-900 dark:text-white">{bankAccount.accountName}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(bankAccount.accountName, "Account name")}
                className="p-1 h-6 w-6 text-fintech-orange hover:text-fintech-orange/80"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Amount:</span>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-green-600 dark:text-green-400 text-lg">₦{parseFloat(amount || '0').toLocaleString()}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(amount, "Amount")}
                className="p-1 h-6 w-6 text-fintech-orange hover:text-fintech-orange/80"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Reference:</span>
            <div className="flex items-center space-x-2">
              <span className="font-semibold font-mono text-gray-900 dark:text-white">{bankAccount.reference}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(bankAccount.reference, "Reference")}
                className="p-1 h-6 w-6 text-fintech-orange hover:text-fintech-orange/80"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-semibold text-fintech-orange">Instructions:</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
            {instructions.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </div>

        <div className="bg-orange-50 dark:bg-orange-950/30 p-3 rounded-lg border border-orange-200 dark:border-orange-800">
          <p className="text-sm text-orange-800 dark:text-orange-200">
            <strong>Important:</strong> Make sure to include the reference number when making your transfer. 
            This helps us identify your payment and credit your wallet automatically.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default BankAccountDetails;
