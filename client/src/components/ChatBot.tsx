import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Fab,
  Paper,
  TextField,
  IconButton,
  Typography,
  CircularProgress,
  Fade,
  Avatar,
  Divider,
} from '@mui/material';
import {
  Chat as ChatIcon,
  Close as CloseIcon,
  Send as SendIcon,
  SmartToy as BotIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { apiRequest } from '@/lib/queryClient';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatBotProps {
  context?: {
    testCases?: any[];
    csvContent?: string;
    selectedIds?: string[];
  };
}

export function ChatBot({ context }: ChatBotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m your FHIR Expert Assistant. I can help you understand FHIR resources, HL7 mappings, and analyze your test cases. What would you like to know?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await apiRequest('POST', '/api/chat', {
        message: input,
        context,
      });

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message || 'I apologize, but I could not generate a response.',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Chat Panel */}
      <Fade in={isOpen}>
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            bottom: 90,
            right: 24,
            width: 400,
            height: 600,
            display: isOpen ? 'flex' : 'none',
            flexDirection: 'column',
            zIndex: 1300,
            borderRadius: 3,
            overflow: 'hidden',
          }}
          data-testid="chat-panel"
        >
          {/* Header */}
          <Box
            sx={{
              p: 2,
              backgroundColor: 'primary.main',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Box display="flex" alignItems="center" gap={1.5}>
              <Avatar sx={{ backgroundColor: 'white', color: 'primary.main' }}>
                <BotIcon />
              </Avatar>
              <Box>
                <Typography variant="h6" fontWeight="600">
                  FHIR Expert
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                  Always here to help
                </Typography>
              </Box>
            </Box>
            <IconButton
              onClick={() => setIsOpen(false)}
              sx={{ color: 'white' }}
              data-testid="button-close-chat"
            >
              <CloseIcon />
            </IconButton>
          </Box>

          {/* Messages */}
          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              p: 2,
              backgroundColor: 'grey.50',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {messages.map((message) => (
              <Box
                key={message.id}
                sx={{
                  display: 'flex',
                  justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                  gap: 1,
                }}
                data-testid={`message-${message.role}`}
              >
                {message.role === 'assistant' && (
                  <Avatar
                    sx={{
                      width: 32,
                      height: 32,
                      backgroundColor: 'primary.main',
                      fontSize: '0.875rem',
                    }}
                  >
                    <BotIcon fontSize="small" />
                  </Avatar>
                )}
                <Paper
                  elevation={1}
                  sx={{
                    p: 1.5,
                    maxWidth: '75%',
                    backgroundColor: message.role === 'user' ? 'primary.main' : 'white',
                    color: message.role === 'user' ? 'white' : 'text.primary',
                    borderRadius: 2,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      lineHeight: 1.6,
                    }}
                  >
                    {message.content}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      display: 'block',
                      mt: 0.5,
                      opacity: 0.7,
                      fontSize: '0.7rem',
                    }}
                  >
                    {message.timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Typography>
                </Paper>
                {message.role === 'user' && (
                  <Avatar
                    sx={{
                      width: 32,
                      height: 32,
                      backgroundColor: 'secondary.main',
                      fontSize: '0.875rem',
                    }}
                  >
                    <PersonIcon fontSize="small" />
                  </Avatar>
                )}
              </Box>
            ))}
            {isLoading && (
              <Box display="flex" gap={1} alignItems="center">
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    backgroundColor: 'primary.main',
                  }}
                >
                  <BotIcon fontSize="small" />
                </Avatar>
                <Paper elevation={1} sx={{ p: 2, borderRadius: 2 }}>
                  <CircularProgress size={16} />
                </Paper>
              </Box>
            )}
            <div ref={messagesEndRef} />
          </Box>

          <Divider />

          {/* Input */}
          <Box sx={{ p: 2, backgroundColor: 'white' }}>
            <Box display="flex" gap={1}>
              <TextField
                fullWidth
                multiline
                maxRows={3}
                placeholder="Ask about FHIR, HL7, or your test cases..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading}
                size="small"
                data-testid="input-chat-message"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                  },
                }}
              />
              <IconButton
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                color="primary"
                sx={{
                  backgroundColor: 'primary.main',
                  color: 'white',
                  '&:hover': {
                    backgroundColor: 'primary.dark',
                  },
                  '&:disabled': {
                    backgroundColor: 'grey.300',
                  },
                }}
                data-testid="button-send-message"
              >
                <SendIcon />
              </IconButton>
            </Box>
          </Box>
        </Paper>
      </Fade>

      {/* Floating Button */}
      <Fab
        color="primary"
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1300,
        }}
        onClick={() => setIsOpen(!isOpen)}
        data-testid="button-chat-toggle"
      >
        {isOpen ? <CloseIcon /> : <ChatIcon />}
      </Fab>
    </>
  );
}
