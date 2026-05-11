
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Image, Mic, CheckCheck } from 'lucide-react';
import { VoiceRecorder } from '@/components/chat/VoiceRecorder';
import { useChat, ChatMessage } from '@/hooks/useChat';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { formatDistanceToNow } from 'date-fns';
import Layout from '@/components/Layout';

const Chat: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    messages,
    loading,
    getOrCreateConversation,
    sendMessage,
    sendFileMessage,
    fetchMessages,
    markMessagesAsRead
  } = useChat();

  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (user) {
      const initChat = async () => {
        const conversation = await getOrCreateConversation();
        if (conversation) {
          await fetchMessages(conversation.id);
          await markMessagesAsRead(conversation.id);
        }
      };
      initChat();
    }
  }, [user, getOrCreateConversation, fetchMessages, markMessagesAsRead]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || isSending) return;
    setIsSending(true);
    try {
      await sendMessage(messageText);
      setMessageText('');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleImageUpload = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsSending(true);
    try {
      await sendFileMessage(file, 'image');
    } finally {
      setIsSending(false);
    }
  };

  const renderMessage = (message: ChatMessage) => {
    const isCurrentUser = message.sender_id === user?.id;
    const messageTime = formatDistanceToNow(new Date(message.created_at), { addSuffix: true });

    return (
      <div key={message.id} className={`flex flex-col gap-1 mb-6 ${isCurrentUser ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <span>{message.sender_name}</span>
          <span>•</span>
          <span>{messageTime}</span>
          {isCurrentUser && (
            <CheckCheck className={`w-3 h-3 ${message.is_read ? 'text-primary' : 'text-muted-foreground'}`} />
          )}
        </div>
        
        <div className={`max-w-[75%] p-3 rounded-2xl shadow-sm ${
          isCurrentUser
            ? 'bg-fintech-orange text-white rounded-tr-none'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-tl-none'
        }`}>
          {message.message_type === 'text' && <p className="text-[15px] leading-relaxed">{message.content}</p>}
          {message.message_type === 'image' && message.file_url && (
            <img src={message.file_url} alt="Shared" className="max-w-full rounded-lg cursor-pointer" onClick={() => window.open(message.file_url || '', '_blank')} />
          )}
          {message.message_type === 'voice' && message.file_url && (
            <audio controls src={message.file_url} className="w-full h-8" />
          )}
        </div>
      </div>
    );
  };

  return (
    <Layout showNavbar={false} fullWidth={true}>
      <div className="min-h-screen w-full bg-white dark:bg-gray-900 flex flex-col text-white relative overflow-hidden">
        {/* Flat Header */}
        <div className="border-b px-6 py-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Support Chat</h1>
          <p className="text-sm text-gray-500">Chat with our support team</p>
        </div>

        {/* Scrollable Area */}
        <ScrollArea className="flex-1 p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading...</div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full opacity-30">
              <Send className="w-12 h-12 mb-2" />
              <p>No messages yet</p>
            </div>
          ) : (
            <div>
              {messages.map(renderMessage)}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Bottom Input Section - Redesigned */}
        <div className="p-4 bg-white dark:bg-gray-900 border-t backdrop-blur-lg">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-end gap-2">
              
              {/* Utilities Group (Left) */}
              <div className="flex items-center mb-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleImageUpload}
                  className="w-10 h-10 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <Image className="w-5 h-5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowVoiceRecorder(!showVoiceRecorder)}
                  className={`w-10 h-10 rounded-full transition-colors ${
                    showVoiceRecorder 
                      ? "bg-red-50 text-red-500" 
                      : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <Mic className="w-5 h-5" />
                </Button>
              </div>

              {/* Modern Expanding Input Area */}
              <div className="flex-1 relative group">
                <Input
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message..."
                  disabled={isSending}
                  className="w-full min-h-[44px] max-h-32 py-3 px-4 rounded-[22px] bg-gray-100 dark:bg-gray-800 border-none focus-visible:ring-2 focus-visible:ring-fintech-orange/20 transition-all text-sm md:text-base pr-12"
                />
                
                {/* Floating Send Button Inside Input */}
                <Button
                  size="icon"
                  onClick={handleSendMessage}
                  disabled={!messageText.trim() || isSending}
                  className={`absolute right-1 bottom-1 w-9 h-9 rounded-full shadow-md transition-all duration-300 transform ${
                    messageText.trim() 
                      ? "bg-fintech-orange scale-100 opacity-100" 
                      : "bg-gray-300 scale-90 opacity-0 pointer-events-none"
                  }`}
                >
                  <Send className="w-4 h-4 text-white" />
                </Button>
              </div>
            </div>

            {/* Voice Recorder Overlay */}
            {showVoiceRecorder && (
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex justify-between items-center px-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Voice Note</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setShowVoiceRecorder(false)}
                    className="h-6 text-gray-400 hover:text-gray-600"
                  >
                    Cancel
                  </Button>
                </div>
                <VoiceRecorder 
                  onRecordingComplete={(blob) => sendFileMessage(new File([blob], 'voice.webm'), 'voice')} 
                  disabled={isSending} 
                />
              </div>
            )}
          </div>
        </div>

        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
      </div>
    </Layout>
  );
};

export default Chat;