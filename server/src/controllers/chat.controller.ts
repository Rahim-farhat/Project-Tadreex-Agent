import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import Conversation from "../models/Conversation";
import { ChatGroq } from "@langchain/groq";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

let llm: ChatGroq;
const getLlm = () => {
  if (!llm) {
    llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      maxTokens: 1000,
    });
  }
  return llm;
};

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a helpful, friendly and concise assistant."],
  new MessagesPlaceholder("chat_history"),
  ["human", "{input}"],
]);

// GET /api/chat/history  — returns all conversations for the logged-in user
export const getChatHistory = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const conversations = await Conversation.find({ userId: req.user!.id })
    .select("-messages")
    .sort({ updatedAt: -1 });
  res.json(conversations);
};

// POST /api/chat/message  — send a message, get AI reply, persist to DB
export const sendMessage = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { conversationId, content } = req.body;

  if (!content) {
    res.status(400).json({ message: "Message content is required" });
    return;
  }

  let conversation;

  if (conversationId) {
    const query: any = { _id: conversationId };
    if (req.user) query.userId = req.user.id;

    conversation = await Conversation.findOne(query);
    if (!conversation) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }
  } else {
    const payload: any = {
      title: content.substring(0, 40),
      messages: [],
    };
    if (req.user) payload.userId = req.user.id;

    conversation = await Conversation.create(payload);
  }

  // Append user message
  conversation.messages.push({ role: "user", content, timestamp: new Date() });

  // Map previous messages (excluding the new one) to LangChain format
  const previousMessages = conversation.messages.slice(0, -1);
  const chatHistory = previousMessages.map((m) =>
    m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content),
  );

  // Call Groq via LangChain
  const chain = prompt.pipe(getLlm());
  const response = await chain.invoke({
    chat_history: chatHistory,
    input: content,
  });

  const reply = response.content.toString();

  // Append assistant reply
  conversation.messages.push({
    role: "assistant",
    content: reply,
    timestamp: new Date(),
  });
  await conversation.save();

  res.json({ conversationId: conversation.id, reply, conversation });
};
