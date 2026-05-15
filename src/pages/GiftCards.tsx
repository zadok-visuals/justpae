
import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { GiftCardTransaction } from '@/components/gift-cards/types';
import GiftCardUploadForm from '@/components/gift-cards/GiftCardUploadForm';
import GiftCardTypesGrid from '@/components/gift-cards/GiftCardTypesGrid';
import GiftCardHistory from '@/components/gift-cards/GiftCardHistory';
import { useToast } from '@/hooks/use-toast';

const GiftCards = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [userTransactions, setUserTransactions] = useState<GiftCardTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedCardType, setSelectedCardType] = useState('');

  // Fetch user's gift card transaction history
  const fetchUserTransactions = async () => {
    if (!user) return;

    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('gift_card_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching user transactions:', error);
        toast({
          title: "Error",
          description: "Failed to fetch transaction history.",
          variant: "destructive",
        });
      } else {
        setUserTransactions(data || []);
      }
    } catch (error) {
      console.error('Error fetching user transactions:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchUserTransactions();
    }
  }, [user]);

  const handleSubmitSuccess = () => {
    fetchUserTransactions();
  };

  const handleCardTypeSelect = (cardType: string) => {
    setSelectedCardType(cardType);
  };

  return (

    <div className="w-full bg-gray-50 dark:bg-gray-900 flex flex-col relative">
      <div className="space-y-6">
        {/* Sticky Header Section */}
        <div className="sticky top-0 z-30 bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-md -mx-4 px-4 sm:-mx-6 sm:px-6 pt-2 pb-2 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center space-x-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="p-2 text-gray-600 dark:text-gray-300">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Sell Gift Cards</h1>
          </div>
        </div>

          {/* Upload Form */}
          <div id="gift-card-upload-form">
            <GiftCardUploadForm 
              onSubmitSuccess={handleSubmitSuccess} 
              preSelectedCardType={selectedCardType}
            />
          </div>

          {/* Gift Card Types Grid */}
          <GiftCardTypesGrid onCardTypeSelect={handleCardTypeSelect} />

          {/* Transaction History */}
          <GiftCardHistory 
            transactions={userTransactions}
            loading={loadingHistory}
          />
        </div>
      </div>

  );
};

export default GiftCards;
