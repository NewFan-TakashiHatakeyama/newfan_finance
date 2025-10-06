import ChatWindow from '@/components/ChatWindow';
import { ChatProvider } from '@/lib/hooks/useChat';
import { Metadata } from 'next';
import { Suspense } from 'react';
import { v4 as uuidv4 } from 'uuid';

export const metadata: Metadata = {
  title: 'Chat - NewFan-Finance',
  description: 'Chat with the internet, chat with NewFan-Finance.',
};

const Home = () => {
  return (
    <div>
      <Suspense>
        <ChatProvider>
          <ChatWindow />
        </ChatProvider>
      </Suspense>
    </div>
  );
};

export default Home;
