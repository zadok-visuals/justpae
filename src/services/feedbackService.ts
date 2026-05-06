
import { supabase } from '@/integrations/supabase/client';
import { Feedback } from '@/types/feedback';

export const feedbackService = {
  async verifyAdminStatus(userId: string): Promise<boolean> {
    const { data: isAdminData, error: adminError } = await supabase
      .rpc('is_admin_safe', { user_uuid: userId });
    
    if (adminError) {
      console.error('Error checking admin status:', adminError);
      throw new Error(`Admin verification failed: ${adminError.message}`);
    }

    return isAdminData || false;
  },

  async fetchFeedbackData(): Promise<any[]> {
    const { data: feedbackData, error: feedbackError } = await supabase
      .from('user_feedback')
      .select('*')
      .order('created_at', { ascending: false });

    if (feedbackError) {
      console.error('Error fetching feedback:', feedbackError);
      throw new Error(`Failed to fetch feedback: ${feedbackError.message}`);
    }

    return feedbackData || [];
  },

  async fetchUserProfiles(userIds: string[]): Promise<any[]> {
    if (userIds.length === 0) return [];

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, name, email')
      .in('id', userIds);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return [];
    }

    return profiles || [];
  },

  enrichFeedbackWithProfiles(feedbackData: any[], profilesData: any[]): Feedback[] {
    return feedbackData.map(feedback => {
      const profile = profilesData.find(p => p.id === feedback.user_id);
      return {
        ...feedback,
        user_email: profile?.email || 'Anonymous',
        user_name: profile?.name || 'Anonymous User'
      };
    });
  },

  async deleteFeedbackPermanently(feedbackId: string, adminUserId: string): Promise<boolean> {
    const { data: deleteResult, error: deleteError } = await supabase
      .rpc('delete_feedback_permanently', {
        feedback_id: feedbackId,
        admin_user_id: adminUserId
      });

    if (deleteError) {
      console.error('Database function error:', deleteError);
      throw new Error(`Database deletion failed: ${deleteError.message}`);
    }

    if (!deleteResult) {
      throw new Error('Deletion function returned false');
    }

    return true;
  }
};
