import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  MessageCircle, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Send,
  Image,
  Mic,
  User,
  Users,
  ChevronLeft
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { VoiceRecorder } from '@/components/chat/VoiceRecorder';
import { AudioPlayer } from '@/components/chat/AudioPlayer';

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
  const [stats, setStats] = useState({ total: 0, open: 0, pending: 0, closed: 0 });
  const [isMobile, setIsMobile] = useState(false);

  const [isSending, setIsSending] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 1. Monitor screens size via dynamic listener to enforce absolute layout breaking points
  useEffect(() => {
    const checkViewportWidth = () => {
      setIsMobile(window.innerWidth < 1024); // Matches 'lg' Tailwind parameter
    };
    checkViewportWidth();
    window.addEventListener('resize', checkViewportWidth);
    return () => window.removeEventListener('resize', checkViewportWidth);
  }, []);

  const scrollToBottom = (behavior: 'smooth' | 'auto' = 'smooth') => {
    if (scrollContainerRef.current) {
      const scrollAreaElement = scrollContainerRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollAreaElement) {
        scrollAreaElement.scrollTo({
          top: scrollAreaElement.scrollHeight,
          behavior
        });
      }
    }
  };

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages]);

  const fetchConversations = async () => {
    try {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('*, profiles:user_id(name, full_name, email)')
        .order('last_message_at', { ascending: false });

      if (error) throw error;

      const conversationsWithUserNames = data?.map(conv => {
        const profile = conv.profiles as any;
        return {
          ...conv,
          user_name: profile?.full_name || profile?.name || 'Unknown User'
        };
      }) || [];

      setConversations(conversationsWithUserNames);

      const total = conversationsWithUserNames.length;
      const open = conversationsWithUserNames.filter(c => c.status === 'open').length;
      const pending = conversationsWithUserNames.filter(c => c.status === 'pending').length;
      const closed = conversationsWithUserNames.filter(c => c.status === 'closed').length;

      setStats({ total, open, pending, closed });
    } catch (error) {
      console.error('Error fetching conversations:', error);
    }
  };

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

      if (user?.id) {
        await supabase
          .from('chat_messages')
          .update({ is_read: true })
          .eq('conversation_id', conversationId)
          .neq('sender_id', user.id);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

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
      toast({ title: "Error", description: "Failed to send reply", variant: "destructive" });
    }
  };

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

      toast({ title: "Status updated", description: `Conversation marked as ${status}` });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const sendAdminMedia = async (file: File, messageType: 'image' | 'voice') => {
    if (!selectedConversation || !user || !file) return;

    setIsSending(true);
    try {
      const bucketName = messageType === 'image' ? 'chat-images' : 'chat-voice';
      const fileName = `admin/${user.id}/${Date.now()}-${file.name}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(uploadData.path);

      const { error: messageError } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: selectedConversation.id,
          sender_id: user.id,
          sender_type: 'admin',
          message_type: messageType,
          file_url: publicUrl,
          file_name: file.name
        });

      if (messageError) throw messageError;

      await supabase
        .from('chat_conversations')
        .update({ 
          status: 'open',
          last_message_at: new Date().toISOString() 
        })
        .eq('id', selectedConversation.id);

      await fetchMessages(selectedConversation.id);
      await fetchConversations();
    } catch (error) {
      console.error('Error sending media:', error);
      toast({ title: "Error", description: `Failed to send ${messageType}`, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    fetchConversations();

    const messagesChannel = supabase
      .channel('admin_chat_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => {
        fetchConversations();
        if (selectedConversation) fetchMessages(selectedConversation.id);
      })
      .subscribe();

    const conversationsChannel = supabase
      .channel('admin_chat_conversations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(conversationsChannel);
    };
  }, [selectedConversation]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <AlertCircle className="w-4 h-4 text-green-500" />;
      case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'closed': return <CheckCircle className="w-4 h-4 text-gray-500" />;
      default: return <MessageCircle className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400';
      case 'pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400';
      case 'closed': return 'bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-neutral-400';
      default: return 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400';
    }
  };

  const renderMessage = (message: ChatMessage) => {
    const isAdmin = message.sender_type === 'admin';
    const messageTime = formatDistanceToNow(new Date(message.created_at), { addSuffix: true });

    return (
      <div key={message.id} className={`flex flex-col gap-1 w-full ${isAdmin ? 'items-end' : 'items-start'}`}>
        <div className={`max-w-[85%] sm:max-w-[75%] shadow-sm transition-all ${
          message.message_type === 'voice' 
            ? 'bg-transparent shadow-none'
            : isAdmin
              ? 'bg-fintech-orange text-white rounded-2xl rounded-tr-none p-3'
              : 'bg-gray-100 dark:bg-neutral-800 text-gray-900 dark:text-white rounded-2xl rounded-tl-none p-3'
        }`}>
          {message.message_type === 'text' && (
            <p className="text-[14px] leading-relaxed break-words whitespace-pre-wrap">{message.content}</p>
          )}
          
          {message.message_type === 'image' && message.file_url && (
            <div className="relative rounded-lg overflow-hidden max-w-xs border border-black/5">
              <img 
                src={message.file_url} 
                alt="Shared attachment" 
                className="max-w-full h-auto object-cover cursor-pointer" 
                onClick={() => window.open(message.file_url || '', '_blank')} 
              />
            </div>
          )}

          {message.message_type === 'voice' && message.file_url && (
            <AudioPlayer 
              src={message.file_url} 
              timestamp={messageTime}
              isRead={message.is_read}
              isCurrentUser={isAdmin}
            />
          )}
        </div>

        {message.message_type !== 'voice' && (
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500 px-1 mt-0.5">
            <span>{isAdmin ? 'Admin' : 'User'}</span>
            <span>•</span>
            <span>{messageTime}</span>
          </div>
        )}
      </div>
    );
  };

  // Shared Sub-component: Conversation list structural builder
  const renderConversationsList = () => (
    <Card className="border-gray-100 dark:border-neutral-900 bg-white dark:bg-neutral-900 shadow-sm flex flex-col overflow-hidden h-full w-full">
      <CardHeader className="py-4 px-4 border-b border-gray-50 dark:border-neutral-850">
        <CardTitle className="text-sm font-bold tracking-wide uppercase text-gray-400">Conversations List</CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-3 space-y-2">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                  selectedConversation?.id === conversation.id
                    ? 'bg-orange-50/60 dark:bg-neutral-850 border-orange-500 shadow-sm'
                    : 'border-gray-50 dark:border-neutral-850 bg-white dark:bg-neutral-900 hover:bg-gray-50/60 dark:hover:bg-neutral-850'
                }`}
                onClick={() => {
                  setSelectedConversation(conversation);
                  fetchMessages(conversation.id);
                }}
                  >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="font-semibold text-xs truncate">{conversation.user_name}</span>
                  </div>
                  <Badge className={`text-[9px] px-1.5 py-0.5 rounded shadow-none font-bold uppercase tracking-wide border-transparent ${getStatusColor(conversation.status)}`}>
                    {conversation.status}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 dark:text-neutral-400 truncate pl-5 mb-1">
                  {conversation.title || "No Subject text payload"}
                </p>
                <div className="flex items-center gap-1 text-[10px] text-gray-400 pl-5">
                  {getStatusIcon(conversation.status)}
                  <span>{formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}</span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );

  // Shared Sub-component: Message feed area structural builder
  const renderChatArea = () => (
    <Card className="border-gray-100 dark:border-neutral-900 bg-white dark:bg-neutral-900 shadow-sm flex flex-col overflow-hidden h-full w-full">
      {selectedConversation ? (
        <>
          <CardHeader className="py-3 px-3 sm:px-4 border-b border-gray-50 dark:border-neutral-850 flex flex-row items-center justify-between shrink-0 gap-2">
            <div className="flex items-center min-w-0 gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setSelectedConversation(null)}
                className="lg:hidden rounded-full w-8 h-8 text-gray-500 shrink-0"
              >
                <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
              </Button>
              <div className="min-w-0">
                <CardTitle className="text-xs sm:text-sm font-bold truncate">{selectedConversation.user_name}</CardTitle>
                <p className="text-[9px] sm:text-[10px] text-gray-400 truncate">Active Workspace Thread</p>
              </div>
            </div>
            <div className="flex gap-1 sm:gap-1.5 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateConversationStatus(selectedConversation.id, 'pending')}
                className="h-7 text-[10px] sm:text-xs font-semibold px-2 rounded-lg border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-400"
              >
                Hold Case
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateConversationStatus(selectedConversation.id, 'closed')}
                className="h-7 text-[10px] sm:text-xs font-semibold px-2 rounded-lg border-gray-200 dark:border-neutral-800 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500"
              >
                Close
              </Button>
            </div>
          </CardHeader>

          <CardContent ref={scrollContainerRef} className="flex-1 overflow-hidden p-0 bg-gray-50/20 dark:bg-neutral-950/10">
            <ScrollArea className="h-full px-3 sm:px-4 py-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 mt-20">
                  <div className="w-5 h-5 border-2 border-fintech-orange border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">Loading logs...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map(renderMessage)}
                </div>
              )}
            </ScrollArea>
          </CardContent>

          <div className="shrink-0 p-3 bg-white dark:bg-neutral-900 border-t border-gray-50 dark:border-neutral-850">
            <div className="flex flex-col gap-2">
              <div className="flex items-end gap-2">
                <div className="flex items-center h-10">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-9 h-9 rounded-full text-gray-400 hover:text-fintech-orange hover:bg-gray-50 dark:hover:bg-neutral-850 transition-colors"
                  >
                    <Image className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setShowVoiceRecorder(!showVoiceRecorder)}
                    className={`w-9 h-9 rounded-full transition-colors ${
                      showVoiceRecorder 
                        ? "bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400" 
                        : "text-gray-400 hover:text-fintech-orange hover:bg-gray-50 dark:hover:bg-neutral-850"
                    }`}
                  >
                    <Mic className="w-4 h-4" />
                  </Button>
                </div>

                <div className="flex-1 relative flex items-center min-w-0">
                  <Input
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type reply..."
                    disabled={isSending}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        sendAdminReply();
                      }
                    }}
                    className="w-full h-10 pl-3 pr-12 rounded-xl bg-gray-50 border-none dark:bg-neutral-950 focus-visible:ring-2 focus-visible:ring-fintech-orange/10 transition-all text-xs"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2">
                    <Button
                      onClick={sendAdminReply}
                      disabled={!messageText.trim() || isSending}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                        messageText.trim() 
                          ? "bg-fintech-orange scale-100 opacity-100" 
                          : "bg-gray-200 dark:bg-neutral-800 scale-90 opacity-0 pointer-events-none"
                      }`}
                    >
                      <Send className="w-3.5 h-3.5 text-white" />
                    </Button>
                  </div>
                </div>
              </div>

              {showVoiceRecorder && (
                <div className="p-3 bg-gray-50 dark:bg-neutral-950 rounded-xl border border-gray-100 dark:border-neutral-850 animate-in fade-in slide-in-from-bottom-2 duration-150">
                  <div className="flex justify-between items-center px-1 mb-2">
                    <span className="text-[9px] font-bold text-gray-400 dark:text-neutral-500 uppercase tracking-widest">Voice Memo Panel</span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setShowVoiceRecorder(false)}
                      className="h-5 px-1 text-[11px] text-gray-400 hover:text-red-500"
                    >
                      Cancel
                    </Button>
                  </div>
                  <VoiceRecorder 
                    onRecordingComplete={(blob) => sendAdminMedia(new File([blob], 'voice.webm'), 'voice')}
                    disabled={isSending}
                  />
                </div>
              )}
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) sendAdminMedia(file, 'image');
              }}
              accept="image/*" 
              className="hidden" 
            />
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-full bg-gray-50/10 dark:bg-neutral-950/5 p-8 select-none">
          <div className="text-center max-w-xs">
            <div className="w-12 h-12 bg-gray-50 dark:bg-neutral-850 rounded-full flex items-center justify-center mx-auto mb-3">
              <MessageCircle className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-xs font-bold text-gray-900 dark:text-white">Select a conversation</p>
            <p className="text-[11px] text-gray-400 mt-1">Choose an open case from the list to begin chatting.</p>
          </div>
        </div>
      )}
    </Card>
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-2 sm:px-4 py-2 select-none">
      {/* Stats Cards Header */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Total Conversations', value: stats.total, icon: <Users className="w-4 h-4 text-gray-400" /> },
          { label: 'Open Track', value: stats.open, icon: <AlertCircle className="w-4 h-4 text-green-500" /> },
          { label: 'Pending Hold', value: stats.pending, icon: <Clock className="w-4 h-4 text-yellow-500" /> },
          { label: 'Closed Cases', value: stats.closed, icon: <CheckCircle className="w-4 h-4 text-gray-500" /> }
        ].map((card, i) => (
          <Card key={i} className="border-gray-100 dark:border-neutral-900 bg-white dark:bg-neutral-900 shadow-sm">
            <CardContent className="p-3 sm:p-4 flex items-center justify-between">
              <div>
                <p className="text-lg sm:text-xl font-bold tracking-tight">{card.value}</p>
                <p className="text-[10px] sm:text-xs text-gray-400 font-medium truncate max-w-[100px] sm:max-w-none">{card.label}</p>
              </div>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-50 dark:bg-neutral-850 flex items-center justify-center shrink-0">{card.icon}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 2. Dynamic Structural Grid Node */}
      <div className="w-full h-[600px] lg:h-[620px]">
        {isMobile ? (
          // Enforces single-view toggles on mobile screens (No stack possible)
          selectedConversation ? renderChatArea() : renderConversationsList()
        ) : (
          // Renders the verified side-by-side split layout on desktop screens
          <div className="grid grid-cols-3 gap-4 h-full w-full">
            <div className="col-span-1 h-full">{renderConversationsList()}</div>
            <div className="col-span-2 h-full">{renderChatArea()}</div>
          </div>
        )}
      </div>
    </div>
  );
};
