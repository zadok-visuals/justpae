
import React from 'react';
import { MessageSquare } from 'lucide-react';
import FeedbackItem from './FeedbackItem';

interface Feedback {
  id: string;
  category: string;
  message: string;
  created_at: string;
  user_id: string | null;
  user_email?: string;
  user_name?: string;
}

interface FeedbackListProps {
  feedbacks: Feedback[];
  onDelete: (feedbackId: string) => void;
}

const FeedbackList: React.FC<FeedbackListProps> = ({ feedbacks, onDelete }) => {
  if (feedbacks.length === 0) {
    return (
      <div className="text-center py-8">
        <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500">No feedback received yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {feedbacks.map((feedback) => (
        <FeedbackItem
          key={feedback.id}
          feedback={feedback}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};

export default FeedbackList;
