export interface ConversationNode {
  id: string;
  conversationId: string;
  content: string;
  role: 'user' | 'model';
  timestamp?: number;
  orderIndex?: number;
  isActive?: boolean;
  inDom: boolean;
}
