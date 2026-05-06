
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFeedbackManagement } from '@/hooks/useFeedbackManagement';
import FeedbackHeader from './feedback/FeedbackHeader';
import FeedbackList from './feedback/FeedbackList';

const FeedbackManagement: React.FC = () => {
  const { feedbacks, loading, deleteFeedback } = useFeedbackManagement();

  if (loading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="flex justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fintech-orange"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <FeedbackHeader />
      <CardContent>
        <FeedbackList feedbacks={feedbacks} onDelete={deleteFeedback} />
      </CardContent>
    </Card>
  );
};

export default FeedbackManagement;
