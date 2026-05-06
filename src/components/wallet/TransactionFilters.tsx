
import React from 'react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';

interface TransactionFiltersProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TransactionFilters: React.FC<TransactionFiltersProps> = ({
  activeTab,
  onTabChange
}) => {
  return (
    <TabsList className="grid w-full grid-cols-5 bg-gray-100 dark:bg-gray-800">
      <TabsTrigger value="all" className="text-xs text-gray-900 dark:text-white data-[state=active]:bg-fintech-orange data-[state=active]:text-white">All</TabsTrigger>
      <TabsTrigger value="deposits" className="text-xs text-gray-900 dark:text-white data-[state=active]:bg-fintech-orange data-[state=active]:text-white">Deposits</TabsTrigger>
      <TabsTrigger value="withdrawals" className="text-xs text-gray-900 dark:text-white data-[state=active]:bg-fintech-orange data-[state=active]:text-white">Withdrawals</TabsTrigger>
      <TabsTrigger value="crypto" className="text-xs text-gray-900 dark:text-white data-[state=active]:bg-fintech-orange data-[state=active]:text-white">Crypto</TabsTrigger>
      <TabsTrigger value="giftcards" className="text-xs text-gray-900 dark:text-white data-[state=active]:bg-fintech-orange data-[state=active]:text-white">Gift Cards</TabsTrigger>
    </TabsList>
  );
};

export default TransactionFilters;
