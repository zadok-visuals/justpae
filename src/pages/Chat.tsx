
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Image, Mic, CheckCheck } from 'lucide-react';
import { VoiceRecorder } from '@/components/chat/VoiceRecorder';
import { AudioPlayer } from '@/components/chat/AudioPlayer';
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
            <div className="mt-1 -mx-2 -mb-2">
              <AudioPlayer 
                src={message.file_url} 
                theme={isCurrentUser ? 'dark' : 'light'} 
                timestamp={messageTime}
                isRead={message.is_read}
                isCurrentUser={isCurrentUser}
                avatarUrl={isCurrentUser ? "https://ui-avatars.com/api/?name=You&background=FF8A00&color=fff" : "https://ui-avatars.com/api/?name=Support&background=111827&color=fff"}
              />
            </div>
          )}
        </div>
        {message.message_type !== 'voice' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 mt-1">
            <span>{messageTime}</span>
            {isCurrentUser && (
              <CheckCheck className={`w-3 h-3 ${message.is_read ? 'text-primary' : 'text-muted-foreground'}`} />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Layout showNavbar={false} fullWidth={true}>
      <div className="h-[100dvh] w-full bg-white dark:bg-gray-900 flex flex-col text-gray-900 dark:text-white relative overflow-hidden">
        {/* Sticky Header */}
        <div className="shrink-0 border-b px-6 py-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md z-10">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Support Chat</h1>
          <p className="text-xs text-gray-500">Typical response time: <span className="text-fintech-orange font-medium">Under 5 mins</span></p>
        </div>

        {/* Scrollable Area - Using native scroll for better mobile feel */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
          {loading ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">
              <div className="animate-pulse">Loading conversation...</div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full opacity-20">
              <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <Send className="w-10 h-10" />
              </div>
              <p className="font-medium">No messages yet</p>
              <p className="text-xs">Start the conversation below</p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto w-full">
              {messages.map(renderMessage)}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </div>

        {/* Bottom Input Section - Sticky at bottom */}
        <div className="shrink-0 p-4 pb-8 md:pb-4 bg-white dark:bg-gray-900 border-t">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2">
              
              {/* Utilities Group (Left) */}
              <div className="flex items-center">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleImageUpload}
                  className="w-10 h-10 rounded-full text-gray-400 hover:text-fintech-orange hover:bg-fintech-orange/5 transition-colors"
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
                      : "text-gray-400 hover:text-fintech-orange hover:bg-fintech-orange/5"
                  }`}
                >
                  <Mic className="w-5 h-5" />
                </Button>
              </div>

              {/* Modern Expanding Input Area */}
              <div className="flex-1 relative flex items-center">
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Type your message..."
                  disabled={isSending}
                  rows={1}
                  className="w-full min-h-[44px] max-h-32 py-3 px-4 pr-12 rounded-[24px] bg-gray-100 dark:bg-gray-800 border-none focus:outline-none focus:ring-2 focus:ring-fintech-orange/20 transition-all text-[15px] text-gray-900 dark:text-white resize-none overflow-y-auto"
                />
                
                {/* Floating Send Button - Perfectly Centered */}
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
                  <Button
                    size="icon"
                    onClick={handleSendMessage}
                    disabled={!messageText.trim() || isSending}
                    className={`w-8 h-8 rounded-full shadow-sm transition-all duration-300 transform ${
                      messageText.trim() 
                        ? "bg-fintech-orange scale-100 opacity-100" 
                        : "bg-gray-300 dark:bg-gray-700 scale-75 opacity-0 pointer-events-none"
                    }`}
                  >
                    <Send className="w-4 h-4 text-white" />
                  </Button>
                </div>
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