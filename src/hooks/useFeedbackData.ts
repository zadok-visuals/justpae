
import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { feedbackService } from '@/services/feedbackService';
import { Feedback } from '@/types/feedback';

export const useFeedbackData = () => {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchFeedbacks = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      console.log('Fetching feedback for admin user:', user.id);
      
      // Verify admin status first
      const isAdmin = await feedbackService.verifyAdminStatus(user.id);
      
      if (!isAdmin) {
        console.log('User is not an admin');
        toast({
          title: "Access Denied",
          description: "You don't have permission to view feedback.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      console.log('User verified as admin, fetching feedback...');

      // Fetch feedback data
      const feedbackData = await feedbackService.fetchFeedbackData();

      // Get user profiles for those who have user_id
      const userIds = feedbackData
        .filter(feedback => feedback.user_id)
        .map(feedback => feedback.user_id);

      const profilesData = await feedbackService.fetchUserProfiles(userIds);

      // Combine feedback with profile data
      const enrichedFeedback = feedbackService.enrichFeedbackWithProfiles(feedbackData, profilesData);

      console.log('Feedback fetched successfully:', enrichedFeedback.length);
      setFeedbacks(enrichedFeedback);
    } catch (error: any) {
      console.error('Error in fetchFeedbacks:', error);
      toast({
        title: "Error",
        description: error.message || "An unexpected error occurred while fetching feedback.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  return {
    feedbacks,
    loading,
    setFeedbacks,
    fetchFeedbacks
  };
};
