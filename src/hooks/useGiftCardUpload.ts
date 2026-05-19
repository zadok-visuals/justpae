
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useChat } from '@/hooks/useChat';
import { useNavigate } from 'react-router-dom';

export const useGiftCardUpload = (onSubmitSuccess?: () => void) => {
  const [selectedCardType, setSelectedCardType] = useState('');
  const [cardValue, setCardValue] = useState('');
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const { sendMessage } = useChat();
  const navigate = useNavigate();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid File Type",
          description: "Please select an image file.",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please select an image smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }

      setUploadedImage(file);
    }
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Create a unique filename with timestamp
      const timestamp = Date.now();
      const fileExt = file?.name?.split('.')?.pop() || 'png';
      const fileName = `${user.id}/${timestamp}.${fileExt}`;

      console.log('Uploading file to gift-card-images bucket:', fileName);

      const { data, error } = await supabase.storage
        .from('gift-card-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Storage upload error:', error);
        throw error;
      }

      console.log('Upload successful:', data);

      // Get the public URL for the uploaded file
      const { data: urlData } = supabase.storage
        .from('gift-card-images')
        .getPublicUrl(fileName);

      console.log('Public URL generated:', urlData.publicUrl);
      
      // Verify the URL is accessible
      try {
        const response = await fetch(urlData.publicUrl, { method: 'HEAD' });
        if (!response.ok) {
          console.warn('Image URL may not be accessible:', response.status);
        }
      } catch (e) {
        console.warn('Could not verify image URL accessibility:', e);
      }

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to submit a gift card.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedCardType || !cardValue || !uploadedImage) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields and select an image.",
        variant: "destructive",
      });
      return;
    }

    if (parseFloat(cardValue) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid gift card value.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Upload the image first
      const imageUrl = await uploadImage(uploadedImage);
      
      if (!imageUrl) {
        throw new Error('Failed to upload image');
      }

      console.log('Image uploaded successfully, creating transaction with URL:', imageUrl);

      // Create the gift card transaction record
      const { data, error } = await supabase
        .from('gift_card_transactions')
        .insert({
          user_id: user.id,
          card_type: selectedCardType,
          card_value: parseFloat(cardValue),
          image_url: imageUrl,
          status: 'pending'
        })
        .select()
        .single();

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log('Gift card transaction created:', data);

      // Send chat message to admin
      const message = `🚨 NEW GIFT CARD SALE\nType: ${selectedCardType}\nValue: $${cardValue}\nImage Link: ${imageUrl}`;
      await sendMessage(message);

      toast({
        title: "Success!",
        description: "Redirecting to chat to complete the process...",
      });

      // Reset form
      setSelectedCardType('');
      setCardValue('');
      setUploadedImage(null);
      const fileInput = document.getElementById('gift-card-image') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      // Call success callback
      if (onSubmitSuccess) {
        onSubmitSuccess();
      }

      // Redirect to chat
      navigate('/chat');

    } catch (error) {
      console.error('Error submitting gift card:', error);
      toast({
        title: "Submission Failed",
        description: error instanceof Error ? error.message : "Failed to submit gift card. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return {
    selectedCardType,
    setSelectedCardType,
    cardValue,
    setCardValue,
    uploadedImage,
    setUploadedImage,
    isUploading,
    handleFileSelect,
    handleSubmit
  };
};
