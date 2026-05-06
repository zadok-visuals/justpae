
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { MessageSquare, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface FeedbackFormProps {
  onClose?: () => void;
  isModal?: boolean;
}

const FeedbackForm: React.FC<FeedbackFormProps> = ({ onClose, isModal = false }) => {
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || !category) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Use type assertion to work around TypeScript issue until types are regenerated
      const { error } = await (supabase as any)
        .from('user_feedback')
        .insert({
          user_id: user?.id,
          category,
          message: message.trim(),
          created_at: new Date().toISOString()
        });

      if (error) throw error;

      toast({
        title: "Thank you!",
        description: "Your feedback has been submitted successfully"
      });

      setMessage('');
      setCategory('');
      
      if (onClose) {
        onClose();
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const content = (
    <Card className={`${isModal ? 'w-full max-w-sm' : 'rounded-2xl'} shadow-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-gray-900 dark:text-white text-lg">
          <div className="flex items-center space-x-2">
            <MessageSquare className="w-4 h-4 text-fintech-orange" />
            <span>Send Feedback</span>
          </div>
          {isModal && onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="p-1 h-auto"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-gray-900 dark:text-white text-sm">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 h-9">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">Bug Report</SelectItem>
                <SelectItem value="feature">Feature Request</SelectItem>
                <SelectItem value="improvement">Improvement</SelectItem>
                <SelectItem value="ui">User Interface</SelectItem>
                <SelectItem value="performance">Performance</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-gray-900 dark:text-white text-sm">Your Feedback</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Share your feedback or report issues..."
              rows={4}
              className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white resize-none text-sm"
              maxLength={500}
            />
            <p className="text-xs text-gray-500">{message.length}/500 characters</p>
          </div>

          <Button
            type="submit"
            disabled={!message.trim() || !category || isSubmitting}
            className="w-full bg-fintech-orange hover:bg-fintech-orange/90 h-9"
          >
            {isSubmitting ? 'Sending...' : 'Send Feedback'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        {content}
      </div>
    );
  }

  return content;
};

export default FeedbackForm;
