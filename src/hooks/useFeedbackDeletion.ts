
import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { feedbackService } from '@/services/feedbackService';
import { Feedback } from '@/types/feedback';

interface UseFeedbackDeletionProps {
  setFeedbacks: React.Dispatch<React.SetStateAction<Feedback[]>>;
}

export const useFeedbackDeletion = ({ setFeedbacks }: UseFeedbackDeletionProps) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const deleteFeedback = useCallback(async (feedbackId: string) => {
    try {
      console.log('Starting feedback deletion process for ID:', feedbackId);
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      console.log('Using database function for permanent deletion...');

      await feedbackService.deleteFeedbackPermanently(feedbackId, user.id);

      console.log('Feedback successfully deleted using database function');

      // Update local state to remove deleted feedback
      setFeedbacks(prevFeedbacks => {
        const filtered = prevFeedbacks.filter(f => f.id !== feedbackId);
        console.log(`Local state updated: ${prevFeedbacks.length} -> ${filtered.length} feedback items`);
        return filtered;
      });

      toast({
        title: "Success",
        description: "Feedback permanently deleted from database.",
      });

    } catch (error: any) {
      console.error('Error deleting feedback:', error);
      let description = error.message || "An unexpected error occurred while deleting feedback.";
      if (error.message && error.message.includes('admin_actions_admin_user_id_fkey')) {
        description = "Deletion failed. You may not have the required admin permissions to perform this action.";
      }
      toast({
        title: "Error",
        description: description,
        variant: "destructive",
      });
    }
  }, [user, setFeedbacks, toast]);

  return { deleteFeedback };
};
