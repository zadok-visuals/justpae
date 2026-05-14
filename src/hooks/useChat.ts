import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: string;
  message_type: string;
  content?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  is_read: boolean;
  created_at: string;
  updated_at: string;
  sender_name?: string;
}

export interface ChatConversation {
  id: string;
  user_id: string;
  admin_id?: string | null;
  title: string;
  status: string;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  unread_count?: number;
}

export const useChat = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentConversation, setCurrentConversation] = useState<ChatConversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('*')
        .order('last_message_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    }
  }, [user]);

  // Fetch messages for a conversation
  const fetchMessages = useCallback(async (conversationId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('chat_messages')
        .select(`
          *,
          sender_profile:profiles!sender_id(full_name, name)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      const messagesWithSenderNames = data?.map((msg: any) => ({
        ...msg,
        sender_name: msg.sender_type === 'admin' 
          ? 'Support' 
          : (msg.sender_profile?.full_name || msg.sender_profile?.name || 'User')
      })) || [];

      setMessages(messagesWithSenderNames);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast({
        title: "Error",
        description: "Failed to load messages",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Create or get existing conversation
  const getOrCreateConversation = useCallback(async () => {
    if (!user) return null;

    try {
      // Check if user already has a conversation
      const { data: existingConversation } = await supabase
        .from('chat_conversations')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .maybeSingle();

      if (existingConversation) {
        setCurrentConversation(existingConversation);
        return existingConversation;
      }

      // Create new conversation
      const { data: newConversation, error } = await supabase
        .from('chat_conversations')
        .insert({
          user_id: user.id,
          title: `Support Chat - ${profile?.full_name || 'User'}`,
          status: 'open'
        })
        .select()
        .single();

      if (error) throw error;

      setCurrentConversation(newConversation);
      await fetchConversations();
      return newConversation;
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast({
        title: "Error",
        description: "Failed to start conversation",
        variant: "destructive",
      });
      return null;
    }
  }, [user, profile?.full_name, fetchConversations, toast]);

  // Send text message
  const sendMessage = useCallback(async (content: string, conversationId?: string) => {
    if (!user || !content.trim()) return;

    const conversation = conversationId 
      ? conversations.find(c => c.id === conversationId)
      : currentConversation || await getOrCreateConversation();

    if (!conversation) return;

    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: conversation.id,
          sender_id: user.id,
          sender_type: 'user',
          message_type: 'text',
          content: content.trim()
        });

      if (error) throw error;

      // Update conversation last message time
      await supabase
        .from('chat_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversation.id);

    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    }
  }, [user, conversations, currentConversation, getOrCreateConversation, toast]);

  // Upload and send file (image/voice)
  const sendFileMessage = useCallback(async (
    file: File, 
    messageType: 'image' | 'voice',
    conversationId?: string
  ) => {
    if (!user || !file) return;

    const conversation = conversationId 
      ? conversations.find(c => c.id === conversationId)
      : currentConversation || await getOrCreateConversation();

    if (!conversation) return;

    try {
      const bucketName = messageType === 'image' ? 'chat-images' : 'chat-voice';
      const fileName = `${user.id}/${Date.now()}-${file.name}`;

      // Upload file to public storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      // Get public URL (much faster than signed URLs)
      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(uploadData.path);

      // Insert message
      const { error: messageError } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: conversation.id,
          sender_id: user.id,
          sender_type: 'user',
          message_type: messageType,
          file_url: publicUrl,
          file_name: file.name,
          file_size: file.size
        });

      if (messageError) throw messageError;

      // Update conversation last message time
      await supabase
        .from('chat_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversation.id);

    } catch (error) {
      console.error('Error sending file:', error);
      toast({
        title: "Error",
        description: `Failed to send ${messageType}`,
        variant: "destructive",
      });
    }
  }, [user, conversations, currentConversation, getOrCreateConversation, toast]);

  // Mark messages as read
  const markMessagesAsRead = useCallback(async (conversationId: string) => {
    if (!user) return;

    try {
      await supabase
        .from('chat_messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .neq('sender_id', user.id);

      // Update notifications as read
      await supabase
        .from('chat_notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('conversation_id', conversationId);

    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }, [user]);

  // Real-time subscriptions
  useEffect(() => {
    if (!user) return;

    // Subscribe to new messages
    const messagesChannel = supabase
      .channel('chat_messages_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages'
        },
        (payload) => {
          const newMessage = payload.new as ChatMessage;
          
          // Add sender name
          const messageWithName = {
            ...newMessage,
            sender_name: newMessage.sender_type === 'admin' ? 'Support' : 'Client'
          };
          
          // If it's for current conversation, add to messages
          if (currentConversation && newMessage.conversation_id === currentConversation.id) {
            setMessages(prev => {
              // Avoid duplicates
              if (prev.some(m => m.id === newMessage.id)) return prev;
              return [...prev, messageWithName];
            });
            
            // Mark as read if user sent it
            if (newMessage.sender_id === user.id) {
              markMessagesAsRead(currentConversation.id);
            }
          }
          
          // Update conversations list
          fetchConversations();
          
          // Show notification for messages from others
          if (newMessage.sender_id !== user.id) {
            const messagePreview = newMessage.message_type === 'text' 
              ? newMessage.content || "New message"
              : newMessage.message_type === 'image'
              ? "📷 Image"
              : "🎤 Voice message";
            
            toast({
              title: "New Message from Support",
              description: messagePreview,
            });

            // Browser notification if supported
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('New Message from Support', {
                body: messagePreview,
                icon: '/favicon.ico'
              });
            }
          }
        }
      )
      .subscribe();

    // Subscribe to conversation changes
    const conversationsChannel = supabase
      .channel('chat_conversations_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_conversations'
        },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(conversationsChannel);
    };
  }, [user, currentConversation, fetchConversations, markMessagesAsRead, toast]);

  // Calculate unread count
  useEffect(() => {
    const calculateUnreadCount = async () => {
      if (!user) return;

      try {
        const { count } = await supabase
          .from('chat_notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false);

        setUnreadCount(count || 0);
      } catch (error) {
        console.error('Error calculating unread count:', error);
      }
    };

    calculateUnreadCount();
  }, [user, messages]);

  // Initial data fetch
  useEffect(() => {
    if (user) {
      fetchConversations();
    }
  }, [user, fetchConversations]);

  return {
    conversations,
    messages,
    currentConversation,
    loading,
    unreadCount,
    setCurrentConversation,
    getOrCreateConversation,
    sendMessage,
    sendFileMessage,
    fetchMessages,
    markMessagesAsRead
  };
};