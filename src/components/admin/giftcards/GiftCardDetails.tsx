
import React from 'react';
import { GiftCardTransaction } from './types';

interface GiftCardDetailsProps {
  transaction: GiftCardTransaction;
}

const GiftCardDetails: React.FC<GiftCardDetailsProps> = ({ transaction }) => {
  return (
    <div>
      <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Card Details</h4>
      <p className="text-sm text-gray-600 dark:text-gray-400">Type: {transaction.card_type}</p>
      <p className="text-sm text-gray-600 dark:text-gray-400">Value: ${transaction.card_value}</p>
      <p className="text-sm text-gray-600 dark:text-gray-400">User: {transaction.profiles?.name}</p>
      <p className="text-sm text-gray-600 dark:text-gray-400">Email: {transaction.profiles?.email}</p>
      <p className="text-sm text-gray-600 dark:text-gray-400">Status: {transaction.status}</p>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Submitted: {new Date(transaction.created_at).toLocaleDateString()} at{' '}
        {new Date(transaction.created_at).toLocaleTimeString()}
      </p>
    </div>
  );
};

export default GiftCardDetails;
