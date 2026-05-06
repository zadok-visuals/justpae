
import React from 'react';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';

const FeedbackHeader: React.FC = () => {
  return (
    <CardHeader>
      <div className="flex items-center space-x-3">
        <MessageSquare className="w-6 h-6 text-fintech-orange" />
        <CardTitle className="text-xl text-gray-900 dark:text-white">User Feedback</CardTitle>
      </div>
    </CardHeader>
  );
};

export default FeedbackHeader;
