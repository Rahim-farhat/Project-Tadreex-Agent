import mongoose from 'mongoose';
import dns from 'dns';

// Force Node.js to use Google public DNS to resolve MongoDB Atlas SRV records.
// The local network DNS server fails to handle SRV queries correctly.
dns.setServers(['8.8.8.8', '8.8.4.4']);

export const connectDB = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  try {
    await mongoose.connect(uri);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};
