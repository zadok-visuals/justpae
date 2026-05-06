
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const SaleInstructions: React.FC = () => {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-gray-900 dark:text-white">How it works</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start space-x-3">
          <div className="w-6 h-6 bg-fintech-orange text-white rounded-full flex items-center justify-center text-sm font-bold">1</div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white">Select & Calculate</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">Choose your crypto and enter the amount you want to sell</p>
          </div>
        </div>
        <div className="flex items-start space-x-3">
          <div className="w-6 h-6 bg-fintech-orange text-white rounded-full flex items-center justify-center text-sm font-bold">2</div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white">Send Crypto</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">Transfer your crypto to the provided address</p>
          </div>
        </div>
        <div className="flex items-start space-x-3">
          <div className="w-6 h-6 bg-fintech-orange text-white rounded-full flex items-center justify-center text-sm font-bold">3</div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white">Receive Naira</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">Get Naira in your wallet after blockchain confirmation (usually 10-30 minutes)</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SaleInstructions;
