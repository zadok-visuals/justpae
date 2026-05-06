
import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, User, Mail, Calendar } from 'lucide-react';
import FeedbackDeleteDialog from './FeedbackDeleteDialog';

interface Feedback {
  id: string;
  category: string;
  message: string;
  created_at: string;
  user_id: string | null;
  user_email?: string;
  user_name?: string;
}

interface FeedbackItemProps {
  feedback: Feedback;
  onDelete: (feedbackId: string) => void;
}

const FeedbackItem: React.FC<FeedbackItemProps> = ({ feedback, onDelete }) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'bug':
        return 'bg-red-100 text-red-800';
      case 'feature':
        return 'bg-blue-100 text-blue-800';
      case 'improvement':
        return 'bg-green-100 text-green-800';
      case 'ui':
        return 'bg-purple-100 text-purple-800';
      case 'performance':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleDelete = () => {
    onDelete(feedback.id);
    setShowDeleteDialog(false);
  };

  return (
    <>
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-4">
          <div className="flex justify-between items-start mb-3">
            <Badge className={`${getCategoryColor(feedback.category)} border-0`}>
              {feedback.category}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          <p className="text-gray-900 dark:text-white mb-4 leading-relaxed">
            {feedback.message}
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm text-gray-500 dark:text-gray-400 space-y-2 sm:space-y-0">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1">
                <User className="w-3 h-3" />
                <span>{feedback.user_name || 'Anonymous'}</span>
              </div>
              {feedback.user_email && (
                <div className="flex items-center space-x-1">
                  <Mail className="w-3 h-3" />
                  <span>{feedback.user_email}</span>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-1">
              <Calendar className="w-3 h-3" />
              <span>{new Date(feedback.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <FeedbackDeleteDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        feedbackId={feedback.id}
      />
    </>
  );
};

export default FeedbackItem;
