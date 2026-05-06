import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  MessageCircle, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Send,
  Image,
  Mic,
  User,
  Users
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface ChatConversation {
  id: string;
  user_id: string;
  title: string;
  status: string;
  last_message_at: string;
  created_at: string;
  user_name?: string;
  unread_count?: number;
}

interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: string;
  message_type: string;
  content?: string;
  file_url?: string;
  file_name?: string;
  created_at: string;
  is_read: boolean;
}

export const AdminChatManagement: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    pending: 0,
    closed: 0
  });

  // Fetch conversations
  const fetchConversations = async () => {
    try {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('*')
        .order('last_message_at', { ascending: false });

      if (error) throw error;

      const conversationsWithUserNames = data?.map(conv => ({
        ...conv,
        user_name: 'User'
      })) || [];

      setConversations(conversationsWithUserNames);

      // Calculate stats
      const total = conversationsWithUserNames.length;
      const open = conversationsWithUserNames.filter(c => c.status === 'open').length;
      const pending = conversationsWithUserNames.filter(c => c.status === 'pending').length;
      const closed = conversationsWithUserNames.filter(c => c.status === 'closed').length;

      setStats({ total, open, pending, closed });
    } catch (error) {
      console.error('Error fetching conversations:', error);
    }
  };

  // Fetch messages for a conversation
  const fetchMessages = async (conversationId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);

      // Mark messages as read
      await supabase
        .from('chat_messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .neq('sender_id', user?.id);

    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  // Send admin reply
  const sendAdminReply = async () => {
    if (!messageText.trim() || !selectedConversation || !user) return;

    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: selectedConversation.id,
          sender_id: user.id,
          sender_type: 'admin',
          message_type: 'text',
          content: messageText.trim()
        });

      if (error) throw error;

      // Update conversation status and last message time
      await supabase
        .from('chat_conversations')
        .update({ 
          status: 'open',
          last_message_at: new Date().toISOString() 
        })
        .eq('id', selectedConversation.id);

      setMessageText('');
      await fetchMessages(selectedConversation.id);
      await fetchConversations();

    } catch (error) {
      console.error('Error sending reply:', error);
      toast({
        title: "Error",
        description: "Failed to send reply",
        variant: "destructive",
      });
    }
  };

  // Update conversation status
  const updateConversationStatus = async (conversationId: string, status: string) => {
    try {
      const { error } = await supabase
        .from('chat_conversations')
        .update({ status })
        .eq('id', conversationId);

      if (error) throw error;

      await fetchConversations();
      
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(prev => prev ? { ...prev, status } : null);
      }

      toast({
        title: "Status updated",
        description: `Conversation marked as ${status}`,
      });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  // Real-time subscriptions
  useEffect(() => {
    fetchConversations();

    const messagesChannel = supabase
      .channel('admin_chat_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages'
        },
        () => {
          fetchConversations();
          if (selectedConversation) {
            fetchMessages(selectedConversation.id);
          }
        }
      )
      .subscribe();

    const conversationsChannel = supabase
      .channel('admin_chat_conversations')
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
  }, [selectedConversation]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertCircle className="w-4 h-4 text-green-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'closed':
        return <CheckCircle className="w-4 h-4 text-gray-500" />;
      default:
        return <MessageCircle className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const renderMessage = (message: ChatMessage) => {
    const isAdmin = message.sender_type === 'admin';
    const messageTime = formatDistanceToNow(new Date(message.created_at), { addSuffix: true });

    return (
      <div
        key={message.id}
        className={`flex flex-col gap-1 ${isAdmin ? 'items-end' : 'items-start'}`}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{isAdmin ? 'Admin' : 'User'}</span>
          <span>•</span>
          <span>{messageTime}</span>
        </div>
        
        <div
          className={`max-w-[80%] p-3 rounded-lg ${
            isAdmin
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted'
          }`}
        >
          {message.message_type === 'text' && (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          )}
          
          {message.message_type === 'image' && (
            <div className="space-y-2">
              <img
                src={message.file_url || ''}
                alt="Shared image"
                className="max-w-full h-auto rounded-md"
                loading="lazy"
              />
              {message.file_name && (
                <p className="text-xs opacity-75">{message.file_name}</p>
              )}
            </div>
          )}
          
          {message.message_type === 'voice' && (
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4" />
              <span className="text-sm">Voice message</span>
              <audio
                controls
                src={message.file_url || ''}
                className="max-w-full"
              >
                Your browser does not support audio playback.
              </audio>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Conversations</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats.open}</p>
                <p className="text-sm text-muted-foreground">Open</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{stats.pending}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-gray-500" />
              <div>
                <p className="text-2xl font-bold">{stats.closed}</p>
                <p className="text-sm text-muted-foreground">Closed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chat Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
        {/* Conversations List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Conversations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              <div className="space-y-2 p-4">
                {conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedConversation?.id === conversation.id
                        ? 'bg-primary/10 border-primary'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => {
                      setSelectedConversation(conversation);
                      fetchMessages(conversation.id);
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{conversation.user_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(conversation.status)}
                        <Badge
                          variant="secondary"
                          className={`text-xs ${getStatusColor(conversation.status)}`}
                        >
                          {conversation.status}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {conversation.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Chat Messages */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {selectedConversation ? selectedConversation.user_name : 'Select a conversation'}
              </CardTitle>
              {selectedConversation && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateConversationStatus(selectedConversation.id, 'pending')}
                  >
                    Mark Pending
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateConversationStatus(selectedConversation.id, 'closed')}
                  >
                    Close
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col h-[500px] p-0">
            {selectedConversation ? (
              <>
                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                  {loading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-sm text-muted-foreground">Loading messages...</div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {messages.map(renderMessage)}
                    </div>
                  )}
                </ScrollArea>

                <Separator />

                {/* Reply Input */}
                <div className="p-4">
                  <div className="flex gap-2">
                    <Input
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      placeholder="Type your reply..."
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendAdminReply();
                        }
                      }}
                    />
                    <Button
                      onClick={sendAdminReply}
                      disabled={!messageText.trim()}
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-2">
                  <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground">Select a conversation to start chatting</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};