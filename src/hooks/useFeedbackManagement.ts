
import { useEffect } from 'react';
import { useFeedbackData } from './useFeedbackData';
import { useFeedbackDeletion } from './useFeedbackDeletion';

export const useFeedbackManagement = () => {
  const {
    feedbacks,
    loading,
    setFeedbacks,
    fetchFeedbacks
  } = useFeedbackData();

  const { deleteFeedback } = useFeedbackDeletion({ setFeedbacks });

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  return {
    feedbacks,
    loading,
    deleteFeedback,
    fetchFeedbacks
  };
};
